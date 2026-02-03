import { Fragment, useEffect, useMemo, useState } from "react";
import api from "../../services/api";
import "./AuditLog.css";

const ACTIONS = [
  "All Actions",
  "document_uploaded",
  "DOCUMENT_DELETED",
  "DOCUMENT_COMMENTED",
  "BOOKING_CREATED",
  "BOOKING_CONFIRMED",
  "BOOKING_REJECTED",
  "BOOKING_CANCELLED",
  "KYC_APPROVED",
  "KYC_REJECTED",
  "DISPUTE_RESOLVED",
  "PRIVILEGE_CHANGED",
  "DEV_SAMPLE_EVENT",
];

const SUCCESS_OPTIONS = ["All", "Success", "Failure"];

export default function AuditLog() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [action, setAction] = useState("All Actions");
  const [success, setSuccess] = useState("All");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [total, setTotal] = useState(0);
  const [expanded, setExpanded] = useState(new Set());

  // simple debounce
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const fetchLogs = async (nextPage = page, nextPageSize = pageSize) => {
    setLoading(true);
    setError("");
    try {
      const params = {
        page: nextPage,
        page_size: nextPageSize,
      };
      if (debouncedSearch) params.keyword = debouncedSearch;
      if (action && action !== "All Actions") params.action = action;
      if (success === "Success") params.success = "success";
      if (success === "Failure") params.success = "failure";
      if (dateFrom) params.date_from = `${dateFrom}T00:00:00`;
      if (dateTo) params.date_to = `${dateTo}T23:59:59`;

      const res = await api.get("/api/admin/audit-logs", { params });
      setLogs(res.data?.items || []);
      setTotal(res.data?.total || 0);
      setPage(res.data?.page || nextPage);
      setPageSize(res.data?.page_size || nextPageSize);
    } catch (err) {
      const msg =
        err?.response?.data?.detail ||
        err?.response?.data?.message ||
        "Failed to load audit logs.";
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
  }, [debouncedSearch, action, success, dateFrom, dateTo]);

  const todayCount = useMemo(() => {
    const today = new Date().toDateString();
    return logs.filter((l) => {
      const d = l.created_at ? new Date(l.created_at).toDateString() : "";
      return d === today;
    }).length;
  }, [logs]);

  const exportCSV = () => {
    if (!logs.length) return;
    const headers = [
      "id",
      "created_at",
      "actor_email",
      "actor_user_id",
      "actor_role",
      "action",
      "entity_type",
      "entity_id",
      "success",
      "description",
    ];
    const rows = logs.map((l) =>
      headers
        .map((h) => {
          const v = l[h] ?? "";
          const escaped = String(v).replace(/"/g, '""');
          return `"${escaped}"`;
        })
        .join(",")
    );
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "audit_logs.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  const exportJSON = () => {
    if (!logs.length) return;
    const blob = new Blob([JSON.stringify(logs, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "audit_logs.json";
    link.click();
    URL.revokeObjectURL(url);
  };

  const resetFilters = () => {
    setSearch("");
    setAction("All Actions");
    setSuccess("All");
    setDateFrom("");
    setDateTo("");
    setPage(1);
    fetchLogs(1, pageSize);
  };

  const formatTimestamp = (ts) => {
    if (!ts) return "-";
    try {
      const d = new Date(ts);
      return `${d.toLocaleDateString()} ${d.toLocaleTimeString()}`;
    } catch {
      return ts;
    }
  };

  const formatActor = (entry) => {
    const role = entry.actor_role || entry?.meta?.actor_role;
    const base = entry.actor_email || (entry.actor_user_id ? `#${entry.actor_user_id}` : "-");
    return role ? `${base} (${role})` : base;
  };

  const formatEntity = (entry) => {
    const entityType = entry.entity_type || entry?.meta?.entity_type;
    const entityId = entry.entity_id || entry?.meta?.entity_id;
    if (!entityType && !entityId) return "-";
    return `${entityType || "entity"}${entityId ? `:${entityId}` : ""}`;
  };

  const isSuccess = (entry) => {
    if (typeof entry.success === "boolean") return entry.success;
    if (typeof entry.success === "string") {
      const s = entry.success.toLowerCase();
      if (["success", "true", "1", "ok"].includes(s)) return true;
      if (["failure", "false", "0", "error", "failed"].includes(s)) return false;
    }
    if (typeof entry?.meta?.success === "boolean") return entry.meta.success;
    if (typeof entry?.meta?.success === "string") {
      const s = entry.meta.success.toLowerCase();
      if (["success", "true", "1", "ok"].includes(s)) return true;
      if (["failure", "false", "0", "error", "failed"].includes(s)) return false;
    }
    return null;
  };

  const formatMeta = (entry) => {
    const meta = entry.meta || {};
    return JSON.stringify(meta, null, 2);
  };

  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(total, (page - 1) * pageSize + logs.length);

  return (
    <div className="audit-log-page">
      <div className="diamond-pattern"></div>

      <main className="audit-log-main">
        <div className="audit-log-container">
          <h1 className="audit-page-title">Case Audit Log</h1>

          {error && <div className="audit-error-banner">{error}</div>}

          <div className="audit-search-card">
            <div className="audit-search-wrapper">
              <svg
                className="audit-search-icon"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>

              <input
                type="text"
                className="audit-search-input"
                placeholder="Search description or meta..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <div className="audit-filter-wrapper">
              <svg
                className="audit-filter-icon"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
                />
              </svg>

              <select
                className="audit-filter-select bg-slate-800 text-slate-100 border border-slate-600 focus:outline-none focus:ring-2 focus:ring-yellow-500"
                value={action}
                onChange={(e) => setAction(e.target.value)}
              >
                {ACTIONS.map((a) => (
                  <option
                    key={a}
                    value={a}
                    className="bg-slate-800 text-slate-100"
                    style={{ backgroundColor: "#0f172a", color: "#e2e8f0" }}
                  >
                    {a}
                  </option>
                ))}
              </select>
            </div>

            <div className="audit-filter-wrapper">
              <select
                className="audit-filter-select bg-slate-800 text-slate-100 border border-slate-600 focus:outline-none focus:ring-2 focus:ring-yellow-500"
                value={success}
                onChange={(e) => setSuccess(e.target.value)}
              >
                {SUCCESS_OPTIONS.map((opt) => (
                  <option
                    key={opt}
                    value={opt}
                    className="bg-slate-800 text-slate-100"
                    style={{ backgroundColor: "#0f172a", color: "#e2e8f0" }}
                  >
                    {opt}
                  </option>
                ))}
              </select>
            </div>

            <div className="audit-filter-row">
              <div className="audit-filter-wrapper audit-date-wrapper">
                <label className="audit-date-label">From</label>
                <input
                  type="date"
                  className="audit-date-input"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                />
              </div>

              <div className="audit-filter-wrapper audit-date-wrapper">
                <label className="audit-date-label">To</label>
                <input
                  type="date"
                  className="audit-date-input"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                />
              </div>
            </div>

            <div className="audit-filter-wrapper">
              <select
                className="audit-filter-select bg-slate-800 text-slate-100 border border-slate-600 focus:outline-none focus:ring-2 focus:ring-yellow-500"
                value={pageSize}
                onChange={(e) => {
                  const next = Number(e.target.value);
                  setPageSize(next);
                  setPage(1);
                  fetchLogs(1, next);
                }}
              >
                {[25, 50, 100].map((size) => (
                  <option
                    key={size}
                    value={size}
                    className="bg-slate-800 text-slate-100"
                    style={{ backgroundColor: "#0f172a", color: "#e2e8f0" }}
                  >
                    {size} / page
                  </option>
                ))}
              </select>
            </div>

            <div className="audit-filter-wrapper audit-reset-wrapper">
              <button
                type="button"
                className="btn btn-secondary audit-reset-btn"
                onClick={resetFilters}
              >
                Reset filters
              </button>
            </div>

          </div>

          <div className="audit-summary-grid">
            <div className="audit-summary-card">
              <div className="summary-label">Total Entries</div>
              <div className="summary-value">{loading ? "..." : total}</div>
            </div>
            <div className="audit-summary-card">
              <div className="summary-label">Today</div>
              <div className="summary-value">{loading ? "..." : todayCount}</div>
            </div>
            <div className="audit-summary-card">
              <div className="summary-label">Unique Users</div>
              <div className="summary-value">
                {loading
                  ? "..."
                  : new Set(logs.map((l) => l.actor_email || l.actor_user_id || "-")).size}
              </div>
            </div>
            <div className="audit-summary-card">
              <div className="summary-label">Action Types</div>
              <div className="summary-value">
                {loading ? "..." : new Set(logs.map((l) => l.action || "-")).size}
              </div>
            </div>
          </div>

          <div className="audit-table-card">
            <div className="audit-pagination-row">
              <span>
                Showing {rangeStart}-{rangeEnd} of {total}
              </span>
              <div className="audit-pagination-controls">
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
            <table className="audit-table">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Actor</th>
                  <th>Action</th>
                  <th>Entity</th>
                  <th>Status</th>
                  <th>Description</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td colSpan="7" className="audit-skeleton-row">
                      Loading...
                    </td>
                  </tr>
                )}
                {!loading &&
                  logs.map((entry) => {
                    const successValue = isSuccess(entry);
                    const expandedNow = expanded.has(entry.id);
                    return (
                      <Fragment key={entry.id}>
                        <tr>
                          <td>
                            <div className="audit-timestamp">
                              <span className="timestamp-icon">#</span>
                              <div className="timestamp-details">
                                <span className="timestamp-date">
                                  {formatTimestamp(entry.created_at)}
                                </span>
                              </div>
                            </div>
                          </td>
                          <td>
                            <div className="audit-user">
                              <span className="user-icon">@</span>
                              <span>{formatActor(entry)}</span>
                            </div>
                          </td>
                          <td>
                            <span
                              className={`audit-action-badge action-${(entry.action || "")
                                .toLowerCase()
                                .replaceAll("_", "-")}`}
                            >
                              {entry.action}
                            </span>
                          </td>
                          <td>
                            <span className="audit-entity">{formatEntity(entry)}</span>
                          </td>
                          <td>
                            <span
                              className={`audit-status-badge ${
                                successValue === true
                                  ? "status-success"
                                  : successValue === false
                                  ? "status-failure"
                                  : "status-unknown"
                              }`}
                            >
                              {successValue === true
                                ? "Success"
                                : successValue === false
                                ? "Failure"
                                : "Unknown"}
                            </span>
                          </td>
                          <td>
                            <span className="audit-description">{entry.description}</span>
                          </td>
                          <td>
                            <button
                              type="button"
                              className="btn btn-secondary audit-details-btn"
                              onClick={() => {
                                const next = new Set(expanded);
                                if (next.has(entry.id)) {
                                  next.delete(entry.id);
                                } else {
                                  next.add(entry.id);
                                }
                                setExpanded(next);
                              }}
                            >
                              {expandedNow ? "Hide" : "View"}
                            </button>
                          </td>
                        </tr>
                        {expandedNow && (
                          <tr className="audit-details-row">
                            <td colSpan="7">
                              <pre className="audit-details-pre">{formatMeta(entry)}</pre>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
              </tbody>
            </table>

            {!loading && logs.length === 0 && (
              <div className="no-audit-data">
                <p>No audit entries found.</p>
              </div>
            )}
          </div>

          <div className="audit-export-card">
            <h3 className="export-title">Export Options</h3>
            <div className="export-buttons">
              <button
                className="btn btn-primary export-btn export-csv"
                onClick={exportCSV}
                disabled={!logs.length}
              >
                Export as CSV
              </button>
              <button
                className="btn btn-secondary export-btn export-json"
                onClick={exportJSON}
                disabled={!logs.length}
              >
                Export as JSON
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
