import { useEffect, useState, useRef, useCallback } from "react";
import { Link, useParams } from "react-router-dom";
import {
  addApprenticeCaseNote,
  fetchApprenticeCaseNotes,
  fetchMyApprenticeCases,
  fetchCaseDocuments,
  fetchDocumentReviewLinks,
  upsertDocumentReviewLink,
  downloadDocument,
} from "../api/apprenticeshipApi";

const normalizeCase = (c) => {
  const caseId = c.case_id ?? c.caseId ?? c.id;
  return {
    caseId,
    title: c.title ?? c.subject ?? c.case_title ?? `Case #${caseId}`,
    category: c.category ?? c.case_category ?? "—",
    supervisingLawyer: c.supervising_lawyer ?? c.lawyer_name ?? c.lawyer ?? "—",
    status: (c.status ?? "active").toLowerCase(),
    districtCity:
      c.district && c.city
        ? `${c.district} / ${c.city}`
        : c.district ?? c.city ?? "—",
    createdDate: c.created_at ?? c.createdAt ?? c.assigned_date ?? "—",
  };
};

const formatDate = (dateStr) => {
  if (!dateStr || dateStr === "—") return "—";
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

const getFileType = (title = "", filePath = "") => {
  const s = `${title} ${filePath}`.toLowerCase();
  if (s.includes(".pdf")) return "PDF";
  if (s.includes(".docx")) return "DOCX";
  if (s.includes(".doc")) return "DOC";
  if (s.includes(".png")) return "PNG";
  if (s.includes(".jpg") || s.includes(".jpeg")) return "JPG";
  return "FILE";
};

// Notes from API -> chat message
const normalizeChatNote = (n) => ({
  kind: "note",
  id: n.id ?? `${n.created_at}-${Math.random()}`,
  text: n.note ?? n.text ?? "",
  createdAt: n.created_at ?? n.createdAt ?? "",
  authorName: n.author_name ?? n.author ?? n.author_full_name ?? "Unknown",
  authorRole: (n.author_role ?? "").toLowerCase(),
  authorId: n.author_id ?? n.user_id ?? null,
});

// Review row -> chat message
const reviewRowToMessage = (row, docTitle = "Document") => {
  const createdAt = row.updated_at || row.created_at || "";
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
    text: `Review submitted for: ${docTitle}\nLink: ${reviewLink}\nChanges: ${
      changes || "-"
    }`,
  };
};

// -------------------- localStorage keys --------------------
const LAST_SEEN_CHAT_TS_KEY = "apprentice_last_seen_chat_ts";
const LAST_NOTIFIED_CHAT_TS_KEY = "apprentice_last_notified_chat_ts";
const UNREAD_CASE_IDS_KEY = "apprentice_unread_case_ids";

// optional: lets other pages update unread badges same-tab
const UNREAD_SYNC_EVENT = "apprentice_unread_sync";

const safeJsonParse = (v, fallback) => {
  try {
    return JSON.parse(v);
  } catch {
    return fallback;
  }
};

// robust: find latest timestamp in a list of messages
const getLatestTs = (items) => {
  let latest = null;
  for (const m of items || []) {
    const ts = m?.createdAt || "";
    if (!ts) continue;
    if (!latest || String(ts) > String(latest)) latest = ts;
  }
  return latest;
};

