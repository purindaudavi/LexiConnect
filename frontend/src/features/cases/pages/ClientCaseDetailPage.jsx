import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { getCaseById, getUserById } from "../services/cases.service";
import { listBookingsByCaseId } from "../../../services/bookings";
import {
  listCaseDocuments,
  uploadCaseDocument,
} from "../../documents/services/documents.service";
import CaseRequestsPanel from "../components/CaseRequestsPanel";

export default function ClientCaseDetailPage() {
  const { caseId } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const cid = Number(caseId);

  // NOTE: VITE_API_ORIGIN stays as http://127.0.0.1:8000 (no /api)
  // This is used ONLY for opening uploaded files (/uploads/...)
  const BACKEND_ORIGIN =
    import.meta.env.VITE_API_ORIGIN || "http://127.0.0.1:8000";

  const resolveFileUrl = (fileUrl) => {
    if (!fileUrl) return "";
    if (fileUrl.startsWith("http")) return fileUrl;
    // ensure single slash
    const origin = BACKEND_ORIGIN.replace(/\/+$/, "");
    const path = String(fileUrl).startsWith("/") ? fileUrl : `/${fileUrl}`;
    return `${origin}${path}`;
  };

  const [data, setData] = useState(null);
  const [lawyer, setLawyer] = useState(null);
  const [bookings, setBookings] = useState([]);
  const [documents, setDocuments] = useState([]);

  const [loading, setLoading] = useState(true);
  const [docsLoading, setDocsLoading] = useState(true);
  const [bookingsLoading, setBookingsLoading] = useState(true);

  const [error, setError] = useState("");
  const [docsError, setDocsError] = useState("");
  const [bookingsError, setBookingsError] = useState("");

  const allowedTabs = ["overview", "documents", "bookings", "requests"];

  const normalizeTab = (value) =>
    allowedTabs.includes(value) ? value : "overview";

  const [activeTab, setActiveTab] = useState(() =>
    normalizeTab(searchParams.get("tab"))
  );

  const [uploadFile, setUploadFile] = useState(null);
  const [uploadName, setUploadName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadErr, setUploadErr] = useState("");
  const [uploadOk, setUploadOk] = useState("");

  const [bookingFilter, setBookingFilter] = useState("All");
  const [bookingStatusFilter, setBookingStatusFilter] = useState("All");
  const [bookingSort, setBookingSort] = useState("Newest");

  const formatDateTime = (value) => {
    if (!value) return "-";
    try {
      return new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(value));
    } catch {
      return String(value);
    }
  };

  const formatDate = (value) => {
    if (!value) return "-";
    try {
      return new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
      }).format(new Date(value));
    } catch {
      return String(value);
    }
  };

  const loadAll = async () => {
    if (!Number.isFinite(cid) || cid <= 0) return;

    setLoading(true);
    setDocsLoading(true);
    setBookingsLoading(true);

    setError("");
    setDocsError("");
    setBookingsError("");

    try {
      // case + bookings in parallel
      const [caseRes, bookingRes] = await Promise.all([
        getCaseById(cid),
        listBookingsByCaseId(cid),
      ]);

      setData(caseRes || null);
      setBookings(Array.isArray(bookingRes) ? bookingRes : []);

      // lawyer fetch
      if (caseRes?.selected_lawyer_id) {
        try {
          const lawyerRes = await getUserById(caseRes.selected_lawyer_id);
          setLawyer(lawyerRes || null);
        } catch {
          setLawyer(null);
        }
      } else {
        setLawyer(null);
      }

      // documents fetch
      try {
        // IMPORTANT: this must hit /api/documents/by-case/:id inside service
        const docRes = await listCaseDocuments(cid);

        // axios returns {data: ...}
        const docs = docRes?.data ?? docRes ?? [];
        setDocuments(Array.isArray(docs) ? docs : []);
      } catch (e) {
        setDocuments([]);
        setDocsError(
          e?.response?.data?.detail ||
            e?.response?.data?.message ||
            "Failed to load documents."
        );
      }
    } catch (e) {
      const msg =
        e?.response?.data?.detail ||
        e?.response?.data?.message ||
        "Failed to load case.";
      setError(msg);
    } finally {
      setLoading(false);
      setDocsLoading(false);
      setBookingsLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cid]);

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

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!uploadFile) return;

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

  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "documents", label: "Documents" },
    { id: "bookings", label: "Bookings" },
    { id: "requests", label: "Requests" },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-white">
      <div className="max-w-6xl mx-auto px-4 py-10 space-y-8">
        <div className="text-xs text-slate-400 uppercase tracking-widest">
          Client Portal / My Cases / Case #{cid}
        </div>

        <section className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6">
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold text-white">
                {loading ? "Loading..." : data?.title || `Case #${cid}`}
              </h1>
              {!loading && data?.status && (
                <span className="px-3 py-1 rounded-full text-xs font-semibold bg-emerald-900/30 text-emerald-200 border border-emerald-700/40">
                  {data.status}
                </span>
              )}
            </div>

            <div className="flex flex-wrap gap-2 text-sm text-slate-300">
              <span className="px-3 py-1 rounded-full bg-slate-800 border border-slate-700">
                {data?.category || "Category"}
              </span>
              <span className="px-3 py-1 rounded-full bg-slate-800 border border-slate-700">
                {data?.district || "District"}
              </span>
              <span className="px-3 py-1 rounded-full bg-slate-800 border border-slate-700">
                Created {data?.created_at ? formatDate(data.created_at) : "-"}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => navigate("/client/cases")}
              className="px-4 py-2 rounded-lg bg-slate-800 border border-slate-700 hover:bg-slate-700 text-sm font-semibold"
            >
              Back to My Cases
            </button>

            <button
              onClick={() => setTab("documents")}
              className="px-4 py-2 rounded-lg bg-slate-800 border border-slate-700 hover:bg-slate-700 text-sm font-semibold"
            >
              Upload Document
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
        </section>

        {error && !loading && (
          <div className="bg-red-900/30 border border-red-700 rounded-lg p-4 text-red-200 text-sm">
            <div className="font-semibold">Unable to load case</div>
            <div className="mt-1">{error}</div>
            <button
              onClick={loadAll}
              className="mt-3 px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 hover:bg-slate-700 text-xs font-semibold"
            >
              Retry
            </button>
          </div>
        )}

        <div className="grid lg:grid-cols-[2fr_1fr] gap-6">
          <div className="space-y-4">
            <div className="sticky top-4 z-10 bg-slate-950/80 backdrop-blur border border-slate-800 rounded-2xl p-2 flex flex-wrap gap-2">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setTab(tab.id)}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold border transition-colors ${
                    activeTab === tab.id
                      ? "bg-amber-600/20 border-amber-500 text-white"
                      : "bg-slate-900 border-slate-700 text-slate-300 hover:text-white hover:border-slate-500"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {loading && (
              <div className="space-y-3">
                {[1, 2, 3].map((k) => (
                  <div
                    key={k}
                    className="animate-pulse bg-slate-900/60 border border-slate-800 rounded-2xl h-28"
                  />
                ))}
              </div>
            )}

            {!loading && data && activeTab === "overview" && (
              <div className="space-y-4">
                <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-3">
                  <h2 className="text-lg font-semibold text-white">
                    Case Summary
                  </h2>
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
                    <h3 className="text-sm font-semibold text-white">
                      Timeline
                    </h3>
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
                    <h3 className="text-sm font-semibold text-white">
                      Next Steps
                    </h3>

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
                          upcomingBooking.scheduled_at ||
                            upcomingBooking.created_at
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

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
                        onChange={(e) =>
                          setUploadFile(e.target.files?.[0] || null)
                        }
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
                        <span className="text-xs text-emerald-300">
                          {uploadOk}
                        </span>
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
                                {formatDateTime(
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
            )}

            {!loading && activeTab === "bookings" && (
              <div className="space-y-4">
                <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-4">
                  <div className="flex flex-wrap gap-3 items-center">
                    <select
                      value={bookingFilter}
                      onChange={(e) => setBookingFilter(e.target.value)}
                      className="px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
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
                      className="px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
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
                      className="px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
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

            {!loading && activeTab === "requests" && (
              <CaseRequestsPanel caseId={cid} />
            )}
          </div>

          <aside className="space-y-4">
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-3">
              <h3 className="text-sm font-semibold text-white">Case Info</h3>
              <div className="text-sm text-slate-300">
                <div className="text-xs uppercase tracking-wide text-slate-400">
                  Case ID
                </div>
                #{cid}
              </div>
              <div className="text-sm text-slate-300">
                <div className="text-xs uppercase tracking-wide text-slate-400">
                  Status
                </div>
                {data?.status || "-"}
              </div>
              <div className="text-sm text-slate-300">
                <div className="text-xs uppercase tracking-wide text-slate-400">
                  Category
                </div>
                {data?.category || "-"}
              </div>
              <div className="text-sm text-slate-300">
                <div className="text-xs uppercase tracking-wide text-slate-400">
                  District
                </div>
                {data?.district || "-"}
              </div>
            </div>

            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-3">
              <h3 className="text-sm font-semibold text-white">Assigned Lawyer</h3>
              {lawyer ? (
                <>
                  <div className="text-sm text-white font-semibold">
                    {lawyer.full_name}
                  </div>
                  {lawyer.email && (
                    <div className="text-xs text-slate-400">{lawyer.email}</div>
                  )}
                  <button
                    onClick={() => navigate(`/client/profile/${lawyer.id}`)}
                    className="mt-2 px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-xs font-semibold text-white hover:bg-slate-700"
                  >
                    View Lawyer Profile
                  </button>
                </>
              ) : (
                <div className="text-sm text-slate-300">No lawyer selected yet.</div>
              )}
            </div>

            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-3">
              <h3 className="text-sm font-semibold text-white">Quick Actions</h3>
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => setTab("documents")}
                  className="px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-xs font-semibold text-white hover:bg-slate-700"
                >
                  Upload Document
                </button>
                <button
                  onClick={() => setTab("documents")}
                  className="px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-xs font-semibold text-white hover:bg-slate-700"
                >
                  View Documents
                </button>
                <button
                  onClick={() => setTab("bookings")}
                  className="px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-xs font-semibold text-white hover:bg-slate-700"
                >
                  View Bookings
                </button>
                <button
                  onClick={() => setTab("requests")}
                  className="px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-xs font-semibold text-white hover:bg-slate-700"
                >
                  View Requests
                </button>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
