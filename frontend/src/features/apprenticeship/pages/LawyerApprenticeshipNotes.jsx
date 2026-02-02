import { useEffect, useMemo, useState, useRef } from "react";
import {
  fetchLawyerCases,
  fetchCaseNotesForLawyer,
  addLawyerCaseNote,
  fetchCaseDocuments,
  fetchDocumentReviewLinks,
} from "../api/apprenticeshipApi";

const formatDate = (dateStr) => {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr);
    return d.toLocaleString("en-US", {
      month: "short",
      day: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return dateStr;
  }
};

const truncate = (s, n = 90) => {
  if (!s) return "";
  const t = String(s);
  return t.length > n ? t.slice(0, n) + "…" : t;
};

// ----- normalize notes from API -----
const normalizeChatNote = (n) => ({
  kind: "note",
  id: n.id ?? `${n.created_at}-${Math.random()}`,
  text: n.note ?? n.text ?? "",
  createdAt: n.created_at ?? n.createdAt ?? "",
  authorName: n.author_name ?? n.author ?? n.author_full_name ?? "Unknown",
  authorRole: (n.author_role ?? "").toLowerCase(),
  authorId: n.author_id ?? n.user_id ?? null,
});

// ----- convert review-link row to chat message -----
const reviewRowToMessage = (row, docTitle = "Document") => {
  const createdAt = row.updated_at || row.created_at;
  const reviewLink = row.review_link || "";
  const changes = row.note || "";

  return {
    kind: "review",
    id: `review-${row.id}`,
    createdAt,
    authorName: "Review Submission",
    authorRole: "apprentice",
    docTitle,
    reviewLink,
    changes,
    // for reply quoting
    text: `Review submitted for: ${docTitle}\nLink: ${reviewLink}\nChanges: ${
      changes || "-"
    }`,
  };
};

