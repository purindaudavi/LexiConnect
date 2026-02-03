import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { getCaseById } from "../services/cases.service";
import { listMyBookings } from "../../../services/bookings";
import { listCaseDocuments } from "../../documents/services/documents.service";
import CaseRequestsPanel from "../components/CaseRequestsPanel";

function formatDateTime(value) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return "—";
  }
}

function resolveFileUrl(path) {
  if (!path) return "";
  // If backend already gives absolute URL, keep it
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  // Otherwise assume it's a relative path served by backend
  return path.startsWith("/") ? path : `/${path}`;
}

export default function ClientCaseDetailPage() {
  const { caseId } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const cid = Number(caseId);

  // ---------- Tabs ----------
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

  // ---------- Main case ----------
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // ---------- Documents ----------
  const [documents, setDocuments] = useState([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [docsError, setDocsError] = useState("");

  // ---------- Bookings ----------
  const [bookings, setBookings] = useState([]);
  const [bookingsLoading, setBookingsLoading] = useState(false);
  const [bookingsError, setBookingsError] = useState("");

  const [bookingFilter, setBookingFilter] = useState("All"); // All | Upcoming | Past
  const [bookingStatusFilter, setBookingStatusFilter] = useState("All"); // All | Pending | ...
  const [bookingSort, setBookingSort] = useState("Newest"); // Newest | Oldest

  // ---------- Load Case ----------
  useEffect(() => {
    const load = async () => {
      if (!Number.isFinite(cid)) return;

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

    load();
  }, [cid]);

  // ---------- Load Documents ----------
  useEffect(() => {
    const loadDocs = async () => {
      if (!Number.isFinite(cid) || !data) return;

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
  }, [cid, data]);

  // ---------- Load Bookings ----------
  useEffect(() => {
    const loadBookings = async () => {
      if (!Number.isFinite(cid) || !data) return;

      setBookingsLoading(true);
      setBookingsError("");

      try {
        const res = await listMyBookings();
        const list = (res || []).filter((b) => Number(b.case_id) === cid);
        setBookings(list);
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
  }, [cid, data]);

  // ---------- Derived: bookings ----------
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

  // ---------- UI ----------
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
          {/* Case header card */}
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

          {/* Quick actions */}
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => setTab("documents")}
              className="px-4 py-2 rounded-lg bg-slate-800 border border-slate-700 hover:bg-slate-700 text-sm font-semibold text-white"
            >
              Documents
            </button>

            <button
              onClick={() => setTab("bookings")}
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

          {/* Tabs */}
          <div className="flex flex-wrap gap-2">
            {[
              { id: "overview", label: "Overview" },
              { id: "documents", label: "Documents" },
              { id: "bookings", label: "Bookings" },
              { id: "requests", label: "Requests" },
            ].map((t) => {
              const active = activeTab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold border transition-colors ${
                    active
                      ? "bg-amber-600/20 border-amber-500 text-white"
                      : "bg-slate-800 border-slate-700 text-slate-300 hover:text-white hover:border-slate-500"
                  }`}
                >
                  {t.label}
                </button>
              );
            })}
          </div>

          {/* CONTENT */}
          {activeTab === "overview" && (
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

              {upcomingBooking && (
                <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5">
                  <div className="text-xs uppercase tracking-wide text-slate-400">
                    Next Booking
                  </div>
                  <div className="text-sm text-slate-200 mt-1">
                    {formatDateTime(
                      upcomingBooking.scheduled_at || upcomingBooking.created_at
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === "documents" && (
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
                                Uploaded {formatDateTime(
                                  doc.created_at || doc.uploaded_at
                                )}
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
            </div>
          )}

          {activeTab === "bookings" && (
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
                            {b.service_name ? b.service_name : "Service"} •{" "}
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

          {activeTab === "requests" && <CaseRequestsPanel caseId={cid} />}
        </>
      )}
    </div>
  );
}
