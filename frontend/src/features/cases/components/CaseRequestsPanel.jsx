import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getCaseRequests, updateCaseRequest } from "../services/cases.service";

export default function CaseRequestsPanel({ caseId }) {
  const navigate = useNavigate();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [actioningId, setActioningId] = useState(null);

  const loadRequests = async () => {
    setLoading(true);
    setError("");
    setSuccess("");
    try {
      const data = await getCaseRequests(caseId);
      setRequests(data || []);
    } catch (err) {
      const message =
        err?.response?.data?.detail ||
        err?.response?.data?.message ||
        "Failed to load requests.";
      setError(message);
      setRequests([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!caseId) return;
    loadRequests();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId]);

  const handleAction = async (requestId, status) => {
    setActioningId(requestId);
    setSuccess("");
    try {
      await updateCaseRequest(caseId, requestId, status);
      setSuccess(`Request #${requestId} ${status}.`);
      await loadRequests();
    } catch (err) {
      const message =
        err?.response?.data?.detail ||
        err?.response?.data?.message ||
        "Action failed.";
      setError(message);
    } finally {
      setActioningId(null);
    }
  };

  return (
    <div className="border border-slate-800 rounded-xl bg-slate-900/70 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm text-slate-400">Requests</div>
          <div className="text-lg font-semibold text-white">
            {requests.length} request{requests.length === 1 ? "" : "s"}
          </div>
        </div>
        <button
          onClick={loadRequests}
          className="px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-sm text-white hover:bg-slate-700"
        >
          Refresh
        </button>
      </div>

      {loading && <div className="text-slate-300 text-sm">Loading requests…</div>}
      {error && !loading && (
        <div className="text-sm text-red-300 border border-red-700 bg-red-900/30 rounded-lg p-3">
          {error}
        </div>
      )}
      {success && !loading && (
        <div className="text-sm text-emerald-200 border border-emerald-700 bg-emerald-900/20 rounded-lg p-3">
          {success}
        </div>
      )}

      {!loading && !error && requests.length === 0 && (
        <div className="text-sm text-slate-300">No requests yet.</div>
      )}

      {!loading && !error && requests.length > 0 && (
        <div className="space-y-3">
          {requests.map((r) => (
            <div
              key={r.id}
              className="rounded-lg border border-slate-800 bg-slate-900/80 p-3 space-y-2"
            >
              <div className="flex items-center justify-between">
                <div className="text-white font-semibold">
                  {r?.lawyer?.full_name || `Lawyer #${r.lawyer_id}`}
                </div>
                <div className="px-3 py-1 rounded-full text-xs bg-slate-800 border border-slate-700 text-slate-200">
                  {r.status}
                </div>
              </div>
              {r?.lawyer?.verified && (
                <div className="text-xs text-amber-200">Verified</div>
              )}
              {r.message && <div className="text-sm text-slate-300">“{r.message}”</div>}
              <div className="text-xs text-slate-500">
                Requested: {r.created_at ? new Date(r.created_at).toLocaleString() : "—"}
              </div>
              {r.lawyer_id && (
                <div>
                  <button
                    type="button"
                    onClick={() => navigate(`/client/profile/${r?.lawyer?.id || r.lawyer_id}`)}
                    className="px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-sm text-white hover:bg-slate-700"
                  >
                    View Profile
                  </button>
                </div>
              )}
              {r.status === "pending" && (
                <div className="flex gap-2">
                  <button
                    disabled={actioningId === r.id}
                    onClick={() => handleAction(r.id, "approved")}
                    className="px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-sm font-semibold text-white disabled:opacity-60"
                  >
                    Approve
                  </button>
                  <button
                    disabled={actioningId === r.id}
                    onClick={() => handleAction(r.id, "rejected")}
                    className="px-3 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-sm font-semibold text-white disabled:opacity-60"
                  >
                    Reject
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
