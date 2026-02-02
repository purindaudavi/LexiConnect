import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  fetchMyApprenticeCases,
  fetchApprenticeCaseNotes,
  fetchCaseDocuments,
  fetchDocumentReviewLinks,
} from "../api/apprenticeshipApi";
import PersistentToast from "../../../components/ui/PersistentToast";

// ✅ Recharts
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  AreaChart,
  Area,
  CartesianGrid,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
} from "recharts";

const normalizeCase = (c) => {
  const caseId = c.case_id ?? c.caseId ?? c.case?.id ?? c.id;
  return {
    caseId,
    title: c.title ?? c.subject ?? c.case_title ?? `Case #${caseId}`,
    category: c.category ?? c.case_category ?? "—",
    supervisingLawyer: c.supervising_lawyer ?? c.lawyer_name ?? c.lawyer ?? "—",
    status: (c.status ?? "active").toLowerCase(),
    districtCity:
      c.district && c.city
        ? `${c.district} / ${c.city}`
        : c.district ?? c.city ?? "—",
    createdDate: c.created_at ?? c.createdAt ?? c.assigned_date ?? "—",
    assignedDate: c.assigned_date ?? c.assignedAt ?? c.created_at ?? "—",
  };
};

// -------------------- localStorage keys --------------------
const KNOWN_CASE_IDS_KEY = "apprentice_known_case_ids";
const DISMISSED_NEW_CASES_KEY = "apprentice_dismissed_new_case_ids";
const LAST_SEEN_CHAT_TS_KEY = "apprentice_last_seen_chat_ts";
const LAST_NOTIFIED_CHAT_TS_KEY = "apprentice_last_notified_chat_ts";
const UNREAD_CASE_IDS_KEY = "apprentice_unread_case_ids";
const DISMISSED_NEW_MSG_CASES_KEY = "apprentice_dismissed_new_msg_case_ids";

// -------------------- helpers --------------------
const safeJsonParse = (v, fallback) => {
  try {
    return JSON.parse(v);
  } catch {
    return fallback;
  }
};

const getLatestTsFromNotes = (notes) => {
  let latest = null;
  for (const n of notes || []) {
    const ts = n?.created_at ?? n?.createdAt ?? null;
    if (ts && (!latest || String(ts) > String(latest))) latest = ts;
  }
  return latest;
};

