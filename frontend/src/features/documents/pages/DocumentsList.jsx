// frontend/src/features/documents/pages/DocumentsList.jsx
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import {
  createDocumentComment,
  deleteDocument,
  getBookingDocuments,
  listDocumentComments,
} from "../services/documents.service";
import { getRole } from "../../../services/auth";

const BACKEND_ORIGIN =
  import.meta.env.VITE_API_ORIGIN || "http://127.0.0.1:8000";

const resolveFileUrl = (fileUrl) => {
  if (!fileUrl) return "";
  if (fileUrl.startsWith("http")) return fileUrl;
  return `${BACKEND_ORIGIN}${fileUrl}`;
};

const formatDateTime = (value) => {
  if (!value) return "-";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
};

const roleBadgeStyles = {
  client: "bg-sky-500/10 text-sky-200 border border-sky-500/40",
  lawyer: "bg-amber-500/10 text-amber-200 border border-amber-500/40",
  admin: "bg-purple-500/10 text-purple-200 border border-purple-500/40",
  unknown: "bg-slate-700/60 text-slate-200 border border-slate-600",
};

const statusStyles = {
  reviewed: "bg-emerald-500/10 text-emerald-200 border border-emerald-500/40",
  needs_action: "bg-rose-500/10 text-rose-200 border border-rose-500/40",
  new: "bg-slate-700/60 text-slate-200 border border-slate-600",
};

const getStatusFromComment = (text = "") => {
  const trimmed = text.trim().toLowerCase();
  if (trimmed.startsWith("[reviewed]")) return "reviewed";
  if (trimmed.startsWith("[needs_action]")) return "needs_action";
  return "new";
};

const stripStatusTag = (text = "") =>
  text.replace(/^\[(reviewed|needs_action)\]\s*/i, "");

