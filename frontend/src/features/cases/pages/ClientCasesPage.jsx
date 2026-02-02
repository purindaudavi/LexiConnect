import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { createCase, getMyCases, getSpecializations } from "../services/cases.service";

export default function ClientCasesPage() {
  const navigate = useNavigate();
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [districtFilter, setDistrictFilter] = useState("All");
  const [sortOrder, setSortOrder] = useState("Newest");

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    title: "",
    specialization_id: "",
    district: "",
    summary_public: "",
    summary_private: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [specializations, setSpecializations] = useState([]);
  const [specializationsLoading, setSpecializationsLoading] = useState(true);
  const [specializationsError, setSpecializationsError] = useState("");

  const loadCases = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await getMyCases();
      setCases(data || []);
    } catch (err) {
      const message =
        err?.response?.data?.detail ||
        err?.response?.data?.message ||
        "Failed to load cases.";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCases();
  }, []);

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
    loadSpecializations();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setFormError("");
    if (!form.specialization_id) {
      setFormError("Please select a specialization.");
      setSubmitting(false);
      return;
    }
    try {
      await createCase({
        ...form,
        specialization_id: Number(form.specialization_id),
      });
      setShowForm(false);
      setForm({
        title: "",
        specialization_id: "",
        district: "",
        summary_public: "",
        summary_private: "",
      });
      await loadCases();
    } catch (err) {
      const message =
        err?.response?.data?.detail ||
        err?.response?.data?.message ||
        "Failed to create case.";
      setFormError(message);
    } finally {
      setSubmitting(false);
    }
  };

  const formattedDate = (value) => {
    if (!value) return "-";
    try {
      return new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
      }).format(new Date(value));
    } catch {
      return value;
    }
  };

  const uniqueDistricts = useMemo(
    () => ["All", ...Array.from(new Set(cases.map((c) => c.district).filter(Boolean)))],
    [cases]
  );

  const stats = useMemo(() => {
    const total = cases.length;
    const open = cases.filter((c) => (c.status || "open").toLowerCase() !== "closed").length || 0;
    const latest = [...cases]
      .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())[0]?.title;
    const districts = new Set(cases.map((c) => (c.district || "").trim()).filter(Boolean)).size || 0;
    return [
      { label: "Total Cases", value: total || "-" },
      { label: "Open Cases", value: open || "-" },
      { label: "Latest Case", value: latest || "-" },
      { label: "Districts", value: districts || "-" },
    ];
  }, [cases]);

  const filteredCases = useMemo(() => {
    const q = search.trim().toLowerCase();
    const normalized = cases.filter((c) => {
      const matchesSearch =
        !q ||
        (c.title || "").toLowerCase().includes(q) ||
        (c.specialization?.name || c.specialization_name || c.category || "").toLowerCase().includes(q) ||
        (c.district || "").toLowerCase().includes(q) ||
        (c.summary_public || "").toLowerCase().includes(q) ||
        (c.summary_private || "").toLowerCase().includes(q);
      const matchesStatus =
        statusFilter === "All" || (c.status || "open").toLowerCase() === statusFilter.toLowerCase();
      const matchesDistrict =
        districtFilter === "All" || (c.district || "").toLowerCase() === districtFilter.toLowerCase();
      return matchesSearch && matchesStatus && matchesDistrict;
    });

    const sorted = [...normalized];
    if (sortOrder === "Newest") {
      sorted.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
    } else if (sortOrder === "Oldest") {
      sorted.sort((a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime());
    } else {
      sorted.sort((a, b) => (a.title || "").localeCompare(b.title || ""));
    }
    return sorted;
  }, [cases, search, statusFilter, districtFilter, sortOrder]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-white">
      <div className="max-w-6xl mx-auto px-4 py-10 space-y-8">
        <section className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
          <div className="space-y-2">
            <p className="text-sm uppercase tracking-[0.2em] text-amber-300">Cases</p>
            <h1 className="text-3xl font-bold text-white">My Cases</h1>
            <p className="text-slate-300">
              Track your legal issues, lawyer requests, and case progress.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => navigate("/client/search")}
              className="px-5 py-3 rounded-xl bg-slate-800 border border-slate-700 hover:bg-slate-700 text-white font-semibold transition-colors"
            >
              Browse Lawyers
            </button>
          </div>
        </section>

        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map((s) => (
            <div
              key={s.label}
              className="rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3 shadow-sm shadow-slate-900/30"
            >
              <div className="text-xs uppercase text-slate-400 tracking-wide">{s.label}</div>
              <div className="text-2xl font-semibold text-white mt-1 truncate">{s.value}</div>
            </div>
          ))}
        </section>

        <section className="border border-slate-800 rounded-2xl bg-slate-900/60 p-4 md:p-5 shadow-lg shadow-slate-900/30 space-y-4">
          <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-3">
            <div className="flex flex-1 gap-3 flex-wrap">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by title, specialization, or district"
                className="flex-1 min-w-[220px] px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-sm placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              >
                {["All", "Open", "Pending", "Confirmed", "Closed"].map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <select
                value={districtFilter}
                onChange={(e) => setDistrictFilter(e.target.value)}
                className="px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              >
                {uniqueDistricts.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
              <select
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value)}
                className="px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              >
                {["Newest", "Oldest", "A-Z"].map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowForm((v) => !v)}
                className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-slate-950 text-sm font-semibold"
              >
                {showForm ? "Close Form" : "Create Case"}
              </button>
            </div>
          </div>
        </section>

        {showForm && (
          <form
            onSubmit={handleSubmit}
            className="border border-slate-800 rounded-2xl bg-slate-900/70 p-4 md:p-6 space-y-4 shadow-lg shadow-slate-900/30"
          >
            <div className="grid md:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-400">Title</label>
                <input
                  required
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  className="mt-1 w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                  placeholder="Case title"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400">Specialization</label>
                <select
                  required
                  value={form.specialization_id}
                  onChange={(e) => setForm({ ...form, specialization_id: e.target.value })}
                  className="mt-1 w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                >
                  <option value="">
                    {specializationsLoading ? "Loading..." : "Select specialization"}
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
              <div>
                <label className="text-xs text-slate-400">District</label>
                <input
                  required
                  value={form.district}
                  onChange={(e) => setForm({ ...form, district: e.target.value })}
                  className="mt-1 w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                  placeholder="District"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400">Summary (public)</label>
                <textarea
                  required
                  value={form.summary_public}
                  onChange={(e) => setForm({ ...form, summary_public: e.target.value })}
                  className="mt-1 w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                  placeholder="Brief public summary"
                />
              </div>
              <div className="md:col-span-2">
                <label className="text-xs text-slate-400">Summary (private, optional)</label>
                <textarea
                  value={form.summary_private}
                  onChange={(e) => setForm({ ...form, summary_private: e.target.value })}
                  className="mt-1 w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                  placeholder="Private notes for your lawyer (optional)"
                />
              </div>
            </div>
            {formError && (
              <div className="text-sm text-red-300 border border-red-700 bg-red-900/30 rounded-lg p-2">
                <div className="font-semibold">Error creating case</div>
                <div>{formError}</div>
              </div>
            )}
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="px-4 py-2 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-sm"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting || !form.specialization_id}
                className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-sm font-semibold disabled:opacity-60"
              >
                {submitting ? "Saving..." : "Save Case"}
              </button>
            </div>
          </form>
        )}

        {loading && (
          <div className="space-y-3">
            {[1, 2, 3, 4].map((k) => (
              <div
                key={k}
                className="animate-pulse bg-slate-900/50 border border-slate-800 rounded-2xl h-24"
              />
            ))}
          </div>
        )}
        {error && !loading && (
          <div className="text-sm text-red-300 border border-red-700 bg-red-900/30 rounded-lg p-3">
            <div className="font-semibold mb-1">API error</div>
            <div>{error}</div>
          </div>
        )}

        {!loading && !error && filteredCases.length === 0 && (
          <div className="border border-slate-800 bg-slate-900/60 rounded-2xl p-6 text-center space-y-3 shadow-lg shadow-slate-900/30">
            <h3 className="text-lg font-semibold text-white">No cases yet</h3>
            <p className="text-slate-400 text-sm">Post your first legal issue to get started.</p>
            <button
              onClick={() => setShowForm(true)}
              className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold transition-colors"
            >
              Create a Case
            </button>
          </div>
        )}

        {!loading && !error && filteredCases.length > 0 && (
          <div className="grid md:grid-cols-2 gap-4">
            {filteredCases.map((c) => (
              <div
                key={c.id}
                className="border border-slate-800 rounded-2xl bg-slate-900/60 p-5 space-y-3 shadow-lg shadow-slate-900/30 hover:border-slate-700 transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="text-lg font-semibold text-white truncate">{c.title}</div>
                  <span className="px-3 py-1 rounded-full text-xs font-semibold bg-emerald-900/30 text-emerald-200 border border-emerald-700/40">
                    {(c.status || "Open").toString()}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2 text-xs">
                  {(c.specialization?.name || c.specialization_name || c.category) && (
                    <span className="px-3 py-1 rounded-full bg-slate-800 border border-slate-700 text-amber-200">
                      {c.specialization?.name || c.specialization_name || c.category}
                    </span>
                  )}
                  {c.district && (
                    <span className="px-3 py-1 rounded-full bg-slate-800 border border-slate-700 text-slate-200">
                      {c.district}
                    </span>
                  )}
                  <span className="px-3 py-1 rounded-full bg-slate-800 border border-slate-700 text-slate-300">
                    {c.created_at ? formattedDate(c.created_at) : "-"}
                  </span>
                </div>
                <div className="text-sm text-slate-300 line-clamp-2">
                  {c.summary_public || c.summary || "No summary provided yet."}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => navigate(`/client/cases/${c.id}`)}
                    className="px-4 py-2 rounded-lg bg-slate-800 border border-slate-700 hover:bg-slate-700 text-sm font-semibold text-white transition-colors"
                  >
                    Open Case
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate(`/client/cases/${c.id}?tab=requests`)}
                    className="px-4 py-2 rounded-lg bg-slate-800 border border-slate-700 hover:bg-slate-700 text-sm font-semibold text-white transition-colors"
                  >
                    Requests
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowForm(true)}
                    className="px-4 py-2 rounded-lg bg-slate-900 border border-slate-800 hover:bg-slate-800 text-sm font-semibold text-white transition-colors"
                  >
                    Edit
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