const formatLastActivity = (latestTs) => {
  try {
    const date = new Date(latestTs);
    const now = new Date();
    const diffHours = Math.floor((now - date) / (1000 * 60 * 60));
    if (diffHours < 1) return "Just now";
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${Math.floor(diffHours / 24)}d ago`;
  } catch {
    return "—";
  }
};

const startOfDayKey = (d) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.toISOString().slice(0, 10); // YYYY-MM-DD
};

const safeDateKey = (value) => {
  if (!value || value === "—") return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return startOfDayKey(d);
};

const lastNDaysKeys = (n) => {
  const out = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
};

const prettyDay = (yyyyMmDd) => {
  // simple label: Mon, Tue...
  try {
    const d = new Date(yyyyMmDd + "T00:00:00");
    return d.toLocaleDateString(undefined, { weekday: "short" });
  } catch {
    return yyyyMmDd;
  }
};

export default function ApprenticeDashboard() {
  const navigate = useNavigate();

  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);

  // stats
  const [notesCount, setNotesCount] = useState(0);
  const [lastActivity, setLastActivity] = useState("—");

  // ✅ extra dashboard insights
  const [notesTrend7d, setNotesTrend7d] = useState([]); // line chart data
  const [reviewedCount, setReviewedCount] = useState(0); // progress card
  const [reviewProgressLoading, setReviewProgressLoading] = useState(false);

  // unread state for UI badges
  const [unreadIds, setUnreadIds] = useState(() =>
    safeJsonParse(localStorage.getItem(UNREAD_CASE_IDS_KEY) || "[]", [])
  );

  // ---------- NEW ASSIGNMENT TOAST ----------
  const [assignToastOpen, setAssignToastOpen] = useState(false);
  const [assignToastMsg, setAssignToastMsg] = useState("");

  // ---------- NEW MESSAGE TOAST ----------
  const [msgToastOpen, setMsgToastOpen] = useState(false);
  const [msgToastMsg, setMsgToastMsg] = useState("");
  const [msgToastCaseId, setMsgToastCaseId] = useState(null);

  // polling ref
  const pollRef = useRef(null);

  // -------------------- localStorage wrappers --------------------
  const getLastSeenMap = () =>
    safeJsonParse(localStorage.getItem(LAST_SEEN_CHAT_TS_KEY) || "{}", {});
  const setLastSeenMap = (m) =>
    localStorage.setItem(LAST_SEEN_CHAT_TS_KEY, JSON.stringify(m || {}));

  const getLastNotifiedMap = () =>
    safeJsonParse(localStorage.getItem(LAST_NOTIFIED_CHAT_TS_KEY) || "{}", {});
  const setLastNotifiedMap = (m) =>
    localStorage.setItem(LAST_NOTIFIED_CHAT_TS_KEY, JSON.stringify(m || {}));

  const getUnreadIds = () =>
    safeJsonParse(localStorage.getItem(UNREAD_CASE_IDS_KEY) || "[]", []);
  const setUnreadIdsLS = (arr) =>
    localStorage.setItem(UNREAD_CASE_IDS_KEY, JSON.stringify(arr || []));

  const getDismissedMsgCases = () =>
    safeJsonParse(localStorage.getItem(DISMISSED_NEW_MSG_CASES_KEY) || "[]", []);
  const setDismissedMsgCases = (arr) =>
    localStorage.setItem(DISMISSED_NEW_MSG_CASES_KEY, JSON.stringify(arr || []));

  // -------------------- unread mutations --------------------
  const addUnread = (caseId) => {
    const cid = String(caseId);
    const cur = getUnreadIds();
    if (!cur.includes(cid)) {
      const next = [...cur, cid];
      setUnreadIdsLS(next);
      setUnreadIds(next);
    }
  };

  // -------------------- toast --------------------
  const showNewMessageToast = (c, latestTs) => {
    const cid = String(c.caseId);
    setMsgToastMsg(`New message in: ${c.title} (Case #${cid})`);
    setMsgToastCaseId(c.caseId);
    setMsgToastOpen(true);

    const lastNotified = getLastNotifiedMap();
    lastNotified[cid] = latestTs;
    setLastNotifiedMap(lastNotified);
  };

  // -------------------- polling logic --------------------
  const checkForNewMessages = async (currentCases, options = {}) => {
    const { limit = 6 } = options;
    if (!Array.isArray(currentCases) || currentCases.length === 0) return;

    const toCheck = currentCases.slice(0, limit);
    const lastSeen = getLastSeenMap();
    const lastNotified = getLastNotifiedMap();
    const dismissedMsgCases = getDismissedMsgCases();

    for (const c of toCheck) {
      const cid = String(c.caseId);
      if (!cid) continue;

      try {
        const notes = await fetchApprenticeCaseNotes(c.caseId);
        if (!Array.isArray(notes) || notes.length === 0) continue;

        const latestTs = getLatestTsFromNotes(notes);
        if (!latestTs) continue;

        if (!lastSeen[cid]) {
          lastSeen[cid] = latestTs;
          lastNotified[cid] = latestTs;
          continue;
        }

        if (String(latestTs) > String(lastSeen[cid])) {
          addUnread(cid);

          if (
            !dismissedMsgCases.includes(cid) &&
            String(latestTs) > String(lastNotified[cid] || "")
          ) {
            showNewMessageToast(c, latestTs);
            break;
          }
        }
      } catch {
        // ignore
      }
    }

    setLastSeenMap(lastSeen);
    setLastNotifiedMap(lastNotified);
  };

  // -------------------- NEW: compute notes trend (last 7 days) --------------------
  const computeNotesTrend7d = async (normalizedCases) => {
    const days = lastNDaysKeys(7);
    const counts = Object.fromEntries(days.map((d) => [d, 0]));

    // lightweight: only check first 6 cases to stay safe (like your polling)
    const toCheck = normalizedCases.slice(0, 6);

    for (const c of toCheck) {
      try {
        const notes = await fetchApprenticeCaseNotes(c.caseId);
        for (const n of notes || []) {
          const ts = n?.created_at ?? n?.createdAt ?? null;
          if (!ts) continue;
          const key = startOfDayKey(ts);
          if (counts[key] != null) counts[key] += 1;
        }
      } catch {
        // ignore
      }
    }

    return days.map((d) => ({
      day: prettyDay(d),
      notes: counts[d],
    }));
  };

  // -------------------- NEW: compute “cases reviewed” progress --------------------
  // Definition used:
  // A case is "reviewed" if ANY document has at least 1 review-link record
  // (fetchDocumentReviewLinks(docId) returns list)
  const computeReviewedCases = async (normalizedCases) => {
    let reviewed = 0;

    // keep it safe/lightweight: check at most first 10 cases
    const toCheck = normalizedCases.slice(0, 10);

    for (const c of toCheck) {
      try {
        const docs = await fetchCaseDocuments(c.caseId);
        const arr = Array.isArray(docs) ? docs : [];
        if (arr.length === 0) continue;

        let caseReviewed = false;

        // check at most 8 docs per case
        for (const doc of arr.slice(0, 8)) {
          const docId = doc?.id ?? doc?.document_id ?? doc?.doc_id;
          if (!docId) continue;

          try {
            const links = await fetchDocumentReviewLinks(docId);
            if (Array.isArray(links) && links.length > 0) {
              caseReviewed = true;
              break;
            }
          } catch {
            // ignore
          }
        }

        if (caseReviewed) reviewed += 1;
      } catch {
        // ignore
      }
    }

    return reviewed;
  };

  // -------------------- Initial load --------------------
  useEffect(() => {
    (async () => {
      try {
        const data = await fetchMyApprenticeCases();
        const normalized = (Array.isArray(data) ? data : []).map(normalizeCase);
        setCases(normalized);

        // ---------- NEW ASSIGNMENT TOAST ----------
        const currentIds = normalized
          .map((c) => c.caseId)
          .filter((id) => id != null)
          .map(String);

        const knownIds = safeJsonParse(
          localStorage.getItem(KNOWN_CASE_IDS_KEY) || "[]",
          []
        );
        const dismissedIds = safeJsonParse(
          localStorage.getItem(DISMISSED_NEW_CASES_KEY) || "[]",
          []
        );

        const newIds = currentIds.filter(
          (id) => !knownIds.includes(id) && !dismissedIds.includes(id)
        );

        if (newIds.length > 0) {
          const newestId = newIds[0];
          const newest = normalized.find(
            (c) => String(c.caseId) === String(newestId)
          );
          const title = newest?.title || `Case #${newestId}`;
          setAssignToastMsg(`New case assigned: ${title} (Case #${newestId})`);
          setAssignToastOpen(true);
        }

        localStorage.setItem(KNOWN_CASE_IDS_KEY, JSON.stringify(currentIds));

        // ---- stats (lightweight: first 3 cases)
        let totalNotes = 0;
        let latestTs = null;

        for (const c of normalized.slice(0, 3)) {
          try {
            const notes = await fetchApprenticeCaseNotes(c.caseId);
            if (Array.isArray(notes) && notes.length > 0) {
              totalNotes += notes.length;
              const ts = getLatestTsFromNotes(notes);
              if (ts && (!latestTs || ts > latestTs)) latestTs = ts;
            }
          } catch {
            // ignore
          }
        }

        setNotesCount(totalNotes);
        if (latestTs) setLastActivity(formatLastActivity(latestTs));

        // ✅ first unread check
        await checkForNewMessages(normalized, { limit: 6 });

        // ✅ charts: notes activity last 7 days
        const trend = await computeNotesTrend7d(normalized);
        setNotesTrend7d(trend);

        // ✅ progress: reviewed cases
        setReviewProgressLoading(true);
        const reviewed = await computeReviewedCases(normalized);
        setReviewedCount(reviewed);
        setReviewProgressLoading(false);
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // -------------------- polling every 5 seconds --------------------
  useEffect(() => {
    if (!cases || cases.length === 0) return;

    if (pollRef.current) clearInterval(pollRef.current);

    pollRef.current = setInterval(() => {
      if (!msgToastOpen) checkForNewMessages(cases, { limit: 6 });
    }, 5000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cases, msgToastOpen]);

  const stats = useMemo(() => {
    const total = cases.length;
    const active = cases.filter((c) => {
      const s = (c.status || "").toLowerCase();
      return !s.includes("closed") && !s.includes("completed");
    }).length;
    return { total, active, notes: notesCount, lastActivity };
  }, [cases, notesCount, lastActivity]);

  // ✅ Bar chart data
  const chartData = useMemo(() => {
    const map = { Active: 0, Closed: 0 };
    cases.forEach((c) => {
      const s = (c.status || "").toLowerCase();
      if (s.includes("closed") || s.includes("completed")) map.Closed++;
      else map.Active++;
    });
    return [
      { name: "Active", cases: map.Active },
      { name: "Closed", cases: map.Closed },
    ];
  }, [cases]);

  const assignmentsTrend14d = useMemo(() => {
    const days = lastNDaysKeys(14);
    const counts = Object.fromEntries(days.map((d) => [d, 0]));
    for (const c of cases) {
      const key =
        safeDateKey(c.assignedDate) ||
        safeDateKey(c.createdDate) ||
        safeDateKey(c.created_at);
      if (key && counts[key] != null) counts[key] += 1;
    }
    return days.map((d) => ({
      day: prettyDay(d),
      assignments: counts[d],
    }));
  }, [cases]);

  const focusCards = useMemo(() => {
    const active = cases.filter((c) => {
      const s = (c.status || "").toLowerCase();
      return !s.includes("closed") && !s.includes("completed");
    });
    const latest = active.slice(0, 2);
    return latest.length ? latest : cases.slice(0, 2);
  }, [cases]);

  // ✅ Pie chart: category split (top 5 + Other)
  const categoryPieData = useMemo(() => {
    const counts = {};
    for (const c of cases) {
      const cat = (c.category || "—").trim() || "—";
      counts[cat] = (counts[cat] || 0) + 1;
    }

    const sorted = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([name, value]) => ({ name, value }));

    const top = sorted.slice(0, 5);
    const rest = sorted.slice(5).reduce((sum, x) => sum + x.value, 0);

    if (rest > 0) top.push({ name: "Other", value: rest });
    return top.length ? top : [{ name: "—", value: 0 }];
  }, [cases]);

  const preview = cases.slice(0, 3);

  // -------------------- toast close handlers --------------------
  const handleCloseAssignToast = () => {
    const dismissedIds = safeJsonParse(
      localStorage.getItem(DISMISSED_NEW_CASES_KEY) || "[]",
      []
    );

    const match = assignToastMsg.match(/Case #(\d+)/);
    const id = match?.[1];
    if (id && !dismissedIds.includes(String(id))) {
      dismissedIds.push(String(id));
      localStorage.setItem(DISMISSED_NEW_CASES_KEY, JSON.stringify(dismissedIds));
    }
    setAssignToastOpen(false);
  };

  const handleCloseMsgToast = () => {
    if (msgToastCaseId != null) {
      const cid = String(msgToastCaseId);
      const dismissed = getDismissedMsgCases();
      if (!dismissed.includes(cid)) {
        dismissed.push(cid);
        setDismissedMsgCases(dismissed);
      }
    }
    setMsgToastOpen(false);
  };

  const handleOpenMsgToast = () => {
    if (msgToastCaseId != null) navigate(`/apprentice/cases/${msgToastCaseId}`);
    setMsgToastOpen(false);
  };

  const isUnread = (caseId) => unreadIds.includes(String(caseId));

  // progress %
  const reviewedPercent = useMemo(() => {
    if (!stats.total) return 0;
    const p = Math.round((reviewedCount / stats.total) * 100);
    return Math.max(0, Math.min(100, p));
  }, [reviewedCount, stats.total]);

  // IMPORTANT: stable pie colors (no dependency)
  const PIE_COLORS = ["#f59e0b", "#60a5fa", "#34d399", "#a78bfa", "#f87171", "#94a3b8"];

  const CARD_BASE =
    "bg-slate-900/50 border border-slate-700/60 rounded-2xl p-6 shadow-[0_0_0_1px_rgba(15,23,42,0.35)]";
  const CARD_INSET =
    "bg-slate-950/40 border border-slate-800/60 rounded-xl p-4";

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Persistent Notification: New Assignment */}
      <PersistentToast
        open={assignToastOpen}
        title="New Assignment"
        message={assignToastMsg}
        onClose={handleCloseAssignToast}
      />

      {/* Persistent Notification: New Message */}
      <PersistentToast
        open={msgToastOpen}
        title="New Message"
        message={msgToastMsg}
        onClose={handleCloseMsgToast}
        onClick={handleOpenMsgToast}
        actionLabel="Open chat"
        onAction={handleOpenMsgToast}
      />

      {/* Hero Section */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-4xl font-bold text-white mb-2 tracking-tight">
            Apprentice Dashboard
          </h1>
          <p className="text-slate-300 mb-1">
            Cases assigned by supervising lawyers
          </p>
          <p className="text-slate-400 text-sm">
            You are assisting lawyers internally. Clients cannot see your notes.
          </p>
        </div>
        <button className="px-4 py-2 rounded-lg bg-amber-500/10 border border-amber-400/40 text-amber-200 text-sm font-medium shadow-[0_0_0_1px_rgba(245,158,11,0.12)]">
          Apprentice Access
        </button>
      </div>

      {/* Stats Row + Progress Card */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
        <StatCard icon="⚖️" value={stats.total} label="Total Assigned Cases" />
        <StatCard icon="📊" value={stats.active} label="Active Cases" />
        <StatCard icon="📝" value={stats.notes} label="Notes Added" />
        <StatCard icon="🕐" value={stats.lastActivity} label="Last Activity" />

        <div className={`${CARD_BASE} flex flex-col lg:col-span-2`}>
          <div className="text-amber-300 text-2xl mb-2">✅</div>
          <div className="text-white font-semibold mb-2">Cases Reviewed</div>

          <div className="flex items-end justify-between gap-3 mb-2">
            <div className="text-3xl font-bold text-white">
              {reviewProgressLoading ? "…" : reviewedCount}
              <span className="text-slate-400 text-base font-medium">
                {" "}
                / {stats.total}
              </span>
            </div>
            <div className="text-slate-300 text-sm">{reviewedPercent}%</div>
          </div>

          <div className="w-full h-2 rounded-full bg-slate-800/80 overflow-hidden">
            <div
              className="h-full bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.35)]"
              style={{ width: `${reviewedPercent}%` }}
            />
          </div>

          <div className="text-slate-500 text-xs mt-2">
            Based on submitted document review links.
          </div>
        </div>
      </div>

      {/* Insight Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className={CARD_BASE}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-white">Assignment Pulse</h2>
            <span className="text-slate-400 text-sm">Last 14 days</span>
          </div>
          <div className={`${CARD_INSET} h-52`}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={assignmentsTrend14d}>
                <defs>
                  <linearGradient id="assignmentsGlow" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.35} />
                    <stop offset="90%" stopColor="#f59e0b" stopOpacity={0.03} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#1f2937" strokeDasharray="3 3" />
                <XAxis dataKey="day" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#020617",
                    border: "1px solid #334155",
                    color: "#e5e7eb",
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="assignments"
                  stroke="#f59e0b"
                  strokeWidth={2}
                  fill="url(#assignmentsGlow)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="text-slate-500 text-xs mt-2">
            Based on assignment/created timestamps.
          </div>
        </div>

        <div className={CARD_BASE}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-white">Focus Lane</h2>
            <span className="text-slate-400 text-sm">Priority queue</span>
          </div>
          <div className="space-y-3">
            {focusCards.length === 0 ? (
              <div className="rounded-xl border border-slate-800/60 bg-slate-950/40 py-8 text-center text-slate-300">
                No active cases yet.
              </div>
            ) : (
              focusCards.map((c) => (
                <div
                  key={c.caseId}
                  className="flex items-center justify-between gap-3 rounded-xl border border-slate-800/60 bg-slate-950/40 px-4 py-3"
                >
                  <div className="min-w-0">
                    <div className="text-white font-semibold truncate">{c.title}</div>
                    <div className="text-xs text-slate-400 mt-1">
                      {c.category} • {c.supervisingLawyer}
                    </div>
                  </div>
                  <button
                    onClick={() => navigate(`/apprentice/cases/${c.caseId}`)}
                    className="px-3 py-1.5 rounded-lg bg-amber-500/15 text-amber-200 border border-amber-500/30 text-xs font-semibold hover:bg-amber-500/25"
                  >
                    Open
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        <div className={CARD_BASE}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-white">Quick Signals</h2>
            <span className="text-slate-400 text-sm">Snapshot</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-slate-800/60 bg-slate-950/40 p-4">
              <div className="text-xs text-slate-400 mb-1">Active Ratio</div>
              <div className="text-2xl font-semibold text-white">
                {stats.total ? Math.round((stats.active / stats.total) * 100) : 0}%
              </div>
              <div className="text-xs text-slate-500 mt-1">of assigned cases</div>
            </div>
            <div className="rounded-xl border border-slate-800/60 bg-slate-950/40 p-4">
              <div className="text-xs text-slate-400 mb-1">Avg Notes</div>
              <div className="text-2xl font-semibold text-white">
                {stats.total ? Math.round((notesCount / stats.total) * 10) / 10 : 0}
              </div>
              <div className="text-xs text-slate-500 mt-1">per case</div>
            </div>
            <div className="col-span-2 rounded-xl border border-slate-800/60 bg-slate-950/40 p-4">
              <div className="text-xs text-slate-400 mb-2">Unread Pings</div>
              <div className="flex items-center justify-between">
                <div className="text-2xl font-semibold text-white">
                  {unreadIds.length}
                </div>
                <span className="text-xs text-amber-200 bg-amber-500/15 border border-amber-500/30 rounded-full px-2 py-1">
                  Needs attention
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Bar Chart */}
        <div className={CARD_BASE}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-white">
              Case Status Overview
            </h2>
            <span className="text-slate-400 text-sm">Active vs Closed</span>
          </div>

          <div className={`${CARD_INSET} h-64`}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <XAxis dataKey="name" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#020617",
                    border: "1px solid #334155",
                    color: "#e5e7eb",
                  }}
                />
                <Bar dataKey="cases" fill="#f59e0b" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Line Chart */}
        <div className={CARD_BASE}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-white">
              Notes Activity
            </h2>
            <span className="text-slate-400 text-sm">Last 7 days</span>
          </div>

          <div className={`${CARD_INSET} h-64`}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={notesTrend7d}>
                <XAxis dataKey="day" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#020617",
                    border: "1px solid #334155",
                    color: "#e5e7eb",
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="notes"
                  stroke="#f59e0b"
                  strokeWidth={3}
                  dot={{ r: 3 }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="text-slate-500 text-xs mt-2">
            Based on notes from your first few assigned cases (lightweight).
          </div>
        </div>
      </div>

      {/* Pie Chart */}
      <div className={CARD_BASE}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-white">Case Categories</h2>
          <span className="text-slate-400 text-sm">Top 5</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
          <div className={`${CARD_INSET} h-64`}>
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
                  data={categoryPieData}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={55}
                  outerRadius={90}
                  paddingAngle={3}
                >
                  {categoryPieData.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className={`${CARD_INSET} space-y-2`}>
            {categoryPieData.map((x, i) => (
              <div
                key={x.name}
                className="flex items-center justify-between gap-3 text-sm"
              >
                <div className="flex items-center gap-2 text-slate-200">
                  <span
                    className="inline-block w-3 h-3 rounded-sm"
                    style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }}
                  />
                  <span className="truncate max-w-[260px]">{x.name}</span>
                </div>
                <div className="text-slate-400">{x.value}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Assigned Cases Preview */}
      <div className={CARD_BASE}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-white">Assigned Cases</h2>
          <Link
            to="/apprentice/cases"
            className="text-amber-300 text-sm hover:underline"
          >
            View all →
          </Link>
        </div>

        {loading ? (
          <div className="rounded-xl border border-slate-800/60 bg-slate-950/40 py-8 text-center text-slate-300">
            Loading assigned cases...
          </div>
        ) : preview.length === 0 ? (
          <div className="rounded-xl border border-slate-800/60 bg-slate-950/40 py-8 text-center text-slate-300">
            No cases assigned yet.
          </div>
        ) : (
          <div className="space-y-4">
            {preview.map((c) => {
              const isActive =
                c.status === "active" ||
                (!c.status.includes("closed") && !c.status.includes("completed"));

              const unread = isUnread(c.caseId);

              return (
                <div
                  key={c.caseId}
                  className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between p-4 bg-slate-950/40 border border-slate-700/60 rounded-xl hover:bg-slate-900/50 transition"
                >
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    <div className="text-amber-300 text-2xl">⚖️</div>

                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <div className="font-semibold text-white mb-1 truncate">
                          {c.title}
                        </div>

                        {unread ? (
                          <span className="ml-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-500/20 text-amber-200 border border-amber-500/30">
                            <span className="inline-block w-2 h-2 rounded-full bg-amber-300" />
                            New
                          </span>
                        ) : null}
                      </div>

                      <div className="text-sm text-slate-400 space-y-1">
                        <div>Case ID: {c.caseId}</div>
                        <div className="flex items-center gap-4 flex-wrap">
                          <span>Category: {c.category}</span>
                          <span>Supervising Lawyer: {c.supervisingLawyer}</span>
                          <span
                            className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                              isActive
                                ? "bg-amber-500/15 text-amber-200 border border-amber-500/30"
                                : "bg-slate-700/40 text-slate-300 border border-slate-600/60"
                            }`}
                          >
                            {isActive ? "Active" : "Closed"}
                          </span>
                        </div>
                        <div>Assigned Date: {c.assignedDate}</div>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => navigate(`/apprentice/cases/${c.caseId}`)}
                    className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-white font-medium text-sm shadow-[0_8px_20px_rgba(245,158,11,0.2)]"
                  >
                    View Case
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* NOTE:
          markCaseRead() is intentionally kept for ApprenticeCaseView usage later.
      */}
    </div>
  );
}

function StatCard({ icon, value, label }) {
  return (
    <div className="bg-slate-900/50 border border-slate-700/60 rounded-2xl p-5 shadow-[0_0_0_1px_rgba(15,23,42,0.35)]">
      <div className="text-2xl mb-2">{icon}</div>
      <div className="text-3xl font-bold text-white mb-1">{value}</div>
      <div className="text-slate-400 text-sm">{label}</div>
    </div>
  );
}