export default function LawyerApprenticeshipNotes() {
  const [cases, setCases] = useState([]);
  const [selectedCaseId, setSelectedCaseId] = useState("");
  const [loadingCases, setLoadingCases] = useState(true);

  const [messages, setMessages] = useState([]);
  const [loadingChat, setLoadingChat] = useState(false);
  const [error, setError] = useState("");

  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);

  // ✅ reply-to state
  const [replyTo, setReplyTo] = useState(null); // { id, authorRole, authorName, text }

  // ✅ auto-scroll anchor
  const bottomRef = useRef(null);

  // ✅ polling (silent refresh, no page reload)
  const pollRef = useRef(null);
  const lastSigRef = useRef("");

  const makeChatSignature = (items) =>
    (items || []).map((m) => `${m.kind}:${m.id}:${m.createdAt}`).join("|");

  // load lawyer cases for dropdown
  useEffect(() => {
    (async () => {
      try {
        setLoadingCases(true);
        const data = await fetchLawyerCases();
        setCases(Array.isArray(data) ? data : []);
      } finally {
        setLoadingCases(false);
      }
    })();
  }, []);

  const selectedCaseLabel = useMemo(() => {
    const found = cases.find(
      (c) => String(c.id ?? c.case_id ?? c.caseId) === String(selectedCaseId)
    );
    if (!found) return "";
    const id = found.id ?? found.case_id ?? found.caseId;
    const title =
      found.title ?? found.case_title ?? found.subject ?? `Case #${id}`;
    const district = found.district ?? "";
    return `${title}${district ? " • " + district : ""}`;
  }, [cases, selectedCaseId]);

  const loadChat = async (showLoader = true) => {
    if (!selectedCaseId) return;

    if (showLoader) setLoadingChat(true);
    setError("");

    try {
      // 1) load notes
      const notesRaw = await fetchCaseNotesForLawyer(selectedCaseId);
      const notes = (Array.isArray(notesRaw) ? notesRaw : []).map(normalizeChatNote);

      // 2) load review submissions as chat messages
      const docsRaw = await fetchCaseDocuments(selectedCaseId);
      const docs = Array.isArray(docsRaw) ? docsRaw : [];

      const reviewMsgsNested = await Promise.all(
        docs.map(async (doc) => {
          try {
            const links = await fetchDocumentReviewLinks(doc.id);
            const rows = Array.isArray(links) ? links : [];
            return rows.map((r) =>
              reviewRowToMessage(r, doc.title || `Document #${doc.id}`)
            );
          } catch {
            return [];
          }
        })
      );

      const reviewMsgs = reviewMsgsNested.flat();

      // 3) merge + sort (oldest -> newest like chat)
      const merged = [...notes, ...reviewMsgs].sort((a, b) => {
        const ta = new Date(a.createdAt || 0).getTime();
        const tb = new Date(b.createdAt || 0).getTime();
        return ta - tb;
      });

      // only update state if changed (prevents jitter while polling)
      const sig = makeChatSignature(merged);
      if (sig !== lastSigRef.current) {
        lastSigRef.current = sig;
        setMessages(merged);
      }
    } catch (e) {
      setError(e?.response?.data?.detail || "Failed to load notes.");
      if (showLoader) setMessages([]);
    } finally {
      if (showLoader) setLoadingChat(false);
    }
  };

  // ✅ start/stop polling when a case is selected
  useEffect(() => {
    // clear old interval
    if (pollRef.current) clearInterval(pollRef.current);

    // reset signature so first load always sets messages
    lastSigRef.current = "";

    // if no case selected, clear chat
    if (!selectedCaseId) {
      setMessages([]);
      setReplyTo(null);
      setError("");
      setLoadingChat(false);
      return;
    }

    // initial load with loader
    loadChat(true);

    // start polling silently
    pollRef.current = setInterval(() => {
      loadChat(false);
    }, 3000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCaseId]);

  // ✅ auto scroll whenever messages update or chat finishes loading
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loadingChat]);

  const buildQuotedText = (replyToMsg) => {
    if (!replyToMsg) return "";
    const who = `${(replyToMsg.authorRole || "user").toUpperCase()} • ${
      replyToMsg.authorName || "Unknown"
    }`;
    const snippet = truncate(replyToMsg.text, 120);
    return `> Replying to ${who}: "${snippet}"\n\n`;
  };

  const sendReply = async () => {
    if (!selectedCaseId) return;
    if (!reply.trim()) return;

    const raw = reply.trim();
    const finalText = replyTo ? buildQuotedText(replyTo) + raw : raw;

    setSending(true);
    setError("");

    try {
      await addLawyerCaseNote(selectedCaseId, finalText);
      setReply("");
      setReplyTo(null);

      // silent refresh after sending
      await loadChat(false);
    } catch (e) {
      setError(e?.response?.data?.detail || "Failed to send reply.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="bg-slate-900/40 border border-slate-700/60 rounded-xl p-6">
        <h1 className="text-3xl font-bold text-white mb-2">Apprenticeship Notes</h1>
        <p className="text-slate-400">Chat-style internal communication (lawyer ↔ apprentice).</p>

        <div className="mt-4 flex flex-col md:flex-row gap-3 items-stretch">
          <select
            value={selectedCaseId}
            onChange={(e) => setSelectedCaseId(e.target.value)}
            className="flex-1 rounded-lg bg-slate-950/30 border border-slate-700/60 px-3 py-2 text-white outline-none focus:border-amber-400/70"
            disabled={loadingCases}
          >
            <option value="">Select a case…</option>
            {cases.map((c) => {
              const id = c.id ?? c.case_id ?? c.caseId;
              const title = c.title ?? c.case_title ?? c.subject ?? `Case #${id}`;
              const district = c.district ?? "";
              const status = c.status ?? "";
              return (
                <option key={id} value={id}>
                  {title} {district ? `• ${district}` : ""} {status ? `• ${status}` : ""}
                </option>
              );
            })}
          </select>

          {/* optional manual reload button */}
          <button
            onClick={() => loadChat(true)}
            disabled={!selectedCaseId || loadingChat}
            className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loadingChat ? "Loading…" : "Reload"}
          </button>
        </div>

        {selectedCaseLabel && (
          <div className="mt-3 text-slate-300 text-sm">
            Selected: <span className="text-white font-medium">{selectedCaseLabel}</span>
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {error}
        </div>
      )}

      {/* Chat Box */}
      <div className="bg-slate-900/40 border border-slate-700/60 rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-white">Conversation</h2>
          <span className="text-slate-400 text-sm">Visible only to lawyers & apprentices</span>
        </div>

        <div className="h-[420px] overflow-y-auto space-y-3 pr-2">
          {!loadingChat && selectedCaseId && messages.length === 0 && (
            <div className="text-slate-400">No messages yet.</div>
          )}
          {loadingChat && <div className="text-slate-300">Loading messages…</div>}

          {messages.map((m) => {
            const isLawyer = (m.authorRole || "").toLowerCase() === "lawyer";
            const bubbleBase =
              "relative group max-w-[85%] rounded-xl border px-4 py-3 text-sm leading-relaxed";

            // review submission card
            if (m.kind === "review") {
              return (
                <div key={m.id} className="flex justify-center">
                  <div className="relative group w-full md:w-[85%] rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
                    {/* hover reply */}
                    <button
                      type="button"
                      onClick={() =>
                        setReplyTo({
                          id: m.id,
                          authorRole: "apprentice",
                          authorName: "Review Submission",
                          text: m.text || `Review submitted for: ${m.docTitle}`,
                        })
                      }
                      className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition text-xs px-2 py-1 rounded-md border border-amber-500/30 bg-slate-900/40 hover:bg-slate-800/40 text-amber-100"
                      title="Reply"
                    >
                      Reply
                    </button>

                    <div className="flex items-center justify-between">
                      <div className="text-amber-200 font-semibold">Review Submission</div>
                      <div className="text-slate-300 text-xs">{formatDate(m.createdAt)}</div>
                    </div>

                    <div className="mt-2 text-slate-200">
                      <div className="text-slate-300 text-xs">Document</div>
                      <div className="font-medium">{m.docTitle}</div>

                      <div className="mt-2 text-slate-300 text-xs">Link</div>
                      <a
                        href={m.reviewLink}
                        target="_blank"
                        rel="noreferrer"
                        className="text-amber-300 hover:underline break-all"
                      >
                        {m.reviewLink}
                      </a>

                      {m.changes ? (
                        <>
                          <div className="mt-2 text-slate-300 text-xs">Changes</div>
                          <div className="text-slate-200 whitespace-pre-wrap">{m.changes}</div>
                        </>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            }

            return (
              <div key={m.id} className={`flex ${isLawyer ? "justify-end" : "justify-start"}`}>
                <div
                  className={`${bubbleBase} ${
                    isLawyer
                      ? "bg-blue-500/10 border-blue-500/30 text-slate-100"
                      : "bg-slate-950/30 border-slate-700/60 text-slate-200"
                  }`}
                >
                  {/* hover reply */}
                  <button
                    type="button"
                    onClick={() =>
                      setReplyTo({
                        id: m.id,
                        authorRole: m.authorRole || (isLawyer ? "lawyer" : "apprentice"),
                        authorName: m.authorName,
                        text: m.text,
                      })
                    }
                    className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition text-xs px-2 py-1 rounded-md border border-slate-600/60 bg-slate-900/60 hover:bg-slate-800/60"
                    title="Reply"
                  >
                    Reply
                  </button>

                  <div className="flex items-center justify-between gap-4 mb-1">
                    <div className="font-semibold text-xs text-slate-300">
                      {isLawyer ? "Lawyer" : "Apprentice"} • {m.authorName}
                    </div>
                    <div className="text-[11px] text-slate-400">{formatDate(m.createdAt)}</div>
                  </div>

                  <div className="whitespace-pre-wrap">{m.text}</div>
                </div>
              </div>
            );
          })}

          {/* auto scroll anchor */}
          <div ref={bottomRef} />
        </div>

        {/* Reply Box */}
        <div className="mt-4 border-t border-slate-700/60 pt-4">
          {/* replying-to banner */}
          {replyTo && (
            <div className="mb-2 rounded-lg border-l-4 border-amber-400 bg-slate-900/60 p-3 text-sm text-slate-200">
              <div className="flex items-center justify-between gap-3">
                <div className="text-xs text-amber-300 font-semibold">
                  Replying to {replyTo.authorRole} • {replyTo.authorName}
                </div>
                <button
                  type="button"
                  className="text-xs text-slate-400 hover:text-white"
                  onClick={() => setReplyTo(null)}
                >
                  ✕
                </button>
              </div>
              <div className="mt-1 text-slate-200 line-clamp-2">
                {truncate(replyTo.text, 160)}
              </div>
            </div>
          )}

          <div className="text-slate-400 text-xs mb-2">Reply as Lawyer</div>
          <textarea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            placeholder="Type a message…"
            className="w-full min-h-[90px] rounded-lg bg-slate-950/30 border border-slate-700/60 p-3 text-white placeholder:text-slate-500 outline-none focus:border-amber-400/70 resize-none"
            disabled={!selectedCaseId || sending}
          />
          <div className="mt-2 flex justify-end">
            <button
              onClick={sendReply}
              disabled={!selectedCaseId || sending || !reply.trim()}
              className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {sending ? "Sending…" : "Send"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