export default function DocumentsList() {
  const { bookingId } = useParams();
  const location = useLocation();

  const bookingIdNum = useMemo(() => Number(bookingId), [bookingId]);
  const hasValidBookingId = Number.isFinite(bookingIdNum) && bookingIdNum > 0;

  const [docs, setDocs] = useState([]);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState(null);

  const [selectedDoc, setSelectedDoc] = useState(null);
  const [comments, setComments] = useState([]);
  const [commentText, setCommentText] = useState("");
  const [commentStatus, setCommentStatus] = useState("reviewed");
  const [commentLoading, setCommentLoading] = useState(false);
  const [commentError, setCommentError] = useState("");
  const [commentSaving, setCommentSaving] = useState(false);

  const role = useMemo(
    () => (getRole() || localStorage.getItem("role") || "").toLowerCase(),
    []
  );

  const basePath = location.pathname.startsWith("/lawyer")
    ? "/lawyer"
    : "/client";

  const canComment = role === "lawyer" || role === "admin";

  const load = async () => {
    setLoading(true);
    setErr("");

    if (!hasValidBookingId) {
      setDocs([]);
      setSelectedDoc(null);
      setComments([]);
      setLoading(false);
      setErr("Invalid booking id in URL.");
      return;
    }

    try {
      const res = await getBookingDocuments(bookingIdNum); // axios response
      const data = res?.data || [];
      setDocs(Array.isArray(data) ? data : []);

      // keep selection consistent
      if (selectedDoc?.id) {
        const stillThere = (Array.isArray(data) ? data : []).find(
          (d) => d.id === selectedDoc.id
        );
        setSelectedDoc(stillThere || null);
      }
    } catch (e) {
      const status = e?.response?.status;
      if (status === 401) setErr("Unauthorized. Please login again.");
      else if (status === 403)
        setErr("Not allowed to view documents for this booking.");
      else setErr(e?.response?.data?.detail || "Failed to load documents");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingIdNum]);

  useEffect(() => {
    const fetchComments = async () => {
      if (!selectedDoc?.id) return;
      setCommentLoading(true);
      setCommentError("");

      try {
        const res = await listDocumentComments(selectedDoc.id);
        setComments(res?.data || []);
      } catch (e) {
        const status = e?.response?.status;
        if (status === 401) setCommentError("Unauthorized. Please login again.");
        else if (status === 403) setCommentError("Not allowed to view comments.");
        else setCommentError(e?.response?.data?.detail || "Failed to load comments");
      } finally {
        setCommentLoading(false);
      }
    };

    fetchComments();
  }, [selectedDoc?.id]);

  const onDelete = async (doc) => {
    setErr("");
    if (!doc?.id) return;

    const ok = window.confirm(
      `Delete "${doc.title || "Untitled"}"? This will remove the file too.`
    );
    if (!ok) return;

    try {
      setDeletingId(doc.id);
      await deleteDocument(doc.id);

      setDocs((prev) => prev.filter((x) => x.id !== doc.id));
      if (selectedDoc?.id === doc.id) {
        setSelectedDoc(null);
        setComments([]);
        setCommentText("");
        setCommentError("");
      }
    } catch (e) {
      const status = e?.response?.status;
      if (status === 401) setErr("Unauthorized. Please login again.");
      else if (status === 403) setErr("Not allowed to delete this document.");
      else setErr(e?.response?.data?.detail || "Failed to delete document");
    } finally {
      setDeletingId(null);
    }
  };

  const onSelect = (doc) => {
    setSelectedDoc(doc);
    setComments([]);
    setCommentText("");
    setCommentStatus("reviewed");
    setCommentError("");
  };

  const onSubmitComment = async (e) => {
    e.preventDefault();
    if (!selectedDoc?.id) return;

    const trimmed = commentText.trim();
    if (!trimmed) {
      setCommentError("Comment cannot be empty.");
      return;
    }

    setCommentSaving(true);
    setCommentError("");

    try {
      const taggedComment = `[${commentStatus}] ${trimmed}`;
      await createDocumentComment(selectedDoc.id, taggedComment);
      setCommentText("");

      const res = await listDocumentComments(selectedDoc.id);
      setComments(res?.data || []);
      await load();
    } catch (e2) {
      const status = e2?.response?.status;
      if (status === 401) setCommentError("Unauthorized. Please login again.");
      else if (status === 403) setCommentError("Only lawyers/admins can comment.");
      else setCommentError(e2?.response?.data?.detail || "Failed to add comment");
    } finally {
      setCommentSaving(false);
    }
  };

  const renderDocCard = (doc) => {
    const fileUrl = resolveFileUrl(
      doc.file_url || doc.fileUrl || doc.path || doc.url || doc.file_path || ""
    );

    const statusKey = doc.latest_comment?.comment_text
      ? getStatusFromComment(doc.latest_comment.comment_text)
      : "new";

    const statusLabel =
      statusKey === "needs_action"
        ? "Needs action"
        : statusKey === "reviewed"
        ? "Reviewed"
        : "New";

    const statusClass = statusStyles[statusKey] || statusStyles.new;
    const commentCount = Number(doc.comment_count || 0);

    const uploaderRole = (
      doc.uploaded_by_role ||
      doc.latest_comment?.created_by_role ||
      ""
    ).toLowerCase();

    const roleLabel = uploaderRole || "unknown";
    const roleClass = roleBadgeStyles[roleLabel] || roleBadgeStyles.unknown;

    return (
      <button
        key={doc.id}
        onClick={() => onSelect(doc)}
        className={`w-full text-left border rounded-xl p-4 transition-colors ${
          selectedDoc?.id === doc.id
            ? "border-amber-400 bg-amber-500/10"
            : "border-slate-800 bg-slate-900/60 hover:border-slate-700"
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-white font-semibold text-lg truncate">
              {doc.title || "Untitled"}
            </div>
            <div className="text-xs text-slate-400 mt-1">
              Uploaded {formatDateTime(doc.uploaded_at || doc.created_at)}
            </div>
          </div>
          <span className={`px-2 py-1 text-xs rounded-full ${statusClass}`}>
            {statusLabel}
          </span>
        </div>

        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <span className={`px-2 py-1 rounded-full ${roleClass}`}>
            Latest by: {roleLabel}
          </span>
          <span className="px-2 py-1 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
            {commentCount} comments
          </span>
        </div>

        <div className="mt-3 text-sm text-slate-400 truncate">
          {doc.latest_comment?.comment_text
            ? `Latest: ${doc.latest_comment.comment_text}`
            : "No comments yet."}
        </div>

        <div className="mt-3 flex items-center gap-3 text-sm">
          <a
            href={fileUrl}
            onClick={(e) => e.stopPropagation()}
            target="_blank"
            rel="noreferrer"
            className="text-amber-300 hover:text-amber-200"
          >
            Open file
          </a>
          <span className="text-slate-500">ID #{doc.id}</span>
        </div>
      </button>
    );
  };

  const selectedFileUrl = selectedDoc
    ? resolveFileUrl(
        selectedDoc.file_url ||
          selectedDoc.fileUrl ||
          selectedDoc.path ||
          selectedDoc.url ||
          selectedDoc.file_path ||
          ""
      )
    : "";

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-amber-300">
              Documents
            </p>
            <h1 className="text-3xl font-bold">
              Booking {hasValidBookingId ? bookingIdNum : bookingId || "N/A"}
            </h1>
            <p className="text-slate-400 text-sm">
              Upload evidence, share files, and keep a running record of updates.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              to={`${basePath}/bookings/${bookingIdNum}/documents/upload`}
              className={`px-4 py-2 rounded-lg font-semibold ${
                hasValidBookingId
                  ? "bg-amber-500 hover:bg-amber-600 text-slate-950"
                  : "bg-slate-700 text-slate-300 pointer-events-none opacity-60"
              }`}
            >
              Upload Document
            </Link>
            <Link
              to={`${basePath}/bookings/${bookingIdNum}`}
              className="px-4 py-2 rounded-lg border border-slate-700 bg-slate-900/70 hover:bg-slate-800 text-sm"
            >
              Back to booking
            </Link>
          </div>
        </div>

        {err && (
          <div className="bg-red-900/40 border border-red-700 p-3 rounded">
            {err}
          </div>
        )}

        {loading && <div className="text-slate-400">Loading documents...</div>}

        {!loading && docs.length === 0 && !err && (
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-6 text-center">
            <div className="text-lg font-semibold">No documents yet</div>
            <div className="text-slate-400 text-sm mt-1">
              Upload a file to start your case record.
            </div>
          </div>
        )}

        {!loading && docs.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_0.9fr] gap-6">
            <div className="space-y-3">{docs.map(renderDocCard)}</div>

            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 h-fit sticky top-6">
              {selectedDoc ? (
                <div className="space-y-4">
                  <div>
                    <div className="text-lg font-semibold text-white">
                      {selectedDoc.title || "Untitled"}
                    </div>
                    <div className="text-xs text-slate-400">
                      Uploaded{" "}
                      {formatDateTime(
                        selectedDoc.uploaded_at || selectedDoc.created_at
                      )}
                    </div>
                  </div>

                  <div className="bg-slate-950/60 border border-slate-800 rounded-xl overflow-hidden">
                    <iframe
                      title="Document preview"
                      src={selectedFileUrl}
                      className="w-full h-64"
                    />
                    <div className="flex items-center justify-between px-3 py-2 text-xs text-slate-400 bg-slate-900/70">
                      <span>Preview</span>
                      <a
                        href={selectedFileUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-amber-300 hover:text-amber-200"
                      >
                        Open in new tab
                      </a>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-semibold">Comments</div>
                      <div className="text-xs text-slate-400">
                        {comments.length} total
                      </div>
                    </div>

                    {commentError && (
                      <div className="text-xs text-red-300 bg-red-900/30 border border-red-700 rounded px-2 py-1">
                        {commentError}
                      </div>
                    )}

                    {commentLoading ? (
                      <div className="text-slate-400 text-sm">
                        Loading comments...
                      </div>
                    ) : comments.length === 0 ? (
                      <div className="text-slate-400 text-sm">
                        No comments yet.
                      </div>
                    ) : (
                      <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                        {comments.map((c) => {
                          const r = (c.created_by_role || "unknown").toLowerCase();
                          const badge =
                            roleBadgeStyles[r] || roleBadgeStyles.unknown;
                          const statusKey = getStatusFromComment(c.comment_text);
                          const statusBadge =
                            statusStyles[statusKey] || statusStyles.new;

                          return (
                            <div
                              key={c.id}
                              className="bg-slate-950/60 border border-slate-800 rounded-lg p-3"
                            >
                              <div className="text-xs text-slate-400 flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2">
                                  <span
                                    className={`px-2 py-0.5 rounded-full border capitalize ${badge}`}
                                  >
                                    {c.created_by_role || "Unknown"}
                                  </span>
                                  <span
                                    className={`px-2 py-0.5 rounded-full border ${statusBadge}`}
                                  >
                                    {statusKey.replace("_", " ")}
                                  </span>
                                </div>
                                <span>{formatDateTime(c.created_at)}</span>
                              </div>
                              <div className="text-sm text-slate-100 mt-2">
                                {stripStatusTag(c.comment_text)}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {canComment && (
                      <form onSubmit={onSubmitComment} className="space-y-2">
                        <div className="flex items-center gap-2 text-xs text-slate-300">
                          <span>Status</span>
                          <select
                            value={commentStatus}
                            onChange={(e) => setCommentStatus(e.target.value)}
                            className="rounded bg-slate-950/70 border border-slate-800 px-2 py-1 text-xs"
                          >
                            <option value="reviewed">Reviewed</option>
                            <option value="needs_action">Needs action</option>
                          </select>
                        </div>
                        <textarea
                          value={commentText}
                          onChange={(e) => setCommentText(e.target.value)}
                          rows={3}
                          placeholder="Add a comment for the client..."
                          className="w-full rounded-lg bg-slate-950/70 border border-slate-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                        />
                        <button
                          type="submit"
                          disabled={commentSaving}
                          className="w-full px-3 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-slate-950 text-sm font-semibold disabled:opacity-60"
                        >
                          {commentSaving ? "Saving..." : "Post Comment"}
                        </button>
                      </form>
                    )}

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => onDelete(selectedDoc)}
                        disabled={deletingId === selectedDoc.id}
                        className="px-3 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-sm font-semibold disabled:opacity-60"
                      >
                        {deletingId === selectedDoc.id
                          ? "Deleting..."
                          : "Delete"}
                      </button>
                      <a
                        href={selectedFileUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-sm"
                      >
                        Download
                      </a>
                    </div>

                    {!canComment && (
                      <div className="text-xs text-slate-500">
                        Only lawyers/admins can post comments.
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="text-slate-400 text-sm">
                  Select a document to preview and view comments.
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
