import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import PageShell from "../../../components/ui/PageShell";
import { getCaseById } from "../services/cases.service";

// Reuse the same document list service the client page uses
import { listCaseDocuments } from "../../documents/services/documents.service";

// NOTE:
// We call review-link with fetch so we don't depend on where axios instance is.
// If you already have an axios client with auth headers, you can move this into a service later.

export default function LawyerCaseDetailPage() {
  const { caseId } = useParams();
  const navigate = useNavigate();
  const cid = Number(caseId);

  // Backend origin for opening files (/uploads/...)
  const BACKEND_ORIGIN = import.meta.env.VITE_API_ORIGIN || "http://127.0.0.1:8000";

  const getToken = () =>
    localStorage.getItem("access_token") ||
    localStorage.getItem("token") ||
    localStorage.getItem("accessToken") ||
    "";

  const resolveFileUrl = (fileUrl) => {
    if (!fileUrl) return "";
    if (String(fileUrl).startsWith("http")) return fileUrl;
    const origin = BACKEND_ORIGIN.replace(/\/+$/, "");
    const path = String(fileUrl).startsWith("/") ? fileUrl : `/${fileUrl}`;
    return `${origin}${path}`;
  };

  const formatDateTime = (value) => {
    if (!value) return "—";
    try {
      return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(
        new Date(value)
      );
    } catch {
      return String(value);
    }
  };

  // Case
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Docs
  const [documents, setDocuments] = useState([]);
  const [loadingDocs, setLoadingDocs] = useState(true);
  const [docsError, setDocsError] = useState("");

  // Review links (by docId)
  const [reviewLinksByDocId, setReviewLinksByDocId] = useState({});
  const [loadingReviews, setLoadingReviews] = useState(false);

  // Load case
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const res = await getCaseById(cid);
        setData(res);
      } catch (e) {
        const msg =
          e?.response?.data?.detail ||
          e?.response?.data?.message ||
          "Failed to load case.";
        setError(msg);
      } finally {
        setLoading(false);
      }
    };

    if (!Number.isFinite(cid) || cid <= 0) {
      setError("Invalid case id");
      setLoading(false);
      return;
    }

    load();
  }, [cid]);

  // Load documents
  useEffect(() => {
    const loadDocs = async () => {
      if (!Number.isFinite(cid) || cid <= 0) return;

      setLoadingDocs(true);
      setDocsError("");
      try {
        const docRes = await listCaseDocuments(cid);
        const docs = docRes?.data ?? docRes ?? [];
        setDocuments(Array.isArray(docs) ? docs : []);
      } catch (e) {
        setDocuments([]);
        setDocsError(
          e?.response?.data?.detail ||
            e?.response?.data?.message ||
            "Failed to load documents."
        );
      } finally {
        setLoadingDocs(false);
      }
    };

    loadDocs();
  }, [cid]);

  // Load review links for each doc (lawyer can see all)
  useEffect(() => {
    const loadReviewLinks = async () => {
      if (!documents.length) {
        setReviewLinksByDocId({});
        return;
      }

      setLoadingReviews(true);
      try {
        const token = getToken();
        const origin = BACKEND_ORIGIN.replace(/\/+$/, "");

        const pairs = await Promise.all(
          documents.map(async (doc) => {
            const docId = doc.id;
            try {
              const res = await fetch(`${origin}/api/documents/${docId}/review-link`, {
                headers: {
                  Accept: "application/json",
                  Authorization: token ? `Bearer ${token}` : "",
                },
              });

              if (!res.ok) {
                // If forbidden or something, just show empty list for that doc
                return [docId, []];
              }

              const json = await res.json();
              return [docId, Array.isArray(json) ? json : []];
            } catch {
              return [docId, []];
            }
          })
        );

        const next = {};
        for (const [docId, links] of pairs) next[docId] = links;
        setReviewLinksByDocId(next);
      } finally {
        setLoadingReviews(false);
      }
    };

    loadReviewLinks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documents]);

  const caseTitle = useMemo(() => data?.title || `Case #${cid}`, [data?.title, cid]);

  const downloadViaApi = async (docId, filenameHint) => {
    // This will work even when /download needs Authorization (because we attach token)
    const token = getToken();
    const origin = BACKEND_ORIGIN.replace(/\/+$/, "");

    try {
      const res = await fetch(`${origin}/api/documents/${docId}/download`, {
        headers: {
          Authorization: token ? `Bearer ${token}` : "",
        },
      });

      if (!res.ok) throw new Error("Download failed");

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = filenameHint || `document_${docId}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      alert("Download failed (auth or server). For now, use Open if available.");
    }
  };

  return (
    <PageShell
      title={caseTitle}
      subtitle="View case details"
      maxWidth="max-w-5xl"
      contentClassName="space-y-4"
    >
      {loading && <div className="text-slate-300 text-sm">Loading case…</div>}

      {error && !loading && (
        <div className="text-sm text-red-200 border border-red-700 bg-red-900/30 rounded-lg p-3">
          {error}
        </div>
      )}

      {!loading && !error && data && (
        <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-white font-semibold text-lg">{data.title}</div>
            <span className="px-3 py-1 rounded-full text-xs bg-slate-800 border border-slate-700 text-slate-200">
              {data.status || "—"}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div>
              <div className="text-slate-400 text-xs">CATEGORY</div>
              <div className="text-slate-200">{data.category || "—"}</div>
            </div>
            <div>
              <div className="text-slate-400 text-xs">DISTRICT</div>
              <div className="text-slate-200">{data.district || "—"}</div>
            </div>
            <div>
              <div className="text-slate-400 text-xs">CASE ID</div>
              <div className="text-slate-200">{data.id}</div>
            </div>
          </div>

          <div>
            <div className="text-slate-400 text-xs">PUBLIC SUMMARY</div>
            <div className="text-slate-200">{data.summary_public || "—"}</div>
          </div>

          {data.summary_private ? (
            <div>
              <div className="text-slate-400 text-xs">PRIVATE SUMMARY</div>
              <div className="text-slate-200">{data.summary_private}</div>
            </div>
          ) : null}
        </div>
      )}

      {/* Documents */}
      <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-white font-semibold">Case Documents</div>
          <div className="text-xs text-slate-400">
            {loadingDocs ? "Loading…" : `${documents.length} files`}
          </div>
        </div>

        {docsError && !loadingDocs && (
          <div className="text-sm text-red-200 border border-red-700 bg-red-900/30 rounded-lg p-3">
            {docsError}
          </div>
        )}

        {!loadingDocs && !docsError && documents.length === 0 && (
          <div className="text-sm text-slate-300">No documents uploaded yet.</div>
        )}

        {!loadingDocs && documents.length > 0 && (
          <div className="space-y-3">
            {documents.map((doc) => {
              const name =
                doc.title || doc.original_filename || doc.file_name || `Document #${doc.id}`;

              const openHref = resolveFileUrl(doc.file_url || doc.fileUrl || "");

              const links = reviewLinksByDocId[doc.id] || [];

              return (
                <div
                  key={doc.id}
                  className="rounded-xl border border-slate-800 bg-slate-950/30 p-4 space-y-3"
                >
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                    <div>
                      <div className="text-white font-semibold">{name}</div>
                      <div className="text-xs text-slate-400">
                        Uploaded {formatDateTime(doc.created_at || doc.uploaded_at)}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {openHref ? (
                        <a
                          href={openHref}
                          target="_blank"
                          rel="noreferrer"
                          className="px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-xs font-semibold text-white hover:bg-slate-700"
                        >
                          Open
                        </a>
                      ) : (
                        <span className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-400">
                          No file_url
                        </span>
                      )}

                      <button
                        onClick={() => downloadViaApi(doc.id, name)}
                        className="px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-xs font-semibold text-white hover:bg-slate-700"
                      >
                        Download (API)
                      </button>
                    </div>
                  </div>

                  {/* Review Links */}
                  <div className="pt-3 border-t border-slate-800">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-semibold text-white">
                        Apprentice Review Links
                      </div>
                      <div className="text-xs text-slate-500">
                        {loadingReviews ? "Loading…" : ""}
                      </div>
                    </div>

                    {links.length === 0 ? (
                      <div className="text-sm text-slate-300 mt-2">
                        No review links submitted yet.
                      </div>
                    ) : (
                      <div className="mt-2 space-y-2">
                        {links.map((r) => (
                          <div
                            key={r.id ?? `${doc.id}-${r.apprentice_id}-${r.updated_at}`}
                            className="rounded-lg border border-slate-800 bg-slate-900/40 p-3"
                          >
                            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                              <a
                                href={r.review_link}
                                target="_blank"
                                rel="noreferrer"
                                className="text-amber-300 hover:underline text-sm break-all"
                              >
                                {r.review_link}
                              </a>
                              <div className="text-xs text-slate-500">
                                Apprentice #{r.apprentice_id} •{" "}
                                {formatDateTime(r.updated_at || r.created_at)}
                              </div>
                            </div>
                            {r.note ? (
                              <div className="text-sm text-slate-200 mt-2 whitespace-pre-wrap">
                                {r.note}
                              </div>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-sm font-semibold text-white"
        >
          Back
        </button>
      </div>
    </PageShell>
  );
}
