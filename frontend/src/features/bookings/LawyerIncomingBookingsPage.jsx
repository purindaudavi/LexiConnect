import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  lawyerListIncomingBookings,
  lawyerConfirmBooking,
  lawyerRejectBooking,
} from "../../services/bookings";
import "../../pages/availability-ui.css";
import Can from "../../components/Can";

const LawyerIncomingBookingsPage = () => {
  const navigate = useNavigate();
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [actionId, setActionId] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");

  const fetchBookings = async (statusValue = statusFilter) => {
    setError("");
    setLoading(true);
    try {
      const statusParam =
        statusValue && statusValue.toUpperCase() !== "ALL"
          ? statusValue.toLowerCase()
          : "all";
      const data = await lawyerListIncomingBookings(statusParam);
      setBookings(data || []);
    } catch (err) {
      if (err?.response?.status === 403) {
        setError("You do not have permission to view incoming bookings.");
        return;
      }
      // Handle 404 specifically with friendly message
      if (err?.response?.status === 404) {
        setError("Incoming bookings endpoint not available.");
      } else {
        // Show actual API errors for other cases
        const message =
          err?.response?.data?.detail ||
          err?.response?.data?.message ||
          err?.message ||
          "Failed to load incoming bookings.";
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBookings(statusFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  const handleConfirm = async (id) => {
    if (!window.confirm("Are you sure you want to confirm this booking request?")) {
      return;
    }

    setError("");
    setSuccessMessage("");
    setActionId(id);
    try {
      const updated = await lawyerConfirmBooking(id);
      setBookings((prev) =>
        prev.map((booking) => (booking.id === id ? { ...booking, ...updated } : booking))
      );
      setSuccessMessage("Booking confirmed.");
    } catch (err) {
      if (err?.response?.status === 403) {
        setError("You don't have permission to perform this action.");
        return;
      }
      const message =
        err?.response?.data?.detail ||
        err?.response?.data?.message ||
        "Unable to confirm booking.";
      setError(message);
    } finally {
      setActionId(null);
    }
  };

  const handleReject = async (id) => {
    if (!window.confirm("Are you sure you want to reject this booking request?")) {
      return;
    }

    setError("");
    setSuccessMessage("");
    setActionId(id);
    try {
      const updated = await lawyerRejectBooking(id);
      setBookings((prev) =>
        prev.map((booking) => (booking.id === id ? { ...booking, ...updated } : booking))
      );
      setSuccessMessage("Booking rejected.");
    } catch (err) {
      if (err?.response?.status === 403) {
        setError("You don't have permission to perform this action.");
        return;
      }
      const message =
        err?.response?.data?.detail ||
        err?.response?.data?.message ||
        "Unable to reject booking.";
      setError(message);
    } finally {
      setActionId(null);
    }
  };

  const formatDateTime = (dateTimeStr) => {
    if (!dateTimeStr) return "Not scheduled";
    try {
      const date = new Date(dateTimeStr);
      return date.toLocaleString();
    } catch {
      return dateTimeStr;
    }
  };

  const stats = useMemo(() => {
    const total = bookings.length;
    const pending = bookings.filter((b) => b.status?.toUpperCase() === "PENDING").length;
    const confirmed = bookings.filter((b) => b.status?.toUpperCase() === "CONFIRMED").length;
    const rejected = bookings.filter((b) => b.status?.toUpperCase() === "REJECTED").length;
    return { total, pending, confirmed, rejected };
  }, [bookings]);

  const filteredBookings = useMemo(() => {
    let filtered = [...bookings];

    if (statusFilter !== "ALL") {
      filtered = filtered.filter((b) => b.status?.toUpperCase() === statusFilter);
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter((b) => {
        return (
          String(b.id).includes(query) ||
          String(b.client_id).includes(query) ||
          String(b.branch_id || "").includes(query) ||
          (b.note && b.note.toLowerCase().includes(query))
        );
      });
    }

    return filtered;
  }, [bookings, statusFilter, searchQuery]);

  const getStatusBadgeClass = (status) => {
    switch (status?.toUpperCase()) {
      case "PENDING":
        return "amber";
      case "CONFIRMED":
        return "green";
      case "REJECTED":
        return "red";
      case "CANCELLED":
        return "gray";
      default:
        return "gray";
    }
  };

  return (
    <div className="availability-page">
      <div className="availability-card" style={{ width: "min(1200px, 100%)" }}>
        <div className="availability-card-header">
          <div className="availability-brand">
            <span className="availability-logo">⚖️</span>
            <div className="availability-brand-text">
              <div className="availability-brand-name">LEXICONNECT</div>
              <div className="availability-brand-subtitle">
                Review and respond to pending booking requests from clients.
              </div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
            <div className="lc-icon" style={{ width: "48px", height: "48px" }}>📥</div>
            <h1 className="availability-title">Incoming Booking Requests</h1>
          </div>
        </div>

        {error && (
          <div className="alert alert-error" style={{ marginBottom: "1.5rem" }}>
            {error}
          </div>
        )}
        {successMessage && (
          <div className="alert alert-success" style={{ marginBottom: "1.5rem" }}>
            {successMessage}
          </div>
        )}

        {loading ? (
          <div className="empty-state">
            <p>Loading incoming bookings...</p>
          </div>
        ) : (
          <>
            <div
              className="lc-card-grid"
              style={{
                gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                marginBottom: "2rem",
              }}
            >
              <div className="lc-card-item" style={{ padding: "1.25rem" }}>
                <div className="lc-list-card-meta" style={{ marginBottom: "0.5rem" }}>Total Requests</div>
                <div style={{ fontSize: "2rem", fontWeight: 700, color: "var(--text-main)" }}>
                  {stats.total}
                </div>
              </div>
              <div className="lc-card-item" style={{ padding: "1.25rem" }}>
                <div className="lc-list-card-meta" style={{ marginBottom: "0.5rem" }}>Pending</div>
                <div style={{ fontSize: "2rem", fontWeight: 700, color: "rgba(242, 184, 75, 0.95)" }}>
                  {stats.pending}
                </div>
              </div>
              <div className="lc-card-item" style={{ padding: "1.25rem" }}>
                <div className="lc-list-card-meta" style={{ marginBottom: "0.5rem" }}>Confirmed</div>
                <div style={{ fontSize: "2rem", fontWeight: 700, color: "rgba(52, 211, 153, 0.95)" }}>
                  {stats.confirmed}
                </div>
              </div>
              <div className="lc-card-item" style={{ padding: "1.25rem" }}>
                <div className="lc-list-card-meta" style={{ marginBottom: "0.5rem" }}>Rejected</div>
                <div style={{ fontSize: "2rem", fontWeight: 700, color: "rgba(248, 113, 113, 0.95)" }}>
                  {stats.rejected}
                </div>
              </div>
            </div>

            <div className="lc-form-grid" style={{ marginBottom: "1.5rem" }}>
              <div className="form-group">
                <label htmlFor="search" className="form-label">Search</label>
                <input
                  type="text"
                  id="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by ID, client, branch, or note..."
                  className="lc-input"
                />
              </div>
              <div className="form-group">
                <label htmlFor="status" className="form-label">Status</label>
                <select
                  id="status"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="form-control"
                  style={{ height: "46px" }}
                >
                  <option value="ALL">All</option>
                  <option value="PENDING">Pending</option>
                  <option value="CONFIRMED">Confirmed</option>
                  <option value="REJECTED">Rejected</option>
                  <option value="CANCELLED">Cancelled</option>
                </select>
              </div>
            </div>

            <div className="lc-divider" />

            {bookings.length === 0 ? (
              <div className="empty-state">
                <p>No pending booking requests.</p>
                <p className="empty-sub">New booking requests from clients will appear here.</p>
              </div>
            ) : filteredBookings.length === 0 ? (
              <div className="empty-state">
                <p>No bookings match your filters.</p>
                <p className="empty-sub">Try adjusting your search or status filter.</p>
              </div>
            ) : (
              <div className="lc-list">
                {filteredBookings.map((booking) => (
                  <div key={booking.id} className="lc-list-card">
                    <div className="lc-list-card-content" style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.75rem" }}>
                        <div className="lc-list-card-title" style={{ margin: 0 }}>
                          Booking #{booking.id}
                        </div>
                        <span className={`lc-badge ${getStatusBadgeClass(booking.status)}`}>
                          {booking.status}
                        </span>
                      </div>
                      <div
                        className="lc-list-card-meta"
                        style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "0.75rem", marginBottom: "0.5rem" }}
                      >
                        <div>
                          <span style={{ opacity: 0.7 }}>Client ID: </span>
                          <span style={{ fontWeight: 600 }}>{booking.client_id}</span>
                        </div>
                        {booking.branch_id && (
                          <div>
                            <span style={{ opacity: 0.7 }}>Branch ID: </span>
                            <span style={{ fontWeight: 600 }}>{booking.branch_id}</span>
                          </div>
                        )}
                        <div style={{ gridColumn: "1 / -1" }}>
                          <span style={{ opacity: 0.7 }}>Scheduled: </span>
                          <span>{formatDateTime(booking.scheduled_at)}</span>
                        </div>
                        <div style={{ gridColumn: "1 / -1", fontSize: "0.8rem", opacity: 0.6 }}>
                          Requested: {formatDateTime(booking.created_at)}
                        </div>
                      </div>
                      {booking.note && (
                        <div
                          style={{
                            marginTop: "0.75rem",
                            padding: "0.75rem",
                            borderRadius: "8px",
                            background: "rgba(2, 6, 23, 0.6)",
                            border: "1px solid rgba(148, 163, 184, 0.1)",
                          }}
                        >
                          <div style={{ fontSize: "0.75rem", fontWeight: 600, marginBottom: "0.25rem", opacity: 0.8 }}>
                            Client Note:
                          </div>
                          <div style={{ fontSize: "0.85rem", whiteSpace: "pre-wrap" }}>{booking.note}</div>
                        </div>
                      )}
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", minWidth: "140px" }}>
                      <button
                        onClick={() => navigate(`/lawyer/bookings/${booking.id}`)}
                        className="availability-primary-btn"
                        style={{ height: "36px", fontSize: "0.85rem", padding: "0 1rem" }}
                      >
                        View Details
                      </button>
                      <Can privilege="booking.confirm">
                        <button
                          onClick={() => handleConfirm(booking.id)}
                          disabled={
                            actionId === booking.id || booking.status?.toUpperCase() !== "PENDING"
                          }
                          className="lc-primary-btn"
                          style={{
                            height: "36px",
                            fontSize: "0.85rem",
                            padding: "0 1rem",
                            background: booking.status?.toUpperCase() === "PENDING"
                              ? "linear-gradient(180deg, rgba(52, 211, 153, 0.8), rgba(34, 197, 94, 0.9))"
                              : undefined,
                          }}
                        >
                          {actionId === booking.id ? "Confirming..." : "Confirm"}
                        </button>
                      </Can>
                      <Can privilege="booking.reject">
                        <button
                          onClick={() => handleReject(booking.id)}
                          disabled={
                            actionId === booking.id || booking.status?.toUpperCase() !== "PENDING"
                          }
                          className="availability-danger-btn"
                          style={{ height: "36px", fontSize: "0.85rem" }}
                        >
                          {actionId === booking.id ? "Rejecting..." : "Reject"}
                        </button>
                      </Can>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default LawyerIncomingBookingsPage;
