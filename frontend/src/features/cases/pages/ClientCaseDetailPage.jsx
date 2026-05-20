import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";

import { getCaseById, getUserById } from "../services/cases.service";
import { listBookingsByCaseId } from "../../../services/bookings";
import {
  listCaseDocuments,
  uploadCaseDocument,
} from "../../documents/services/documents.service";

import CaseRequestsPanel from "../components/CaseRequestsPanel";

// If you already have PageShell elsewhere, keep this import.
// If your project uses a different path/name, adjust it.
import PageShell from "../../../components/PageShell";

// ---------------- helpers ----------------
function formatDateTime(value) {
  if (!value) return "-";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return String(value);
  }
}

function resolveFileUrl(path) {
  if (!path) return "";
  // If already absolute (http or https), keep as-is
  if (/^https?:\/\//i.test(path)) return path;

  // Backend serves uploads at /uploads (per your FastAPI main.py)
  // If your backend uses a different base, adjust accordingly.
  const base = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";
  // Ensure no double slashes
  if (path.startsWith("/")) return `${base}${path}`;
  return `${base}/${path}`;
}

export default function ClientCaseDetailPage() {
  const { caseId } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const cid = Number(caseId);

  // ---------------- main data ----------------
  const [data, setData] = useState(null);
  const [lawyer, setLawyer] = useState(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // ---------------- documents ----------------
  const [documents, setDocuments] = useState([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [docsError, setDocsError] = useState("");

  const [uploadFile, setUploadFile] = useState(null);
  const [uploadName, setUploadName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadErr, setUploadErr] = useState("");
  const [uploadOk, setUploadOk] = useState("");

  // ---------------- bookings ----------------
  const [bookings, setBookings] = useState([]);
  const [bookingsLoading, setBookingsLoading] = useState(false);
  const [bookingsError, setBookingsError] = useState("");

  const [bookingFilter, setBookingFilter] = useState("All"); // All | Upcoming | Past
  const [bookingStatusFilter, setBookingStatusFilter] = useState("All");
  const [bookingSort, setBookingSort] = useState("Newest"); // Newest | Oldest

  // ---------------- tabs ----------------
  const allowedTabs = ["overview", "documents", "bookings", "requests"];
  const normalizeTab = (value) =>
    allowedTabs.includes(value) ? value : "overview";

  const [activeTab, setActiveTab] = useState(() =>
    normalizeTab(searchParams.get("tab"))
  );

  useEffect(() => {
    setActiveTab(normalizeTab(searchParams.get("tab")));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const setTab = (tabId) => {
    const next = normalizeTab(tabId);
    setActiveTab(next);
    const params = new URLSearchParams(searchParams);
    params.set("tab", next);
    setSearchParams(params);
  };

  // ---------------- load case ----------------
  useEffect(() => {
    const load = async () => {
      if (!Number.isFinite(cid)) return;

      setLoading(true);
      setError("");

      try {
        const res = await getCaseById(cid);
        setData(res);

        // If case has selected lawyer id, try fetch lawyer user profile
        if (res?.selected_lawyer_id) {
          try {
            const lawyerRes = await getUserById(res.selected_lawyer_id);
            setLawyer(lawyerRes);
          } catch {
            setLawyer(null);
          }
        } else {
          setLawyer(null);
        }
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

    load();
  }, [cid]);

  // ---------------- load docs ----------------
  useEffect(() => {
    const loadDocs = async () => {
      if (!Number.isFinite(cid)) return;
      setDocsLoading(true);
      setDocsError("");

      try {
        const docRes = await listCaseDocuments(cid);
        const docs = docRes?.data ?? docRes ?? [];
        setDocuments(Array.isArray(docs) ? docs : []);
      } catch (e) {
        setDocsError(
          e?.response?.data?.detail ||
            e?.response?.data?.message ||
            "Failed to load documents."
        );
      } finally {
        setDocsLoading(false);
      }
    };

    loadDocs();
  }, [cid]);

  // ---------------- load bookings ----------------
  useEffect(() => {
    const loadBookings = async () => {
      if (!Number.isFinite(cid)) return;
      setBookingsLoading(true);
      setBookingsError("");

      try {
        const res = await listBookingsByCaseId(cid);
        const list = res?.data ?? res ?? [];
        setBookings(Array.isArray(list) ? list : []);
      } catch (e) {
        setBookingsError(
          e?.response?.data?.detail ||
            e?.response?.data?.message ||
            "Failed to load bookings."
        );
      } finally {
        setBookingsLoading(false);
      }
    };

    loadBookings();
  }, [cid]);

  // ---------------- upload ----------------
  const handleUpload = async (e) => {
    e.preventDefault();
    if (!uploadFile || !Number.isFinite(cid)) return;

    setUploading(true);
    setUploadErr("");
    setUploadOk("");

    try {
      await uploadCaseDocument({
        caseId: cid,
        fileName: uploadName,
        file: uploadFile,
      });

      setUploadOk("Document uploaded successfully.");
      setUploadFile(null);
      setUploadName("");

      // refresh docs
      const docRes = await listCaseDocuments(cid);
      const docs = docRes?.data ?? docRes ?? [];
      setDocuments(Array.isArray(docs) ? docs : []);
    } catch (e2) {
      setUploadErr(
        e2?.response?.data?.detail ||
          e2?.response?.data?.message ||
          "Failed to upload document."
      );
    } finally {
      setUploading(false);
    }
  };

  // ---------------- computed ----------------
  const now = useMemo(() => new Date(), []);

  const upcomingBooking = useMemo(() => {
    const list = bookings
      .filter((b) => b?.scheduled_at)
      .map((b) => ({ ...b, __date: new Date(b.scheduled_at) }))
      .filter((b) => b.__date >= now)
      .sort((a, b) => a.__date - b.__date);

    return list[0] || null;
  }, [bookings, now]);

  const filteredBookings = useMemo(() => {
    const filtered = bookings.filter((b) => {
      const status = (b?.status || "").toLowerCase();
      const scheduled = b?.scheduled_at ? new Date(b.scheduled_at) : null;

      const matchesStatus =
        bookingStatusFilter === "All" ||
        status === bookingStatusFilter.toLowerCase();

      let matchesTiming = true;
      if (bookingFilter === "Upcoming") {
        matchesTiming = scheduled ? scheduled >= now : false;
      } else if (bookingFilter === "Past") {
        matchesTiming = scheduled ? scheduled < now : false;
      }

      return matchesStatus && matchesTiming;
    });

    const sorted = [...filtered];
    if (bookingSort === "Newest") {
      sorted.sort(
        (a, b) =>
          new Date(b.scheduled_at || b.created_at || 0) -
          new Date(a.scheduled_at || a.created_at || 0)
      );
    } else {
      sorted.sort(
        (a, b) =>
          new Date(a.scheduled_at || a.created_at || 0) -
          new Date(b.scheduled_at || b.created_at || 0)
      );
    }

    return sorted;
  }, [bookings, bookingFilter, bookingStatusFilter, bookingSort, now]);

  // ---------------- render ----------------
  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">
            {data ? data.title : `Case #${cid}`}
          </h1>
          <p className="text-slate-300 text-sm">
            View case details and manage requests
          </p>
        </div>
        <button
          onClick={() => navigate("/client/cases")}
          className="px-4 py-2 rounded-lg bg-slate-800 border border-slate-700 hover:bg-slate-700 text-sm font-semibold text-white"
        >
          Back
        </button>
      </div>

      {loading && <div className="text-slate-300">Loading case…</div>}

      {error && !loading && (
        <div className="bg-red-900/30 border border-red-700 rounded-lg p-3 text-red-200 text-sm">
          {error}
        </div>
      )}

      {!loading && !error && data && (
        <>
          {/* Header card */}
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-5 space-y-3">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-xs uppercase text-slate-400">Case</div>
                <div className="text-xl font-semibold text-white">
                  {data.title}
                </div>
              </div>

              <div className="px-3 py-1 rounded-full text-xs bg-slate-900 border border-slate-700 text-slate-200">
                {data.status || "unknown"}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm text-slate-200">
              <div>
                <div className="text-slate-400 text-xs uppercase">Category</div>
                <div>{data.category || "—"}</div>
              </div>
              <div>
                <div className="text-slate-400 text-xs uppercase">District</div>
                <div>{data.district || "—"}</div>
              </div>
              <div>
                <div className="text-slate-400 text-xs uppercase">Created</div>
                <div>{formatDateTime(data.created_at)}</div>
              </div>
              <div>
                <div className="text-slate-400 text-xs uppercase">
                  Assigned Lawyer
                </div>
                <div>
                  {data.selected_lawyer_id
                    ? `Lawyer #${data.selected_lawyer_id}`
                    : "Not selected"}
                </div>
              </div>
            </div>
          </div>

          {/* Top actions */}
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => navigate("/client/cases")}
              className="px-4 py-2 rounded-lg bg-slate-800 border border-slate-700 hover:bg-slate-700 text-sm font-semibold text-white"
            >
              Documents
            </button>

            <button
              onClick={() => setTab("documents")}
              className="px-4 py-2 rounded-lg bg-slate-800 border border-slate-700 hover:bg-slate-700 text-sm font-semibold text-white"
            >
              Bookings
            </button>

            <button
              onClick={() => setTab("requests")}
              className="px-4 py-2 rounded-lg bg-slate-800 border border-slate-700 hover:bg-slate-700 text-sm font-semibold text-white"
            >
              Requests
            </button>

            {!upcomingBooking && (
              <button
                onClick={() => navigate("/client/search")}
                className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-slate-950 text-sm font-semibold"
              >
                Book Lawyer
              </button>
            )}
          </div>

          {/* Tabs (FIXED) */}
          <div className="flex gap-2">
            {["overview", "requests"].map((tabId) => {
              const active = activeTab === tabId;
              return (
                <button
                  key={tabId}
                  onClick={() => setTab(tabId)}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold border transition-colors ${
                    active
                      ? "bg-amber-600/20 border-amber-500 text-white"
                      : "bg-slate-800 border-slate-700 text-slate-300 hover:text-white hover:border-slate-500"
                  }`}
                >
                  {tabId === "overview" ? "Overview" : "Requests"}
                </button>
              );
            })}
          </div>

          {/* Overview */}
          {!loading && data && activeTab === "overview" && (
            <div className="space-y-4">
              <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-3">
                <h2 className="text-lg font-semibold text-white">Case Summary</h2>

                <div className="text-sm text-slate-300 whitespace-pre-wrap">
                  {data.summary_public || "No public summary provided."}
                </div>

                {data.summary_private && (
                  <div className="pt-3 border-t border-slate-800 text-sm text-slate-300 whitespace-pre-wrap">
                    <div className="text-xs uppercase tracking-wide text-slate-400 mb-1">
                      Private Summary
                    </div>
                    {data.summary_private}
                  </div>
                )}
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-3">
                  <h3 className="text-sm font-semibold text-white">Timeline</h3>

                  <div className="text-sm text-slate-300">
                    <div className="text-xs uppercase tracking-wide text-slate-400">
                      Created
                    </div>
                    {data.created_at ? formatDateTime(data.created_at) : "-"}
                  </div>

                  <div className="text-sm text-slate-300">
                    <div className="text-xs uppercase tracking-wide text-slate-400">
                      Status
                    </div>
                    {data.status || "-"}
                  </div>
              </div>

                  <div className="text-sm text-slate-300">
                    <div className="text-xs uppercase tracking-wide text-slate-400">
                      Assigned Lawyer
                    </div>
                    {lawyer?.full_name ||
                      (data.selected_lawyer_id
                        ? `Lawyer #${data.selected_lawyer_id}`
                        : "Not selected")}
                  </div>
                </div>

                <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-3">
                  <h3 className="text-sm font-semibold text-white">Next Steps</h3>

                  {!data.selected_lawyer_id && (
                    <div className="text-sm text-slate-300 space-y-2">
                      <p>Request a lawyer to move this case forward.</p>
                      <button
                        onClick={() => setTab("requests")}
                        className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-slate-950 text-sm font-semibold"
                      >
                        Request a Lawyer
                      </button>
                    </div>
                  )}

                  {data.selected_lawyer_id && !upcomingBooking && (
                    <div className="text-sm text-slate-300 space-y-2">
                      <p>Book a consultation with your assigned lawyer.</p>
                      <button
                        onClick={() => navigate("/client/search")}
                        className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-slate-950 text-sm font-semibold"
                      >
                        Book Consultation
                      </button>
                    </div>
                  )}

                  {upcomingBooking && (
                    <div className="text-sm text-slate-300">
                      <div className="text-xs uppercase tracking-wide text-slate-400">
                        Next Booking
                      </div>
                      {formatDateTime(
                        upcomingBooking.scheduled_at || upcomingBooking.created_at
                      )}
                    </div>
                  )}
                </div>
              </div>
          )}

          {/* Documents */}
          {!loading && activeTab === "documents" && (
            <div className="space-y-4">
              <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-white">
                    Case Documents
                  </h2>
                  <span className="text-xs text-slate-400">
                    {documents.length} files
                  </span>
                </div>

                <form onSubmit={handleUpload} className="space-y-3">
                  <div className="grid md:grid-cols-[2fr_1fr] gap-3">
                    <input
                      type="text"
                      value={uploadName}
                      onChange={(e) => setUploadName(e.target.value)}
                      placeholder="Document title (optional)"
                      className="px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                    <input
                      type="file"
                      onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                      className="px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-sm text-slate-300 file:text-slate-200 file:bg-slate-700 file:border-0 file:rounded-md file:px-3 file:py-1"
                    />
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      type="submit"
                      disabled={uploading || !uploadFile}
                      className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-slate-950 text-sm font-semibold disabled:opacity-60"
                    >
                      {uploading ? "Uploading..." : "Upload Document"}
                    </button>

                    {uploadOk && (
                      <span className="text-xs text-emerald-300">{uploadOk}</span>
                    )}
                    {uploadErr && (
                      <span className="text-xs text-red-300">{uploadErr}</span>
                    )}
                  </div>
                </form>
              </div>

              <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-3">
                {docsLoading ? (
                  <div className="animate-pulse h-20 bg-slate-900/50 border border-slate-800 rounded-xl" />
                ) : docsError ? (
                  <div className="text-sm text-red-300">{docsError}</div>
                ) : documents.length === 0 ? (
                  <div className="text-sm text-slate-300">
                    No documents uploaded yet.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {documents.map((doc) => {
                      const name =
                        doc.title ||
                        doc.file_name ||
                        doc.original_filename ||
                        "Document";

                      const href = resolveFileUrl(
                        doc.file_url ||
                          doc.fileUrl ||
                          doc.path ||
                          doc.url ||
                          doc.file_path ||
                          ""
                      );

                      return (
                        <div
                          key={doc.id}
                          className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 rounded-xl border border-slate-800 bg-slate-900/70 p-4"
                        >
                          <div>
                            <div className="text-sm font-semibold text-white">
                              {name}
                            </div>
                            <div className="text-xs text-slate-400">
                              Uploaded{" "}
                              {formatDateTime(doc.created_at || doc.uploaded_at)}
                            </div>
                          </div>

                          {href && (
                            <a
                              href={href}
                              target="_blank"
                              rel="noreferrer"
                              className="px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-xs font-semibold text-white hover:bg-slate-700"
                            >
                              Open
                            </a>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Bookings */}
          {!loading && activeTab === "bookings" && (
            <div className="space-y-4">
              <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-4">
                <div className="flex flex-wrap gap-3 items-center">
                  <select
                    value={bookingFilter}
                    onChange={(e) => setBookingFilter(e.target.value)}
                    className="px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                  >
                    {["All", "Upcoming", "Past"].map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>

                  <select
                    value={bookingStatusFilter}
                    onChange={(e) => setBookingStatusFilter(e.target.value)}
                    className="px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                  >
                    {[
                      "All",
                      "Pending",
                      "Confirmed",
                      "Cancelled",
                      "Rejected",
                      "Completed",
                    ].map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>

                  <select
                    value={bookingSort}
                    onChange={(e) => setBookingSort(e.target.value)}
                    className="px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                  >
                    {["Newest", "Oldest"].map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>

                {bookingsLoading ? (
                  <div className="animate-pulse h-20 bg-slate-900/50 border border-slate-800 rounded-xl" />
                ) : bookingsError ? (
                  <div className="text-sm text-red-300">{bookingsError}</div>
                ) : filteredBookings.length === 0 ? (
                  <div className="text-sm text-slate-300">
                    No bookings found for this case.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {filteredBookings.map((b) => (
                      <div
                        key={b.id}
                        className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 rounded-xl border border-slate-800 bg-slate-900/70 p-4"
                      >
                        <div className="space-y-1">
                          <div className="text-sm font-semibold text-white">
                            Booking #{b.id}
                          </div>
                          <div className="text-xs text-slate-400">
                            {b.service_name ? b.service_name : "Service"} â€¢{" "}
                            {formatDateTime(b.scheduled_at || b.created_at)}
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <span className="px-3 py-1 rounded-full text-xs font-semibold bg-slate-800 border border-slate-700 text-slate-200">
                            {b.status || "pending"}
                          </span>

                          <button
                            onClick={() => navigate(`/client/bookings/${b.id}`)}
                            className="px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-xs font-semibold text-white hover:bg-slate-700"
                          >
                            View Booking
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Requests */}
          {!loading && activeTab === "requests" && (
            <CaseRequestsPanel caseId={cid} />
          )}
        </>
      )}
     
    {/* </PageShell> */}
    </div>

  );
}
