import { useEffect, useState } from "react";
import api from "../../../services/api";

const STATUS_OPTIONS = ["All", "Success", "Failure"];

export default function AdminAuthLogPage() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("All");
  const [reason, setReason] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [total, setTotal] = useState(0);

  const [debouncedQuery, setDebouncedQuery] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(t);
  }, [query]);

  const fetchLogs = async (nextPage = page, nextPageSize = pageSize) => {
    setLoading(true);
    setError("");
    try {
      const params = {
        page: nextPage,
        page_size: nextPageSize,
      };
      if (debouncedQuery) params.q = debouncedQuery;
      if (status === "Success") params.status = "success";
      if (status === "Failure") params.status = "failure";
      if (reason) params.reason = reason;
      if (dateFrom) params.from = `${dateFrom}T00:00:00`;
      if (dateTo) params.to = `${dateTo}T23:59:59`;

      const res = await api.get("/api/admin/auth-logs", { params });
      const items = res.data?.items || res.data?.results || [];
      const count = res.data?.total ?? res.data?.count ?? 0;
      setLogs(Array.isArray(items) ? items : []);
      setTotal(Number.isFinite(Number(count)) ? Number(count) : 0);
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
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs(1, pageSize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQuery, status, reason, dateFrom, dateTo]);

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

  const statusLabel = (entry) => {
    if (typeof entry?.success === "boolean") return entry.success ? "Success" : "Failure";
    if (typeof entry?.status === "string") return entry.status;
    return entry?.success ? "Success" : "Failure";
  };

  const userLabel = (entry) => entry?.user || entry?.user_id || "-";

  return (
    <div className="space-y-6">
      <div className="bg-slate-900/70 border border-slate-700 rounded-xl p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white">Auth Log</h1>
            <p className="text-slate-300 text-sm mt-1">
              Track login/logout activity and authentication failures.
            </p>
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-900/40 border border-red-700 p-3 rounded text-red-200 text-sm">
          {error}
        </div>
      )}

      <div className="bg-slate-900/70 border border-slate-700 rounded-xl p-5">
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <div className="flex flex-col gap-2">
            <label className="text-xs uppercase text-slate-400">Search</label>
            <input
              type="text"
              className="px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-sm text-white"
              placeholder="User or email"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-xs uppercase text-slate-400">Status</label>
            <select
              className="px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-sm text-white"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-xs uppercase text-slate-400">Reason</label>
            <input
              type="text"
              className="px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-sm text-white"
              placeholder="Failure reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-xs uppercase text-slate-400">From</label>
            <input
              type="date"
              className="px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-sm text-white"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-xs uppercase text-slate-400">To</label>
            <input
              type="date"
              className="px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-sm text-white"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-xs uppercase text-slate-400">Page Size</label>
            <select
              className="px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-sm text-white"
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
        </div>
      </div>

      <div className="bg-slate-900/70 border border-slate-700 rounded-xl p-5">
        <div className="flex items-center justify-between text-xs text-slate-400 mb-4">
          <span>
            Showing {rangeStart}-{rangeEnd} of {total}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="px-3 py-1 rounded border border-slate-600 text-slate-200 text-xs disabled:opacity-50"
              disabled={page <= 1}
              onClick={() => fetchLogs(page - 1, pageSize)}
            >
              Prev
            </button>
            <span className="text-slate-300">
              Page {page} of {pageCount}
            </span>
            <button
              type="button"
              className="px-3 py-1 rounded border border-slate-600 text-slate-200 text-xs disabled:opacity-50"
              disabled={page >= pageCount}
              onClick={() => fetchLogs(page + 1, pageSize)}
            >
              Next
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm text-slate-200">
            <thead>
              <tr className="text-left text-slate-400 border-b border-slate-700">
                <th className="py-2 pr-4">Time</th>
                <th className="py-2 pr-4">User</th>
                <th className="py-2 pr-4">Email</th>
                <th className="py-2 pr-4">IP</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2">Reason</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan="6" className="py-6 text-center text-slate-400">
                    Loading...
                  </td>
                </tr>
              )}
              {!loading &&
                logs.map((entry) => (
                  <tr key={entry.id} className="border-b border-slate-800">
                    <td className="py-3 pr-4">
                      {formatTimestamp(entry.occurred_at || entry.created_at)}
                    </td>
                    <td className="py-3 pr-4">{userLabel(entry)}</td>
                    <td className="py-3 pr-4">{entry.email || "-"}</td>
                    <td className="py-3 pr-4">{entry.ip || entry.ip_address || "-"}</td>
                    <td className="py-3 pr-4">
                      <span
                        className={`px-2 py-1 rounded-full text-xs border ${
                          String(statusLabel(entry)).toLowerCase() === "success"
                            ? "border-emerald-500/60 text-emerald-200 bg-emerald-500/10"
                            : "border-rose-500/60 text-rose-200 bg-rose-500/10"
                        }`}
                      >
                        {statusLabel(entry)}
                      </span>
                    </td>
                    <td className="py-3">{entry.failure_reason || entry.reason || "-"}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>

        {!loading && logs.length === 0 && (
          <div className="text-center text-slate-400 py-8">
            No auth logs found.
          </div>
        )}
      </div>
    </div>
  );
}
