import { useEffect, useMemo, useState } from "react";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from "recharts";
import {
  fetchMyApprenticeCases,
  fetchApprenticeCaseNotes,
  fetchMe,
  fetchUserById,
} from "../api/apprenticeshipApi";

const normalizeCaseId = (c) => c.case_id ?? c.caseId ?? c.id;

const roleToLabel = (role) => {
  const r = (role ?? "").toString().toLowerCase();
  if (!r) return "User";
  return r.charAt(0).toUpperCase() + r.slice(1);
};

const formatMonthYear = (dateStr) => {
  if (!dateStr) return "—";
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  } catch {
    return "—";
  }
};

const formatMDY = (dateStr) => {
  if (!dateStr) return "—";
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", { month: "numeric", day: "numeric", year: "numeric" });
  } catch {
    return "—";
  }
};

export default function ApprenticeProfile() {
  const [cases, setCases] = useState([]);
  const [notesCount, setNotesCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const [me, setMe] = useState(null);
  const [lawyers, setLawyers] = useState([]); // [{ id, full_name }]

  useEffect(() => {
    (async () => {
      try {
        // 1) Fetch real user from DB
        const meData = await fetchMe();
        setMe(meData);

        // 2) Fetch my cases
        const data = await fetchMyApprenticeCases();
        const allCases = Array.isArray(data) ? data : [];
        setCases(allCases);

        // 3) Notes count (best-effort): first 5 cases
        let totalNotes = 0;
        for (const c of allCases.slice(0, 5)) {
          try {
            const cid = normalizeCaseId(c);
            const notes = await fetchApprenticeCaseNotes(cid);
            if (Array.isArray(notes)) totalNotes += notes.length;
          } catch {
            // ignore
          }
        }
        setNotesCount(totalNotes);

        // 4) Supervising lawyers: resolve unique lawyer_id -> /api/users/{id}
        const uniqueLawyerIds = Array.from(
          new Set(
            allCases
              .map((c) => c.lawyer_id ?? c.lawyerId)
              .filter((x) => x !== undefined && x !== null)
          )
        );

        if (uniqueLawyerIds.length > 0) {
          const resolved = await Promise.all(
            uniqueLawyerIds.map(async (id) => {
              try {
                const u = await fetchUserById(id);
                return { id: u.id, full_name: u.full_name ?? `Lawyer #${id}` };
              } catch {
                return { id, full_name: `Lawyer #${id}` };
              }
            })
          );
          setLawyers(resolved);
        } else {
          setLawyers([]);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const email = me?.email ?? "—";
  const fullName = me?.full_name ?? "—";
  const role = me?.role ?? "apprentice";
  const memberSinceRaw = me?.created_at ?? null;

  const activeCases = useMemo(() => {
    return cases.filter((c) => {
      const status = (c.status ?? "active").toString().toLowerCase();
      return status !== "closed" && status !== "completed";
    }).length;
  }, [cases]);

  const statusPieData = useMemo(() => {
    const active = activeCases;
    const closed = Math.max(0, cases.length - active);
    return [
      { name: "Active", value: active },
      { name: "Closed", value: closed },
    ];
  }, [activeCases, cases.length]);

  const PIE_COLORS = ["#f59e0b", "#64748b"];

  const CARD_BASE =
    "bg-slate-900/50 border border-slate-700/60 rounded-2xl p-6 shadow-[0_0_0_1px_rgba(15,23,42,0.35)]";
  const CARD_INSET =
    "bg-slate-950/40 border border-slate-800/60 rounded-xl p-5";

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-4xl font-bold text-white mb-2 tracking-tight">
          Profile
        </h1>
        <p className="text-slate-300">Manage your apprentice account</p>
      </div>

      {/* Main Profile Card */}
      <div className={CARD_BASE}>
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
          <div className="w-20 h-20 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center shadow-[0_0_0_1px_rgba(245,158,11,0.12)]">
            <span className="text-4xl">👤</span>
          </div>

          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <h2 className="text-2xl font-bold text-white">{fullName}</h2>
              <span className="px-3 py-1 rounded-full bg-amber-500/20 border border-amber-500/30 text-amber-300 text-sm font-medium">
                {roleToLabel(role)}
              </span>
            </div>

            <div className="flex items-center gap-2 text-slate-400 mb-1">
              <span>📧</span>
              <span>{email}</span>
            </div>

            <div className="flex items-center gap-2 text-slate-400">
              <span>📅</span>
              <span>Joined {memberSinceRaw ? formatMonthYear(memberSinceRaw) : "—"}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Account Information */}
      <div className={CARD_BASE}>
        <h2 className="text-xl font-semibold text-white mb-4">Account Information</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <div className="text-slate-400 text-sm mb-1">Full Name</div>
            <div className="text-white font-medium">{fullName}</div>
          </div>

          <div>
            <div className="text-slate-400 text-sm mb-1">Email Address</div>
            <div className="text-white font-medium">{email}</div>
          </div>

          <div>
            <div className="text-slate-400 text-sm mb-1">Role</div>
            <span className="inline-block px-3 py-1 rounded-full bg-amber-500/20 border border-amber-500/30 text-amber-300 text-sm font-medium">
              {roleToLabel(role)}
            </span>
          </div>

          <div>
            <div className="text-slate-400 text-sm mb-1">Member Since</div>
            <div className="text-white font-medium">{memberSinceRaw ? formatMDY(memberSinceRaw) : "—"}</div>
          </div>
        </div>
      </div>

      {/* Supervising Lawyers */}
      <div className={CARD_BASE}>
        <h2 className="text-xl font-semibold text-white mb-4">Supervising Lawyers</h2>

        {loading ? (
          <div className="rounded-xl border border-slate-800/60 bg-slate-950/40 py-6 text-center text-slate-300">
            Loading...
          </div>
        ) : lawyers.length === 0 ? (
          <div className="rounded-xl border border-slate-800/60 bg-slate-950/40 py-6 text-center text-slate-300">
            No supervising lawyers found yet.
          </div>
        ) : (
          <div className="flex flex-wrap gap-4">
            {lawyers.map((l) => (
              <div
                key={l.id}
                className="flex items-center gap-3 p-4 bg-slate-950/40 border border-slate-700/60 rounded-xl shadow-[0_0_0_1px_rgba(15,23,42,0.3)]"
              >
                <div className="w-10 h-10 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center">
                  <span className="text-xl">👨‍⚖️</span>
                </div>
                <div className="text-white font-medium">{l.full_name}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Performance Overview */}
      <div className={CARD_BASE}>
        <h2 className="text-xl font-semibold text-white mb-4">Performance Overview</h2>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className={`${CARD_INSET} text-center`}>
            <div className="text-amber-300 text-3xl mb-2">⚖️</div>
            <div className="text-3xl font-bold text-white mb-1">{loading ? "—" : cases.length}</div>
            <div className="text-slate-400 text-sm">Total Cases Handled</div>
          </div>

          <div className={`${CARD_INSET} text-center`}>
            <div className="text-amber-300 text-3xl mb-2">🟠</div>
            <div className="text-3xl font-bold text-white mb-1">{loading ? "—" : activeCases}</div>
            <div className="text-slate-400 text-sm">Active Cases</div>
          </div>

          <div className={`${CARD_INSET} text-center`}>
            <div className="text-amber-300 text-3xl mb-2">📝</div>
            <div className="text-3xl font-bold text-white mb-1">{loading ? "—" : notesCount}</div>
            <div className="text-slate-400 text-sm">Notes Contributed</div>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className={`${CARD_INSET}`}>
            <div className="flex items-center justify-between mb-3">
              <div className="text-white font-semibold">Case Mix</div>
              <div className="text-slate-400 text-xs">Active vs Closed</div>
            </div>
            <div className="h-44">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#020617",
                      border: "1px solid #334155",
                      color: "#e5e7eb",
                    }}
                  />
                  <Pie
                    data={statusPieData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={45}
                    outerRadius={70}
                    paddingAngle={3}
                  >
                    {statusPieData.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className={`${CARD_INSET}`}>
            <div className="text-white font-semibold mb-2">Working Style</div>
            <div className="space-y-3 text-sm text-slate-300">
              <div className="flex items-center justify-between">
                <span>Active case ratio</span>
                <span className="text-amber-200">
                  {cases.length ? Math.round((activeCases / cases.length) * 100) : 0}%
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>Notes per case</span>
                <span className="text-amber-200">
                  {cases.length ? Math.round((notesCount / cases.length) * 10) / 10 : 0}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>Supervising lawyers</span>
                <span className="text-amber-200">{lawyers.length}</span>
              </div>
            </div>
            <div className="mt-4 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
              Keep notes concise and link evidence for faster reviews.
            </div>
          </div>
        </div>
      </div>

      {/* Apprentice Role */}
      <div className={CARD_BASE}>
        <div className="flex items-center gap-2 mb-4">
          <span className="text-amber-300 text-2xl">👤</span>
          <h2 className="text-xl font-semibold text-white">Apprentice Role</h2>
        </div>

        <p className="text-slate-300 mb-4">
          As an apprentice, you work closely with supervising lawyers to assist with case management, research, and documentation. Your notes and contributions are visible to lawyers but remain internal and are not shared with clients.
        </p>

        <ul className="space-y-2 text-slate-300">
          <li className="flex items-start gap-2"><span className="text-amber-300 mt-1">•</span><span>View and manage assigned cases</span></li>
          <li className="flex items-start gap-2"><span className="text-amber-300 mt-1">•</span><span>Add internal notes for case documentation</span></li>
          <li className="flex items-start gap-2"><span className="text-amber-300 mt-1">•</span><span>Access case documents and client information</span></li>
          <li className="flex items-start gap-2"><span className="text-amber-300 mt-1">•</span><span>Collaborate with supervising lawyers</span></li>
        </ul>
      </div>
    </div>
  );
}
