import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  getCaseFeed,
  getMyCaseRequests,
  getSpecializations,
  requestAccess,
} from "../services/cases.service";

export default function LawyerCaseFeedPage() {
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [requestsLoading, setRequestsLoading] = useState(true);
  const [error, setError] = useState("");
  const [requestErrorById, setRequestErrorById] = useState({});
  const [specializations, setSpecializations] = useState([]);
  const [specializationsLoading, setSpecializationsLoading] = useState(true);
  const [specializationsError, setSpecializationsError] = useState("");

  const [filters, setFilters] = useState({ district: "", specialization_id: "" });
  const [requestingId, setRequestingId] = useState(null);
  const [requestMessage, setRequestMessage] = useState("");
  const [requestsByCaseId, setRequestsByCaseId] = useState({});

  const normalizeStatus = (value) => String(value || "").toUpperCase();

  const loadCases = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await getCaseFeed({
        district: filters.district || undefined,
        specialization_id: filters.specialization_id
          ? Number(filters.specialization_id)
          : undefined,
      });
      setCases(data || []);
    } catch (err) {
      const message =
        err?.response?.data?.detail ||
        err?.response?.data?.message ||
        "Failed to load cases.";
      setError(message);
      setCases([]);
    } finally {
      setLoading(false);
    }
  };

  const loadMyRequests = async () => {
    setRequestsLoading(true);
    try {
      const data = await getMyCaseRequests();
      const next = {};
      (data || []).forEach((req) => {
        if (req?.case_id != null) {
          next[req.case_id] = req;
        }
      });
      setRequestsByCaseId(next);
    } catch (err) {
      setRequestsByCaseId({});
    } finally {
      setRequestsLoading(false);
    }
  };

  const loadSpecializations = async () => {
    setSpecializationsLoading(true);
    setSpecializationsError("");
    try {
      const data = await getSpecializations();
      setSpecializations(Array.isArray(data) ? data : []);
    } catch (err) {
      const message =
        err?.response?.data?.detail ||
        err?.response?.data?.message ||
        "Failed to load specializations.";
      setSpecializationsError(message);
      setSpecializations([]);
    } finally {
      setSpecializationsLoading(false);
    }
  };

  useEffect(() => {
    loadCases();
    loadMyRequests();
    loadSpecializations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applyFilters = () => {
    loadCases();
  };

  const startRequest = (caseId) => {
    if (requestsByCaseId[caseId]) return;
    setRequestingId(caseId);
    setRequestMessage("");
    setRequestErrorById((prev) => ({ ...prev, [caseId]: "" }));
  };

  const cancelRequest = () => {
    setRequestingId(null);
    setRequestMessage("");
  };

  const submitRequest = async (caseId) => {
    try {
      const created = await requestAccess(caseId, requestMessage);
      const fallback = {
        id: created?.id,
        case_id: caseId,
        status: created?.status || "pending",
        created_at: created?.created_at || new Date().toISOString(),
      };
      const resolved = created?.case_id ? created : fallback;
      setRequestsByCaseId((prev) => ({ ...prev, [caseId]: resolved }));
      setRequestingId(null);
      setRequestMessage("");
      setRequestErrorById((prev) => ({ ...prev, [caseId]: "" }));
    } catch (err) {
      const message =
        err?.response?.data?.detail ||
        err?.response?.data?.message ||
        "Failed to submit request.";
      setRequestErrorById((prev) => ({ ...prev, [caseId]: message }));
    }
  };

  const caseRequestStatus = useMemo(() => {
    const result = {};
    Object.entries(requestsByCaseId).forEach(([caseId, req]) => {
      result[caseId] = normalizeStatus(req?.status);
    });
    return result;
  }, [requestsByCaseId]);

  return (
    <div className="min-h-screen bg-slate-950 text-white p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
          <div>
            <div className="text-sm text-slate-400">Case Feed</div>
            <h1 className="text-3xl font-bold">Open Cases</h1>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 w-full md:w-auto">
            <input
              className="px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
              placeholder="District"
              value={filters.district}
              onChange={(e) => setFilters((f) => ({ ...f, district: e.target.value }))}
            />
            <div>
              <select
                className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                value={filters.specialization_id}
                onChange={(e) => setFilters((f) => ({ ...f, specialization_id: e.target.value }))}
              >
                <option value="">
                  {specializationsLoading ? "Loading..." : "All specializations"}
                </option>
                {!specializationsLoading &&
                  specializations.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
              </select>
              {specializationsError && (
                <div className="mt-1 text-xs text-red-300">{specializationsError}</div>
              )}
            </div>
            <button
              onClick={applyFilters}
              className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-sm font-semibold"
            >
              Apply
            </button>
          </div>
        </div>

        {loading && <div className="text-slate-300">Loading cases…</div>}
        {error && !loading && (
          <div className="text-sm text-red-300 border border-red-700 bg-red-900/30 rounded-lg p-3">
            {error}
          </div>
        )}

        {!loading && !error && cases.length === 0 && (
          <div className="border border-slate-800 bg-slate-900/60 rounded-lg p-4 text-slate-300">
            No open cases found. Adjust filters or check again later.
          </div>
        )}

        {!loading && !error && cases.length > 0 && (
          <div className="grid md:grid-cols-2 gap-4">
            {cases.map((c) => (
              <div
                key={c.id}
                className="border border-slate-800 rounded-xl bg-slate-900/70 p-4 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <div className="text-lg font-semibold text-white">{c.title}</div>
                  <div className="px-3 py-1 rounded-full text-xs bg-slate-800 border border-slate-700 text-slate-200">
                    {c.status}
                  </div>
                </div>
                <div className="text-sm text-amber-200">
                  {c.specialization?.name || c.specialization_name || c.category || "—"}
                </div>
                <div className="text-sm text-slate-400">{c.district}</div>
                <div className="text-sm text-slate-300 line-clamp-3">{c.summary_public}</div>
                <div className="text-xs text-slate-500">
                  Created: {c.created_at ? new Date(c.created_at).toLocaleString() : "—"}
                </div>

                {requestErrorById[c.id] && (
                  <div className="text-sm text-red-300 border border-red-700/60 bg-red-900/30 rounded-lg p-2">
                    {requestErrorById[c.id]}
                  </div>
                )}

                {requestingId === c.id ? (
                  <div className="space-y-2">
                    <textarea
                      value={requestMessage}
                      onChange={(e) => setRequestMessage(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                      placeholder="Optional message to the client"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => submitRequest(c.id)}
                        className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-sm font-semibold"
                      >
                        Submit
                      </button>
                      <button
                        onClick={cancelRequest}
                        className="px-4 py-2 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-sm"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : caseRequestStatus[c.id] === "PENDING" ? (
                  <button
                    className="px-4 py-2 rounded-lg bg-slate-800 border border-slate-700 text-sm font-semibold opacity-70 cursor-not-allowed"
                    disabled
                  >
                    Requested
                  </button>
                ) : caseRequestStatus[c.id] === "APPROVED" ? (
                  <div className="flex flex-wrap gap-2">
                    <button
                      className="px-4 py-2 rounded-lg bg-emerald-900/40 border border-emerald-600/40 text-sm font-semibold text-emerald-200 opacity-80 cursor-not-allowed"
                      disabled
                    >
                      Approved
                    </button>
                    <Link
                      to={`/lawyer/cases/${c.id}`}
                      className="px-4 py-2 rounded-lg bg-slate-800 border border-slate-700 hover:bg-slate-700 text-sm font-semibold"
                    >
                      View Case
                    </Link>
                  </div>
                ) : caseRequestStatus[c.id] === "REJECTED" ? (
                  <button
                    className="px-4 py-2 rounded-lg bg-rose-900/40 border border-rose-700/50 text-sm font-semibold text-rose-200 opacity-80 cursor-not-allowed"
                    disabled
                  >
                    Rejected
                  </button>
                ) : (
                  <button
                    onClick={() => startRequest(c.id)}
                    disabled={requestsLoading}
                    className="px-4 py-2 rounded-lg bg-slate-800 border border-slate-700 hover:bg-slate-700 text-sm font-semibold"
                  >
                    Request Access
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