export default function ApprenticeCaseView() {
  const { caseId } = useParams();

  const [caseData, setCaseData] = useState(null);
  const [loadingCase, setLoadingCase] = useState(true);

  // Documents
  const [documents, setDocuments] = useState([]);
  const [loadingDocs, setLoadingDocs] = useState(true);
  const [docsError, setDocsError] = useState("");

  // Review-link per doc
  const [reviewForm, setReviewForm] = useState({});
  const [loadingReview, setLoadingReview] = useState(false);

  // Chat
  const [messages, setMessages] = useState([]);
  const [loadingChat, setLoadingChat] = useState(true);
  const [chatError, setChatError] = useState("");

  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [replyTo, setReplyTo] = useState(null);

  const bottomRef = useRef(null);
  const pollRef = useRef(null);

  // prevents constant localStorage writes
  const lastMarkedReadRef = useRef("");

  const makeChatSignature = (items) =>
    (items || []).map((m) => `${m.kind}:${m.id}:${m.createdAt}`).join("|");
  const lastSigRef = useRef("");

  const CARD_BASE =
    "bg-slate-900/50 border border-slate-700/60 rounded-2xl p-6 shadow-[0_0_0_1px_rgba(15,23,42,0.35)]";
  const CARD_INSET =
    "bg-slate-950/40 border border-slate-800/60 rounded-xl p-4";

  // ✅ mark read ONLY when latestTs changes
  const markCaseRead = useCallback(
    (latestTs) => {
      const cid = String(caseId);
      if (!cid || !latestTs) return;

      // prevent writing repeatedly if nothing changed
      if (lastMarkedReadRef.current === String(latestTs)) return;
      lastMarkedReadRef.current = String(latestTs);

      // update lastSeen
      const lastSeen = safeJsonParse(
        localStorage.getItem(LAST_SEEN_CHAT_TS_KEY) || "{}",
        {}
      );
      lastSeen[cid] = latestTs;
      localStorage.setItem(LAST_SEEN_CHAT_TS_KEY, JSON.stringify(lastSeen));

      // update lastNotified too (avoid repeat toast for same message)
      const lastNotified = safeJsonParse(
        localStorage.getItem(LAST_NOTIFIED_CHAT_TS_KEY) || "{}",
        {}
      );
      lastNotified[cid] = latestTs;
      localStorage.setItem(LAST_NOTIFIED_CHAT_TS_KEY, JSON.stringify(lastNotified));

      // remove from unread list
      const unread = safeJsonParse(
        localStorage.getItem(UNREAD_CASE_IDS_KEY) || "[]",
        []
      );
      const nextUnread = unread.filter((id) => String(id) !== cid);
      localStorage.setItem(UNREAD_CASE_IDS_KEY, JSON.stringify(nextUnread));

      // notify same-tab listeners (Dashboard / My Cases) immediately
      window.dispatchEvent(new Event(UNREAD_SYNC_EVENT));
    },
    [caseId]
  );

  // ---------------------------------------
  // Case details
  // ---------------------------------------
  useEffect(() => {
    (async () => {
      try {
        const data = await fetchMyApprenticeCases();
        const allCases = Array.isArray(data) ? data : [];
        const found = allCases.find((c) => {
          const id = c.case_id ?? c.caseId ?? c.id;
          return String(id) === String(caseId);
        });
        if (found) setCaseData(normalizeCase(found));
      } finally {
        setLoadingCase(false);
      }
    })();
  }, [caseId]);

  // ---------------------------------------
  // Documents + existing review links
  // ---------------------------------------
  useEffect(() => {
    (async () => {
      try {
        setDocsError("");
        setLoadingDocs(true);

        const data = await fetchCaseDocuments(caseId);
        const docs = Array.isArray(data) ? data : [];
        setDocuments(docs);

        setLoadingReview(true);

        const results = await Promise.all(
          docs.map(async (d) => {
            try {
              const links = await fetchDocumentReviewLinks(d.id);
              const first =
                Array.isArray(links) && links.length > 0 ? links[0] : null;
              return [d.id, first];
            } catch {
              return [d.id, null];
            }
          })
        );

        const init = {};
        for (const [docId, row] of results) {
          init[docId] = {
            review_link: row?.review_link || "",
            note: row?.note || "",
            saving: false,
            error: "",
            success: "",
          };
        }

        setReviewForm(init);
      } catch (e) {
        setDocsError(e?.response?.data?.detail || "Failed to load documents.");
        setDocuments([]);
        setReviewForm({});
      } finally {
        setLoadingDocs(false);
        setLoadingReview(false);
      }
    })();
  }, [caseId]);

  // ---------------------------------------
  // Load chat (notes + review submissions)
  // ---------------------------------------
  const loadChat = useCallback(
    async (showLoader = true) => {
      if (showLoader) setLoadingChat(true);
      setChatError("");

      try {
        // 1) notes
        const notesRaw = await fetchApprenticeCaseNotes(caseId);
        const notes = (Array.isArray(notesRaw) ? notesRaw : []).map(
          normalizeChatNote
        );

        // 2) review submissions (per doc)
        const docsRaw = await fetchCaseDocuments(caseId);
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

        // 3) merge + sort (oldest -> newest)
        const merged = [...notes, ...reviewMsgs].sort((a, b) => {
          const ta = new Date(a.createdAt || 0).getTime();
          const tb = new Date(b.createdAt || 0).getTime();
          return ta - tb;
        });

        // update only if changed
        const sig = makeChatSignature(merged);
        if (sig !== lastSigRef.current) {
          lastSigRef.current = sig;
          setMessages(merged);
        }

        // ✅ mark read based on actual latest timestamp
        const latestTs = getLatestTs(merged);
        if (latestTs) markCaseRead(latestTs);
      } catch (e) {
        setChatError(
          e?.response?.data?.detail ||
            "Unable to load messages. You can still send notes."
        );
        if (showLoader) setMessages([]);
      } finally {
        if (showLoader) setLoadingChat(false);
      }
    },
    [caseId, markCaseRead]
  );

  // ✅ polling
  useEffect(() => {
    loadChat(true);

    pollRef.current = setInterval(() => {
      loadChat(false);
    }, 3000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [loadChat]);

  // ✅ auto-scroll to bottom when messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ---------------------------------------
  // Download doc
  // ---------------------------------------
  const guessExtFromMime = (mime = "") => {
  const m = mime.toLowerCase();
  if (m.includes("pdf")) return "pdf";
  if (m.includes("png")) return "png";
  if (m.includes("jpeg") || m.includes("jpg")) return "jpg";
  if (m.includes("wordprocessingml")) return "docx";
  if (m.includes("msword")) return "doc";
  return "";
};

const hasExtension = (name = "") => /\.[a-z0-9]{2,6}$/i.test(name);

const sanitizeFilename = (name = "") =>
  String(name)
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
    .replace(/\s+/g, " ")
    .trim();

const handleDownload = async (doc) => {
  try {
    const { blob, filename, contentType } = await downloadDocument(doc.id);

    // build best possible name
    const fallbackBase =
      doc.original_filename ||
      doc.file_name ||
      doc.title ||
      doc.file_path?.split("/").pop() ||
      `document-${doc.id}`;

    let finalName = sanitizeFilename(filename || fallbackBase);

    // if no extension, try to add one
    if (!hasExtension(finalName)) {
      // try infer from doc fields first
      const inferredFromDoc =
        (doc.original_filename && doc.original_filename.split(".").pop()) ||
        (doc.title && doc.title.split(".").pop()) ||
        (doc.file_path && doc.file_path.split(".").pop()) ||
        "";

      const extFromDoc = inferredFromDoc && inferredFromDoc.length <= 6 ? inferredFromDoc : "";
      const extFromMime = guessExtFromMime(blob?.type || contentType || "");

      const ext = extFromDoc || extFromMime;
      if (ext) finalName = `${finalName}.${ext}`;
    }

    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = finalName;

    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  } catch (e) {
    alert(e?.response?.data?.detail || "Failed to download document.");
  }
};


  // ---------------------------------------
  // Save review link
  // ---------------------------------------
  const saveReviewLink = async (docId) => {
    const form = reviewForm?.[docId] || { review_link: "", note: "" };
    const review_link = (form.review_link || "").trim();
    const note = (form.note || "").trim();

    setReviewForm((prev) => ({
      ...prev,
      [docId]: { ...(prev[docId] || {}), saving: true, error: "", success: "" },
    }));

    try {
      await upsertDocumentReviewLink(docId, {
        review_link,
        note: note || null,
      });

      setReviewForm((prev) => ({
        ...prev,
        [docId]: {
          ...(prev[docId] || {}),
          saving: false,
          error: "",
          success: "Saved ✅",
        },
      }));

      await loadChat(false);
    } catch (e) {
      setReviewForm((prev) => ({
        ...prev,
        [docId]: {
          ...(prev[docId] || {}),
          saving: false,
          success: "",
          error: e?.response?.data?.detail || "Failed to save review link.",
        },
      }));
    }
  };

  // ---------------------------------------
  // Reply quoting
  // ---------------------------------------
  const buildQuotedText = (replyToMsg) => {
    if (!replyToMsg) return "";
    const who = `${(replyToMsg.authorRole || "user").toUpperCase()} • ${
      replyToMsg.authorName || "Unknown"
    }`;
    const snippet = truncate(replyToMsg.text, 120);
    return `> Replying to ${who}: "${snippet}"\n\n`;
  };

  // ---------------------------------------
  // Send apprentice note
  // ---------------------------------------
  const sendReply = async () => {
    if (!reply.trim()) return;

    const raw = reply.trim();
    const finalText = replyTo ? buildQuotedText(replyTo) + raw : raw;

    setSending(true);
    setChatError("");

    try {
      await addApprenticeCaseNote(caseId, finalText);
      setReply("");
      setReplyTo(null);
      await loadChat(false);
    } catch (e) {
      setChatError(e?.response?.data?.detail || "Failed to send note.");
    } finally {
      setSending(false);
    }
  };

  // ---------------------------------------
  // Render guards
  // ---------------------------------------
  if (loadingCase) {
    return (
      <div className="max-w-6xl mx-auto">
        <div className="rounded-2xl border border-slate-800/60 bg-slate-950/40 py-10 text-center text-slate-300">
          Loading case...
        </div>
      </div>
    );
  }

  if (!caseData) {
    return (
      <div className="space-y-4">
        <Link to="/apprentice/dashboard" className="text-amber-300 hover:underline">
          ← Back to Dashboard
        </Link>
        <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          Case not found.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Back Link */}
      <Link
        to="/apprentice/dashboard"
        className="text-amber-300 hover:underline inline-block"
      >
        ← Back to Dashboard
      </Link>

      {/* Case Title */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-4xl font-bold text-white mb-2 tracking-tight">
            {caseData.title}
          </h1>
          <div className="flex items-center gap-3 text-slate-400">
            <span>Case ID: {caseData.caseId}</span>
            <span className="text-slate-600">•</span>
            <span>{caseData.category}</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span
            className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${
              caseData.status === "active" ||
              (!caseData.status.includes("closed") &&
                !caseData.status.includes("completed"))
                ? "bg-amber-500/15 text-amber-200 border border-amber-500/30"
                : "bg-slate-700/40 text-slate-300 border border-slate-600/60"
            }`}
          >
            {caseData.status === "active" ||
            (!caseData.status.includes("closed") &&
              !caseData.status.includes("completed"))
              ? "Active"
              : "Closed"}
          </span>
          <button
            onClick={() => loadChat(false)}
            className="px-3 py-2 rounded-lg bg-slate-900/40 border border-slate-700/60 text-slate-200 text-sm hover:bg-slate-800/50"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Case Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-slate-900/50 border border-slate-700/60 rounded-2xl p-5 shadow-[0_0_0_1px_rgba(15,23,42,0.35)]">
          <div className="text-xs text-slate-400 mb-1">Documents</div>
          <div className="text-2xl font-semibold text-white">
            {loadingDocs ? "—" : documents.length}
          </div>
        </div>
        <div className="bg-slate-900/50 border border-slate-700/60 rounded-2xl p-5 shadow-[0_0_0_1px_rgba(15,23,42,0.35)]">
          <div className="text-xs text-slate-400 mb-1">Reviews Linked</div>
          <div className="text-2xl font-semibold text-white">
            {loadingDocs
              ? "—"
              : documents.filter((d) => (reviewForm?.[d.id]?.review_link || "").trim())
                  .length}
          </div>
        </div>
        <div className="bg-slate-900/50 border border-slate-700/60 rounded-2xl p-5 shadow-[0_0_0_1px_rgba(15,23,42,0.35)]">
          <div className="text-xs text-slate-400 mb-1">Messages</div>
          <div className="text-2xl font-semibold text-white">
            {loadingChat ? "—" : messages.length}
          </div>
        </div>
        <div className="bg-slate-900/50 border border-slate-700/60 rounded-2xl p-5 shadow-[0_0_0_1px_rgba(15,23,42,0.35)]">
          <div className="text-xs text-slate-400 mb-1">Last Update</div>
          <div className="text-2xl font-semibold text-white">
            {loadingChat
              ? "—"
              : messages.length
              ? formatDate(messages[messages.length - 1].createdAt)
              : "—"}
          </div>
        </div>
      </div>

      {/* Case Summary */}
      <div className={CARD_BASE}>
        <h2 className="text-xl font-semibold text-white mb-4">Case Summary</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <div>
            <div className="text-slate-400 text-sm mb-1">Case ID</div>
            <div className="text-white font-medium">{caseData.caseId}</div>
          </div>
          <div>
            <div className="text-slate-400 text-sm mb-1">Status</div>
            <span
              className={`inline-block px-2 py-1 rounded-full text-xs font-medium ${
                caseData.status === "active" ||
                (!caseData.status.includes("closed") &&
                  !caseData.status.includes("completed"))
                  ? "bg-amber-500/15 text-amber-200 border border-amber-500/30"
                  : "bg-slate-700/40 text-slate-300 border border-slate-600/60"
              }`}
            >
              {caseData.status === "active" ||
              (!caseData.status.includes("closed") &&
                !caseData.status.includes("completed"))
                ? "Active"
                : "Closed"}
            </span>
          </div>
          <div>
            <div className="text-slate-400 text-sm mb-1">Category</div>
            <div className="text-white font-medium">{caseData.category}</div>
          </div>
          <div>
            <div className="text-slate-400 text-sm mb-1">Assigned Lawyer</div>
            <div className="text-white font-medium">{caseData.supervisingLawyer}</div>
          </div>
          <div>
            <div className="text-slate-400 text-sm mb-1">District / City</div>
            <div className="text-white font-medium">{caseData.districtCity}</div>
          </div>
          <div>
            <div className="text-slate-400 text-sm mb-1">Created Date</div>
            <div className="text-white font-medium">{caseData.createdDate}</div>
          </div>
        </div>
      </div>

      {/* Case Documents */}
      <div className={CARD_BASE}>
        <h2 className="text-xl font-semibold text-white mb-4">Case Documents</h2>

        {loadingDocs && (
          <div className="rounded-xl border border-slate-800/60 bg-slate-950/40 py-6 text-center text-slate-300">
            Loading documents...
          </div>
        )}

        {!loadingDocs && docsError && (
          <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            {docsError}
          </div>
        )}

        {!loadingDocs && !docsError && documents.length === 0 && (
          <div className="rounded-xl border border-slate-800/60 bg-slate-950/40 py-6 text-center text-slate-300">
            No documents uploaded yet.
          </div>
        )}

        {!loadingDocs && !docsError && documents.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {documents.map((doc) => {
              const type = getFileType(doc.title, doc.file_path);
              const viewUrl = doc.file_url
                ? `http://127.0.0.1:8000${doc.file_url}`
                : null;

              const form = reviewForm?.[doc.id] || {
                review_link: "",
                note: "",
                saving: false,
                error: "",
                success: "",
              };

              return (
                <div
                  key={doc.id}
                  className="p-4 bg-slate-950/40 border border-slate-700/60 rounded-xl shadow-[0_0_0_1px_rgba(15,23,42,0.3)]"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="text-amber-300 text-2xl">📄</div>
                      <div>
                        <div className="text-white font-medium">
                          {doc.title || `Document #${doc.id}`}
                        </div>
                        <div className="text-slate-400 text-sm">
                          {type} - Uploaded {formatDate(doc.uploaded_at)}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => viewUrl && window.open(viewUrl, "_blank")}
                        disabled={!viewUrl}
                        className={`p-2 rounded ${
                          viewUrl
                            ? "hover:bg-slate-800/60 text-slate-200"
                            : "text-slate-500 cursor-not-allowed"
                        }`}
                        title="View"
                      >
                        👁️
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDownload(doc)}
                        className="p-2 rounded hover:bg-slate-800/60 text-slate-200"
                        title="Download"
                      >
                        ⬇️
                      </button>
                    </div>
                  </div>

                  {/* Review Link Submit */}
                  <div className="mt-4">
                    <div className="text-slate-400 text-xs mb-2">
                      Upload your edited file somewhere (Mediafire/Drive/etc.) and paste
                      the public link:
                    </div>

                    {loadingReview && (
                      <div className="text-slate-400 text-sm mb-2">
                        Loading review link...
                      </div>
                    )}

                    <input
                      value={form.review_link || ""}
                      onChange={(e) =>
                        setReviewForm((prev) => ({
                          ...prev,
                          [doc.id]: {
                            ...(prev[doc.id] || {}),
                            review_link: e.target.value,
                            success: "",
                            error: "",
                          },
                        }))
                      }
                      placeholder="https://..."
                      className="w-full rounded-lg bg-slate-950/40 border border-slate-700/60 px-3 py-2 text-white placeholder:text-slate-500 outline-none focus:border-amber-400/70 focus:ring-1 focus:ring-amber-400/30"
                    />

                    <textarea
                      value={form.note || ""}
                      onChange={(e) =>
                        setReviewForm((prev) => ({
                          ...prev,
                          [doc.id]: {
                            ...(prev[doc.id] || {}),
                            note: e.target.value,
                            success: "",
                            error: "",
                          },
                        }))
                      }
                      placeholder="What changed? (optional note for lawyer)"
                      className="mt-2 w-full min-h-[70px] rounded-lg bg-slate-950/40 border border-slate-700/60 p-3 text-white placeholder:text-slate-500 outline-none focus:border-amber-400/70 focus:ring-1 focus:ring-amber-400/30 resize-none"
                    />

                    <div className="mt-2 flex items-center justify-between">
                      <div className="text-xs">
                        {form.error && <span className="text-rose-300">{form.error}</span>}
                        {!form.error && form.success && (
                          <span className="text-amber-200">{form.success}</span>
                        )}
                      </div>

                      <button
                        onClick={() => saveReviewLink(doc.id)}
                        disabled={form.saving || !(form.review_link || "").trim()}
                        className="px-3 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-white text-sm font-medium shadow-[0_8px_20px_rgba(245,158,11,0.2)] disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {form.saving ? "Saving..." : "Save Link"}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Conversation */}
      <div className={CARD_BASE}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-white">Conversation</h2>
          <span className="text-slate-400 text-sm">
            Visible only to lawyers & apprentices
          </span>
        </div>

        {chatError && (
          <div className="mb-4 rounded-lg border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            {chatError}
          </div>
        )}

        <div className={`${CARD_INSET} h-[420px] overflow-y-auto space-y-3 pr-2`}>
          {loadingChat && <div className="text-slate-300">Loading messages…</div>}

          {!loadingChat && messages.length === 0 && (
            <div className="text-slate-400">No messages yet.</div>
          )}

          {messages.map((m) => {
            const isYou = (m.authorRole || "").toLowerCase() === "apprentice";
            const bubbleBase =
              "relative group max-w-[85%] rounded-xl border px-4 py-3 text-sm leading-relaxed";

            if (m.kind === "review") {
              return (
                <div key={m.id} className="flex justify-center">
                  <div className="relative group w-full md:w-[85%] rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 shadow-[0_0_0_1px_rgba(245,158,11,0.1)]">
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
              <div key={m.id} className={`flex ${isYou ? "justify-end" : "justify-start"}`}>
                <div
                  className={`${bubbleBase} ${
                    isYou
                      ? "bg-amber-500/10 border-amber-500/30 text-slate-100"
                      : "bg-slate-950/40 border-slate-700/60 text-slate-200"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() =>
                      setReplyTo({
                        id: m.id,
                        authorRole: m.authorRole || (isYou ? "apprentice" : "lawyer"),
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
                      {isYou ? "You" : "Lawyer"} • {m.authorName}
                    </div>
                    <div className="text-[11px] text-slate-400">{formatDate(m.createdAt)}</div>
                  </div>

                  <div className="whitespace-pre-wrap">{m.text}</div>
                </div>
              </div>
            );
          })}

          <div ref={bottomRef} />
        </div>

        {/* Reply Box */}
        <div className="mt-4 border-t border-slate-700/60 pt-4">
          {replyTo && (
            <div className="mb-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-slate-200">
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

          <div className="text-slate-400 text-xs mb-2">Reply as Apprentice</div>
          <textarea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            placeholder="Type a message…"
            className="w-full min-h-[90px] rounded-lg bg-slate-950/40 border border-slate-700/60 p-3 text-white placeholder:text-slate-500 outline-none focus:border-amber-400/70 focus:ring-1 focus:ring-amber-400/30 resize-none"
            disabled={sending}
          />
          <div className="mt-2 flex justify-end">
            <button
              onClick={sendReply}
              disabled={sending || !reply.trim()}
              className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-white font-medium shadow-[0_8px_20px_rgba(245,158,11,0.2)] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {sending ? "Sending…" : "Send"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
