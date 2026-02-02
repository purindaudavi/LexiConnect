import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { listMyBookingSummaries, cancelBooking } from "../services/bookings";

const ManageBookings = () => {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionId, setActionId] = useState(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [sortOrder, setSortOrder] = useState("Newest");
  const navigate = useNavigate();

  const fetchBookings = async () => {
    setError("");
    setLoading(true);
    try {
      const data = await listMyBookingSummaries();
      setBookings(data || []);
    } catch (err) {
      const message =
        err?.response?.data?.detail ||
        err?.response?.data?.message ||
        "Failed to load bookings.";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBookings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCancel = async (id) => {
    if (!window.confirm("Are you sure you want to cancel this booking?")) {
      return;
    }

    setError("");
    setActionId(id);
    try {
      await cancelBooking(id);
      // Refresh bookings list
      await fetchBookings();
    } catch (err) {
      const message =
        err?.response?.data?.detail ||
        err?.response?.data?.message ||
        "Unable to cancel booking.";
      setError(message);
    } finally {
      setActionId(null);
    }
  };

  const statusConfig = {
    pending: {
      label: "Pending",
      badge: "bg-amber-900/30 text-amber-200 border border-amber-700/40",
    },
    confirmed: {
      label: "Confirmed",
      badge: "bg-emerald-900/30 text-emerald-200 border border-emerald-700/40",
    },
    completed: {
      label: "Completed",
      badge: "bg-sky-900/30 text-sky-200 border border-sky-700/40",
    },
    cancelled: {
      label: "Cancelled",
      badge: "bg-red-900/30 text-red-300 border border-red-700/40",
    },
  };

  const formatDateTime = (dateTimeStr) => {
    if (!dateTimeStr) return "-";
    try {
      const date = new Date(dateTimeStr);
      return new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date);
    } catch {
      return dateTimeStr;
    }
  };

  const filtered = bookings
    .filter((b) => {
      const q = search.trim().toLowerCase();
      const matchesSearch =
        !q ||
        (b.lawyer_name || "").toLowerCase().includes(q) ||
        (b.service_name || "").toLowerCase().includes(q) ||
        (b.case_title || "").toLowerCase().includes(q) ||
        (b.case_summary || "").toLowerCase().includes(q);
      const matchesStatus =
        statusFilter === "All" || (b.status || "").toLowerCase() === statusFilter.toLowerCase();
      return matchesSearch && matchesStatus;
    })
    .sort((a, b) => {
      const aDate = new Date(a.scheduled_at || a.created_at || 0).getTime();
      const bDate = new Date(b.scheduled_at || b.created_at || 0).getTime();
      if (sortOrder === "Newest") return bDate - aDate;
      if (sortOrder === "Oldest") return aDate - bDate;
      if (sortOrder === "Upcoming") return aDate - bDate;
      return 0;
    });

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-white">
      <div className="max-w-6xl mx-auto px-4 py-10 space-y-8">
        <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 md:p-8 shadow-lg shadow-slate-900/30 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div className="space-y-2">
            <p className="text-sm uppercase tracking-[0.2em] text-amber-300">Client Portal</p>
            <h1 className="text-3xl font-bold text-white">My Bookings</h1>
            <p className="text-slate-300">
              Track upcoming consultations, manage documents, and stay on top of your case timeline.
            </p>
          </div>
          <button
            onClick={() => navigate("/client/search")}
            className="px-5 py-3 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold shadow-md shadow-amber-500/25 transition-colors"
          >
            Book a Lawyer
          </button>
        </section>

        <section className="bg-slate-900/70 border border-slate-800 rounded-2xl p-4 md:p-6 shadow-lg shadow-slate-900/30 space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
            <div className="flex flex-1 gap-3 flex-wrap">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by lawyer, service, or case"
                className="flex-1 min-w-[220px] px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-sm placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              >
                {["All", "Pending", "Confirmed", "Completed", "Cancelled"].map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <select
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value)}
                className="px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              >
                {["Newest", "Oldest", "Upcoming"].map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </section>

        {error && (
          <div className="p-4 bg-red-900/30 border border-red-500/40 rounded-lg text-red-200">
            {error}
          </div>
        )}

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((k) => (
              <div
                key={k}
                className="animate-pulse bg-slate-900/60 border border-slate-800 rounded-xl p-4 h-28"
              />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-6 text-center space-y-3 shadow-lg shadow-slate-900/30">
            <h3 className="text-lg font-semibold text-white">No bookings found</h3>
            <p className="text-slate-400 text-sm">
              Book a consultation to see it appear here.
            </p>
            <button
              onClick={() => navigate("/client/search")}
              className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold transition-colors"
            >
              Find a Lawyer
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {filtered.map((booking) => {
              const status = (booking.status || "").toLowerCase();
              const statusStyles = statusConfig[status]?.badge || statusConfig.pending.badge;
              const statusLabel = statusConfig[status]?.label || "Pending";

              return (
                <div
                  key={booking.id}
                  className="bg-slate-900/70 border border-slate-800 rounded-2xl p-5 flex flex-col gap-4 shadow-lg shadow-slate-900/30 hover:border-slate-700 transition-colors"
                >
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className="text-white font-semibold text-lg">
                        {booking.lawyer_name || "Lawyer"}
                      </span>
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold uppercase ${statusStyles}`}>
                        {booking.status || "Unknown"}
                      </span>
                    </div>
                    <div className="text-sm text-slate-300">
                      Scheduled: {formatDateTime(booking.scheduled_at)}
                    </div>
                  </div>

                  <div className="text-sm text-slate-400 flex flex-wrap gap-3">
                    {booking.service_name && (
                      <span className="inline-flex items-center gap-1">
                        <span className="text-slate-300 font-medium">Service:</span> {booking.service_name}
                      </span>
                    )}
                    {booking.case_title && (
                      <span className="inline-flex items-center gap-1">
                        <span className="text-slate-300 font-medium">Case:</span> {booking.case_title}
                      </span>
                    )}
                    {(booking.branch_name || booking.branch_city) && (
                      <span className="inline-flex items-center gap-1">
                        <span className="text-slate-300 font-medium">Branch:</span>{" "}
                        {[booking.branch_name, booking.branch_city].filter(Boolean).join(" - ")}
                      </span>
                    )}
                  </div>

                  {booking.case_summary && (
                    <div className="text-sm text-slate-400">
                      {booking.case_summary}
                    </div>
                  )}

                  <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
                    <button
                      onClick={() => navigate(`/client/bookings/${booking.id}`)}
                      className="px-4 py-2 rounded-lg bg-slate-800 border border-slate-700 hover:bg-slate-700 text-sm font-semibold text-white transition-colors"
                    >
                      View Details
                    </button>
                    <button
                      onClick={() => navigate(`/client/bookings/${booking.id}?tab=Documents`)}
                      className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-sm font-semibold text-white transition-colors"
                    >
                      Documents
                    </button>
                    {status !== "cancelled" && (
                      <button
                        onClick={() => handleCancel(booking.id)}
                        disabled={actionId === booking.id}
                        className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 disabled:bg-red-800 disabled:opacity-60 disabled:cursor-not-allowed text-sm font-semibold text-white transition-colors"
                      >
                        {actionId === booking.id ? "Cancelling..." : "Cancel"}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default ManageBookings;

