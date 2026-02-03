import { useEffect, useMemo, useState } from "react";
import api from "../../services/api";
import "./AuthLog.css";

const SUCCESS_OPTIONS = ["All", "Success", "Failure"];
const EVENT_OPTIONS = ["All", "LOGIN", "LOGOUT"];

export default function AuthLog() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("All");
  const [eventType, setEventType] = useState("All");
  const [email, setEmail] = useState("");
  const [reason, setReason] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState(null);

  const [debouncedEmail, setDebouncedEmail] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedEmail(email), 300);
    return () => clearTimeout(t);
  }, [email]);

  const fetchLogs = async (nextPage = page, nextPageSize = pageSize) => {
    setLoading(true);
    setError("");
    try {
      const params = {
        page: nextPage,
        page_size: nextPageSize,
      };
      if (success === "Success") params.success = true;
      if (success === "Failure") params.success = false;
      if (eventType && eventType !== "All") params.event_type = eventType;
      if (debouncedEmail) params.email = debouncedEmail;
      if (reason) params.failure_reason = reason;
      if (dateFrom) params.date_from = `${dateFrom}T00:00:00`;
      if (dateTo) params.date_to = `${dateTo}T23:59:59`;

      const res = await api.get("/api/auth-logs", { params });
      setLogs(res.data?.items || []);
      setTotal(res.data?.total || 0);
      setPage(res.data?.page || nextPage);
      setPageSize(res.data?.page_size || nextPageSize);
    } catch (err) {
      const msg =
        err?.response?.data?.detail ||
        err?.response?.data?.message ||
        "Failed to load auth logs.";
      setError(msg);
      setLogs([]);
      setTotal(0);
      if (err?.response?.status === 401 || err?.response?.status === 403) {
        window.location.href = "/not-authorized";
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs(1, pageSize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [success, eventType, debouncedEmail, reason, dateFrom, dateTo]);

  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(total, (page - 1) * pageSize + logs.length);

  const formatTimestamp = (ts) => {
    if (!ts) return "-";
    try {
      const d = new Date(ts);
      return `${d.toLocaleDateString()} ${d.toLocaleTimeString()}`;
    } catch {
      return ts;
    }
  };

  const isSuccess = (entry) => entry.success === true;

  const resetFilters = () => {
    setSuccess("All");
    setEventType("All");
    setEmail("");
    setReason("");
    setDateFrom("");
    setDateTo("");
    setPage(1);
    fetchLogs(1, pageSize);
  };

  const uniqueUsers = useMemo(() => {
    return new Set(logs.map((l) => l.email || l.user_id || "-")).size;
  }, [logs]);

  return (
    <div className="auth-log-page">
      <main className="auth-log-main">
        <div className="auth-log-container">
          <h1 className="auth-page-title">Auth Log</h1>

          {error && <div className="auth-error-banner">{error}</div>}

          <div className="auth-filters-card">
            <div className="auth-filter">
              <label>Status</label>
              <select value={success} onChange={(e) => setSuccess(e.target.value)}>
                {SUCCESS_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </div>

            <div className="auth-filter">
              <label>Event</label>
              <select value={eventType} onChange={(e) => setEventType(e.target.value)}>
                {EVENT_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </div>

            <div className="auth-filter auth-filter-wide">
              <label>Email</label>
              <input
                type="text"
                placeholder="Search email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div className="auth-filter auth-filter-wide">
              <label>Reason</label>
              <input
                type="text"
                placeholder="Search failure reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>

            <div className="auth-filter">
              <label>From</label>
              <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            </div>

            <div className="auth-filter">
              <label>To</label>
              <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </div>

            <div className="auth-filter">
              <label>Page Size</label>
              <select
                value={pageSize}
                onChange={(e) => {
                  const next = Number(e.target.value);
                  setPageSize(next);
                  setPage(1);
                  fetchLogs(1, next);
                }}
              >
                {[10, 25, 50].map((size) => (
                  <option key={size} value={size}>
                    {size} / page
                  </option>
                ))}
              </select>
            </div>

            <div className="auth-filter auth-filter-actions">
              <button type="button" className="btn btn-secondary" onClick={resetFilters}>
                Reset filters
              </button>
            </div>
          </div>

          <div className="auth-summary-row">
            <div className="auth-summary-card">
              <div className="summary-label">Total Entries</div>
              <div className="summary-value">{loading ? "..." : total}</div>
            </div>
            <div className="auth-summary-card">
              <div className="summary-label">Unique Users</div>
              <div className="summary-value">{loading ? "..." : uniqueUsers}</div>
            </div>
          </div>

          <div className="auth-table-card">
            <div className="auth-pagination-row">
              <span>
                Showing {rangeStart}-{rangeEnd} of {total}
              </span>
              <div className="auth-pagination-controls">
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={page <= 1}
                  onClick={() => fetchLogs(page - 1, pageSize)}
                >
                  Prev
                </button>
                <span>
                  Page {page} of {pageCount}
                </span>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={page >= pageCount}
                  onClick={() => fetchLogs(page + 1, pageSize)}
                >
                  Next
                </button>
              </div>
            </div>

            <table className="auth-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Event</th>
                  <th>Email</th>
                  <th>Success</th>
                  <th>Reason</th>
                  <th>IP</th>
                  <th>View</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td colSpan="7" className="auth-skeleton-row">
                      Loading...
                    </td>
                  </tr>
                )}
                {!loading &&
                  logs.map((entry) => (
                    <tr key={entry.id}>
                      <td>{formatTimestamp(entry.occurred_at)}</td>
                      <td>
                        <span className="auth-event-badge">{entry.event_type}</span>
                      </td>
                      <td>{entry.email || "-"}</td>
                      <td>
                        <span
                          className={`auth-status-badge ${
                            isSuccess(entry) ? "status-success" : "status-failure"
                          }`}
                        >
                          {isSuccess(entry) ? "Success" : "Failure"}
                        </span>
                      </td>
                      <td>{entry.failure_reason || "-"}</td>
                      <td>{entry.ip || "-"}</td>
                      <td>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          onClick={() => setSelected(entry)}
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>

            {!loading && logs.length === 0 && (
              <div className="auth-empty-state">No auth entries found.</div>
            )}
          </div>
        </div>
      </main>

      {selected && (
        <div className="auth-modal-overlay" onClick={() => setSelected(null)}>
          <div className="auth-modal" onClick={(e) => e.stopPropagation()}>
            <div className="auth-modal-header">
              <h3>Auth Event Details</h3>
              <button type="button" className="btn btn-secondary" onClick={() => setSelected(null)}>
                Close
              </button>
            </div>
            <div className="auth-modal-body">
              <div>
                <strong>Time:</strong> {formatTimestamp(selected.occurred_at)}
              </div>
              <div>
                <strong>Event:</strong> {selected.event_type}
              </div>
              <div>
                <strong>Email:</strong> {selected.email || "-"}
              </div>
              <div>
                <strong>Success:</strong> {selected.success ? "Success" : "Failure"}
              </div>
              <div>
                <strong>Reason:</strong> {selected.failure_reason || "-"}
              </div>
              <div>
                <strong>IP:</strong> {selected.ip || "-"}
              </div>
              <div>
                <strong>User Agent:</strong> {selected.user_agent || "-"}
              </div>
              <div>
                <strong>Method:</strong> {selected.method || "-"}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
