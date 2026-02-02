import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  assignApprenticeToCase,
  fetchApprenticeChoices,
  fetchCaseChoices,
} from "../api/apprenticeshipApi";

export default function LawyerApprenticesPage() {
  const location = useLocation();
  const navigate = useNavigate();

  const initialTab = useMemo(() => {
    const t = location?.state?.tab;
    return t === "notes" ? "notes" : "assign";
  }, [location?.state?.tab]);

  const [tab, setTab] = useState(initialTab);

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  // Dropdown data
  const [apprentices, setApprentices] = useState([]);
  const [cases, setCases] = useState([]);
  const [choicesLoading, setChoicesLoading] = useState(true);
  const [choicesErr, setChoicesErr] = useState("");

  // Assign
  const [apprenticeId, setApprenticeId] = useState("");
  const [caseId, setCaseId] = useState("");
  const [assignLoading, setAssignLoading] = useState(false);
  const [ok, setOk] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    (async () => {
      setChoicesLoading(true);
      setChoicesErr("");
      try {
        const [appr, cs] = await Promise.all([
          fetchApprenticeChoices(),
          fetchCaseChoices(),
        ]);
        setApprentices(Array.isArray(appr) ? appr : []);
        setCases(Array.isArray(cs) ? cs : []);
      } catch (e) {
        setChoicesErr(
          e?.response?.data?.detail ||
            "Failed to load dropdown choices (apprentices/cases)."
        );
      } finally {
        setChoicesLoading(false);
      }
    })();
  }, []);

  const apprenticeLabel = (a) => {
    const name = a?.full_name ?? `Apprentice #${a?.id}`;
    const email = a?.email ? ` (${a.email})` : "";
    return `${name}${email}`;
  };

  const caseLabel = (c) => {
    const title = c?.title ?? `Case #${c?.id}`;
    const district = c?.district ? ` • ${c.district}` : "";
    const category = c?.category ? ` • ${c.category}` : "";
    const status = c?.status ? ` • ${c.status}` : "";
    return `${title}${district}${category}${status}`;
  };

  const handleAssign = async () => {
    setOk("");
    setErr("");
    setAssignLoading(true);

    try {
      await assignApprenticeToCase({
        case_id: Number(caseId),
        apprentice_id: Number(apprenticeId),
      });
      setOk("Apprentice assigned successfully.");
      setApprenticeId("");
      setCaseId("");
    } catch (e) {
      setErr(e?.response?.data?.detail || "Failed to assign apprentice.");
    } finally {
      setAssignLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-slate-900/40 border border-slate-700/60 rounded-2xl p-8 text-white">
        <h1 className="text-3xl font-bold">Apprenticeship</h1>
        <p className="text-slate-300 mt-2">
          Assign apprentices to cases and review internal notes.
        </p>

        {/* Tabs */}
        <div className="mt-5 flex gap-2">
          <button
            onClick={() => setTab("assign")}
            className={[
              "px-4 py-2 rounded-lg border text-sm font-semibold",
              tab === "assign"
                ? "bg-amber-500 text-white border-amber-400/50"
                : "bg-slate-950/30 text-slate-200 border-slate-700/60 hover:bg-slate-800/40",
            ].join(" ")}
          >
            Assign
          </button>

          <button
            onClick={() => setTab("notes")}
            className={[
              "px-4 py-2 rounded-lg border text-sm font-semibold",
              tab === "notes"
                ? "bg-amber-500 text-white border-amber-400/50"
                : "bg-slate-950/30 text-slate-200 border-slate-700/60 hover:bg-slate-800/40",
            ].join(" ")}
          >
            Notes
          </button>
        </div>
      </div>

      {/* Dropdown load status */}
      {choicesErr && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {choicesErr}
        </div>
      )}

      {/* Assign */}
      {tab === "assign" && (
        <div className="bg-slate-900/40 border border-slate-700/60 rounded-2xl p-6 text-white">
          <h2 className="text-xl font-semibold">Assign apprentice to case</h2>
          <p className="text-slate-300 text-sm mt-1">
            Select an apprentice and a case to assign.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            <label className="text-sm text-slate-200">
              Apprentice
              <select
                className="mt-2 w-full rounded-lg bg-slate-950/30 border border-slate-700/60 px-4 py-3 text-white outline-none focus:border-amber-400/70 focus:ring-2 focus:ring-amber-400/30"
                value={apprenticeId}
                onChange={(e) => setApprenticeId(e.target.value)}
                disabled={choicesLoading}
              >
                <option value="">
                  {choicesLoading
                    ? "Loading apprentices..."
                    : "Select an apprentice"}
                </option>
                {apprentices.map((a) => (
                  <option key={a.id} value={a.id}>
                    {apprenticeLabel(a)}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-sm text-slate-200">
              Case
              <select
                className="mt-2 w-full rounded-lg bg-slate-950/30 border border-slate-700/60 px-4 py-3 text-white outline-none focus:border-amber-400/70 focus:ring-2 focus:ring-amber-400/30"
                value={caseId}
                onChange={(e) => setCaseId(e.target.value)}
                disabled={choicesLoading}
              >
                <option value="">
                  {choicesLoading ? "Loading cases..." : "Select a case"}
                </option>
                {cases.map((c) => (
                  <option key={c.id} value={c.id}>
                    {caseLabel(c)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {ok && (
            <div className="mt-4 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
              {ok}
            </div>
          )}

          {err && (
            <div className="mt-4 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {err}
            </div>
          )}

          <div className="mt-5 flex gap-3">
            <button
              onClick={handleAssign}
              disabled={
                assignLoading || !apprenticeId || !caseId || choicesLoading
              }
              className="rounded-lg bg-amber-500 px-6 py-3 font-semibold text-white hover:bg-amber-400 disabled:opacity-60"
            >
              {assignLoading ? "Assigning..." : "Assign Apprentice"}
            </button>

            <button
              onClick={() => {
                setApprenticeId("");
                setCaseId("");
                setErr("");
                setOk("");
              }}
              className="rounded-lg bg-slate-800 border border-slate-700 px-6 py-3 font-semibold text-white hover:bg-slate-700"
              disabled={assignLoading}
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {/* Notes -> only Chat View */}
      {tab === "notes" && (
        <div className="bg-slate-900/40 border border-slate-700/60 rounded-2xl p-6 text-white">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold">Apprenticeship Chat</h2>
              <p className="text-slate-300 text-sm mt-1">
                Open the full chat view to read and reply to notes & review submissions.
              </p>
            </div>

            <button
              onClick={() => navigate("/lawyer/apprenticeship/notes")}
              className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-400"
            >
              Open Chat View
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
