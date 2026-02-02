import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { fetchMyApprenticeCases } from "../api/apprenticeshipApi";

const normalizeCase = (c) => {
  const caseId = c.case_id ?? c.id ?? c.caseId;
  return {
    caseId,
    title: c.title ?? c.subject ?? c.case_title ?? `Case #${caseId}`,
    category: c.category ?? c.case_category ?? "—",
    district: c.district ?? c.case_district ?? "—",
    supervisingLawyer: c.supervising_lawyer ?? c.lawyer_name ?? c.lawyer ?? "—",
    status: (c.status ?? "active").toLowerCase(),
    assignedDate: c.assigned_date ?? c.assignedAt ?? c.created_at ?? "—",
  };
};

export default function ApprenticeAssignedCases() {
  const navigate = useNavigate();
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("all");
  const [statusFilter, setStatusFilter] = useState("any");
  const [categoryFilter, setCategoryFilter] = useState("any");
  const [lawyerFilter, setLawyerFilter] = useState("any");
  const [sortBy, setSortBy] = useState("recent");

  useEffect(() => {
    (async () => {
      try {
        setErr("");
        const data = await fetchMyApprenticeCases();
        const normalized = (Array.isArray(data) ? data : []).map(normalizeCase);
        setCases(normalized);
      } catch (e) {
        setErr(
          e?.response?.data?.detail ||
            "Failed to load assigned cases. Are you logged in as apprentice?"
        );
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filteredCases = useMemo(() => {
    let filtered = [...cases];

    // tabs: treat anything not closed/completed as active
    if (activeTab === "active") {
      filtered = filtered.filter(
        (c) => c.status !== "closed" && c.status !== "completed"
      );
    } else if (activeTab === "completed") {
      filtered = filtered.filter(
        (c) => c.status === "closed" || c.status === "completed"
      );
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (c) =>
          String(c.caseId).toLowerCase().includes(q) ||
          String(c.title).toLowerCase().includes(q) ||
          String(c.supervisingLawyer).toLowerCase().includes(q) ||
          String(c.category).toLowerCase().includes(q) ||
          String(c.district).toLowerCase().includes(q)
      );
    }

    if (statusFilter !== "any") {
      filtered = filtered.filter((c) => {
        const s = (c.status || "").toLowerCase();
        const isActive =
          s === "active" || (!s.includes("closed") && !s.includes("completed"));
        return statusFilter === "active" ? isActive : !isActive;
      });
    }

    if (categoryFilter !== "any") {
      filtered = filtered.filter((c) => c.category === categoryFilter);
    }

    if (lawyerFilter !== "any") {
      filtered = filtered.filter((c) => c.supervisingLawyer === lawyerFilter);
    }

    const parseDate = (v) => {
      if (!v || v === "—") return null;
      const d = new Date(v);
      return Number.isNaN(d.getTime()) ? null : d;
    };

    filtered.sort((a, b) => {
      if (sortBy === "title") {
        return String(a.title).localeCompare(String(b.title));
      }
      if (sortBy === "status") {
        return String(a.status).localeCompare(String(b.status));
      }
      const da = parseDate(a.assignedDate);
      const db = parseDate(b.assignedDate);
      if (!da && !db) return 0;
      if (!da) return 1;
      if (!db) return -1;
      return db.getTime() - da.getTime();
    });

    return filtered;
  }, [
    cases,
    activeTab,
    searchQuery,
    statusFilter,
    categoryFilter,
    lawyerFilter,
    sortBy,
  ]);

  const tabCounts = useMemo(() => {
    const all = cases.length;
    const active = cases.filter(
      (c) => c.status !== "closed" && c.status !== "completed"
    ).length;
    const completed = cases.filter(
      (c) => c.status === "closed" || c.status === "completed"
    ).length;
    return { all, active, completed };
  }, [cases]);

  const filterOptions = useMemo(() => {
    const categories = Array.from(new Set(cases.map((c) => c.category).filter(Boolean)));
    const lawyers = Array.from(
      new Set(cases.map((c) => c.supervisingLawyer).filter(Boolean))
    );
    return { categories, lawyers };
  }, [cases]);

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-4xl font-bold text-white mb-2 tracking-tight">
          My Assigned Cases
        </h1>
        <p className="text-slate-300">
          Manage and track all cases assigned to you by supervising lawyers.
        </p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-slate-900/50 border border-slate-700/60 rounded-2xl p-5 shadow-[0_0_0_1px_rgba(15,23,42,0.35)]">
          <div className="text-xs text-slate-400 mb-1">Total Cases</div>
          <div className="text-3xl font-semibold text-white">{tabCounts.all}</div>
        </div>
        <div className="bg-slate-900/50 border border-slate-700/60 rounded-2xl p-5 shadow-[0_0_0_1px_rgba(15,23,42,0.35)]">
          <div className="text-xs text-slate-400 mb-1">Active</div>
          <div className="text-3xl font-semibold text-white">{tabCounts.active}</div>
        </div>
        <div className="bg-slate-900/50 border border-slate-700/60 rounded-2xl p-5 shadow-[0_0_0_1px_rgba(15,23,42,0.35)]">
          <div className="text-xs text-slate-400 mb-1">Completed</div>
          <div className="text-3xl font-semibold text-white">{tabCounts.completed}</div>
        </div>
      </div>

      {/* Search */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:gap-4">
        <input
          type="text"
          placeholder="Search by title, case ID, lawyer, category, district..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="flex-1 px-4 py-2.5 rounded-xl bg-slate-900/40 border border-slate-700/60 text-white placeholder:text-slate-500 focus:outline-none focus:border-amber-400/70 focus:ring-1 focus:ring-amber-400/30"
        />
        <div className="flex items-center gap-3">
          <div className="text-xs text-slate-400">Sort</div>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="px-3 py-2 rounded-lg bg-slate-900/40 border border-slate-700/60 text-slate-200 text-sm focus:outline-none focus:border-amber-400/70"
          >
            <option value="recent">Most recent</option>
            <option value="title">Title A–Z</option>
            <option value="status">Status</option>
          </select>
        </div>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 rounded-lg bg-slate-900/40 border border-slate-700/60 text-slate-200 text-sm focus:outline-none focus:border-amber-400/70"
        >
          <option value="any">All statuses</option>
          <option value="active">Active only</option>
          <option value="closed">Closed only</option>
        </select>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="px-3 py-2 rounded-lg bg-slate-900/40 border border-slate-700/60 text-slate-200 text-sm focus:outline-none focus:border-amber-400/70"
        >
          <option value="any">All categories</option>
          {filterOptions.categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          value={lawyerFilter}
          onChange={(e) => setLawyerFilter(e.target.value)}
          className="px-3 py-2 rounded-lg bg-slate-900/40 border border-slate-700/60 text-slate-200 text-sm focus:outline-none focus:border-amber-400/70"
        >
          <option value="any">All supervising lawyers</option>
          {filterOptions.lawyers.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-4 border-b border-slate-700/60">
        <button
          onClick={() => setActiveTab("all")}
          className={`px-4 py-2 font-medium transition ${
            activeTab === "all"
              ? "text-amber-300 border-b-2 border-amber-300"
              : "text-slate-400 hover:text-white"
          }`}
        >
          All Cases ({tabCounts.all})
        </button>
        <button
          onClick={() => setActiveTab("active")}
          className={`px-4 py-2 font-medium transition ${
            activeTab === "active"
              ? "text-amber-300 border-b-2 border-amber-300"
              : "text-slate-400 hover:text-white"
          }`}
        >
          Active ({tabCounts.active})
        </button>
        <button
          onClick={() => setActiveTab("completed")}
          className={`px-4 py-2 font-medium transition ${
            activeTab === "completed"
              ? "text-amber-300 border-b-2 border-amber-300"
              : "text-slate-400 hover:text-white"
          }`}
        >
          Completed ({tabCounts.completed})
        </button>
      </div>

      {/* List */}
      <div className="space-y-4">
        {loading && (
          <div className="rounded-xl border border-slate-800/60 bg-slate-950/40 py-10 text-center text-slate-300">
            Loading assigned cases...
          </div>
        )}

        {!loading && err && (
          <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {err}
          </div>
        )}

        {!loading && !err && filteredCases.length === 0 && (
          <div className="rounded-xl border border-slate-800/60 bg-slate-950/40 py-10 text-center text-slate-300">
            {searchQuery ? "No cases match your search." : "No cases assigned yet."}
          </div>
        )}

        {!loading && !err && filteredCases.length > 0 &&
          filteredCases.map((c) => (
            <div
              key={c.caseId}
              className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between p-5 bg-slate-900/50 border border-slate-700/60 rounded-2xl shadow-[0_0_0_1px_rgba(15,23,42,0.35)] hover:bg-slate-900/60 transition"
            >
              <div className="flex items-center gap-4 flex-1 min-w-0">
                <div className="text-amber-300 text-3xl">💼</div>

                <div className="flex-1">
                  <div className="font-semibold text-white text-lg mb-2 truncate">
                    {c.title}
                  </div>

                  <div className="text-sm text-slate-400 space-y-1">
                    <div>Case ID: {c.caseId}</div>

                    <div className="flex items-center gap-4 flex-wrap">
                      <span>Category: {c.category}</span>
                      <span>District: {c.district}</span>
                      <span>Supervising Lawyer: {c.supervisingLawyer}</span>

                      <span
                        className={`px-2 py-1 rounded-full text-xs font-medium ${
                          c.status === "closed" || c.status === "completed"
                            ? "bg-slate-700/40 text-slate-300 border border-slate-600/60"
                            : "bg-amber-500/15 text-amber-200 border border-amber-500/30"
                        }`}
                      >
                        {c.status === "closed" || c.status === "completed"
                          ? "Closed"
                          : "Active"}
                      </span>

                      <span>Assigned Date: {c.assignedDate}</span>
                    </div>
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
          ))}
      </div>
    </div>
  );
}
