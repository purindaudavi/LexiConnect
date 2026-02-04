import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import StatGrid from "../components/ui/StatGrid";
import EmptyState from "../components/ui/EmptyState";
import StatusPill from "../components/ui/StatusPill";
import { listMyBookings } from "../services/bookings";
import { fetchPublicCases } from "../features/publicFeed/services/publicFeedApi";
import { getSpecializations } from "../features/cases/services/cases.service";

const formatDateTime = (value) => {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
};

export default function Dashboard() {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [publicCases, setPublicCases] = useState([]);
  const [publicCasesLoading, setPublicCasesLoading] = useState(true);
  const [publicCasesError, setPublicCasesError] = useState("");
  const [specializations, setSpecializations] = useState([]);
  const [specializationsLoading, setSpecializationsLoading] = useState(true);
  const [publicFilters, setPublicFilters] = useState({
    q: "",
    district: "",
    specialization_id: "",
    sort: "latest",
  });

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const data = await listMyBookings();
        setBookings(data || []);
      } catch (err) {
        const message =
          err?.response?.data?.detail ||
          err?.response?.data?.message ||
          "Could not load bookings.";
        setError(message);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  useEffect(() => {
    let mounted = true;
    const loadSpecializations = async () => {
      try {
        const data = await getSpecializations();
        if (!mounted) return;
        setSpecializations(Array.isArray(data) ? data : []);
      } catch {
        if (!mounted) return;
        setSpecializations([
          { id: 1, name: "Family Law" },
          { id: 2, name: "Property & Conveyancing" },
          { id: 3, name: "Corporate & Contracts" },
          { id: 4, name: "Criminal Defense" },
        ]);
      } finally {
        if (mounted) {
          setSpecializationsLoading(false);
        }
      }
    };
    loadSpecializations();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    setPublicCasesLoading(true);
    setPublicCasesError("");

    const timeout = setTimeout(async () => {
      try {
        const params = {
          q: publicFilters.q || undefined,
          district: publicFilters.district || undefined,
          specialization_id: publicFilters.specialization_id
            ? Number(publicFilters.specialization_id)
            : undefined,
          sort: publicFilters.sort || "latest",
          limit: 6,
          offset: 0,
        };
        const data = await fetchPublicCases(params);
        if (!mounted) return;
        setPublicCases(Array.isArray(data) ? data : []);
      } catch {
        if (!mounted) return;
        setPublicCasesError("Unable to load public cases right now.");
      } finally {
        if (mounted) {
          setPublicCasesLoading(false);
        }
      }
    }, 300);

    return () => {
      mounted = false;
      clearTimeout(timeout);
    };
  }, [publicFilters]);

  const stats = useMemo(() => {
    const total = bookings.length;
    const pending = bookings.filter(
      (b) => (b.status || "").toString().toLowerCase() === "pending"
    ).length;
    return [
      { label: "Total bookings", value: total || "—" },
      { label: "Pending bookings", value: pending || "—" },
      { label: "Documents", value: "—", hint: "Coming soon" },
      { label: "Disputes", value: "—", hint: "Coming soon" },
    ];
  }, [bookings]);

  const recentBookings = bookings.slice(0, 5);

  return (
    <div className="min-h-screen w-full px-6 py-8 text-white">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-slate-400 text-sm mt-1">
            Overview of your legal activity
          </p>
        </div>
      </div>

      <div className="space-y-8 mt-6">
      <section className="rounded-2xl border border-slate-700 bg-gradient-to-br from-slate-900/80 via-slate-900 to-slate-950 p-6 md:p-8 shadow-lg shadow-slate-900/30">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div className="space-y-2">
            <p className="text-sm uppercase tracking-[0.2em] text-amber-300">Client Portal</p>
            <h1 className="text-3xl md:text-4xl font-bold text-white">
              Find the right lawyer. Move your case forward.
            </h1>
            <p className="text-slate-300 max-w-3xl">
              Post your legal issue, compare lawyers, book appointments, and keep documents in one secure place.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              to="/client/cases?create=1"
              className="px-5 py-3 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold shadow-md shadow-amber-500/25 transition-colors"
            >
              Post Legal Issue
            </Link>
            <Link
              to="/client/search"
              className="px-5 py-3 rounded-xl bg-slate-800 border border-slate-700 hover:bg-slate-700 text-white font-semibold transition-colors"
            >
              Search Lawyers
            </Link>
            <Link
              to="/client/manage-bookings"
              className="px-5 py-3 rounded-xl bg-slate-800 border border-slate-700 hover:bg-slate-700 text-white font-semibold transition-colors"
            >
              My Bookings
            </Link>
          </div>
        </div>
      </section>

      <StatGrid items={stats} />

      <section className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 space-y-4 shadow-lg shadow-slate-900/30">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-lg font-semibold text-white">Quick Actions</div>
            <div className="text-sm text-slate-400">Start faster with these shortcuts</div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              to="/client/cases?create=1"
              className="px-3 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-sm font-semibold text-slate-950 transition-colors"
            >
              Post Legal Issue
            </Link>
            <Link
              to="/client/search"
              className="px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 hover:bg-slate-700 text-sm font-semibold text-white transition-colors"
            >
              Search Lawyers
            </Link>
            <Link
              to="/client/manage-bookings"
              className="px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 hover:bg-slate-700 text-sm font-semibold text-white transition-colors"
            >
              Manage Bookings
            </Link>
            <Link
              to="/disputes/submit"
              className="px-3 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-sm font-semibold text-white transition-colors"
            >
              Submit Dispute
            </Link>
          </div>
        </div>
      </section>

      <section className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 space-y-4 shadow-lg shadow-slate-900/30">
        <div>
          <div className="text-lg font-semibold text-white">Public Legal Discussions</div>
          <div className="text-sm text-slate-400">
            Comment on real issues and see what others are discussing.
          </div>
        </div>

        <div className="grid lg:grid-cols-4 gap-3">
          <div className="lg:col-span-2">
            <input
              value={publicFilters.q}
              onChange={(e) => setPublicFilters((f) => ({ ...f, q: e.target.value }))}
              placeholder="Search by keyword"
              className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-sm placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>
          <div>
            <select
              value={publicFilters.district}
              onChange={(e) => setPublicFilters((f) => ({ ...f, district: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
            >
              {["", "Colombo", "Kandy", "Galle", "Jaffna", "Gampaha"].map((d) => (
                <option key={d || "all"} value={d}>
                  {d || "All districts"}
                </option>
              ))}
            </select>
          </div>
          <div>
            <select
              value={publicFilters.specialization_id}
              onChange={(e) =>
                setPublicFilters((f) => ({ ...f, specialization_id: e.target.value }))
              }
              className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
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
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-3">
          <div className="lg:col-span-1">
            <select
              value={publicFilters.sort}
              onChange={(e) => setPublicFilters((f) => ({ ...f, sort: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
            >
              <option value="latest">Latest</option>
              <option value="most_commented">Most Discussed</option>
            </select>
          </div>
        </div>

        {publicCasesError && <div className="text-sm text-red-300">{publicCasesError}</div>}

        {publicCasesLoading ? (
          <div className="text-slate-400">Loading public cases...</div>
        ) : publicCases.length === 0 ? (
          <div className="text-slate-400">No public cases found</div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {publicCases.map((c) => (
              <div
                key={c.id}
                className="border border-slate-800 rounded-xl bg-slate-900/70 p-4 space-y-3"
              >
                <div className="text-lg font-semibold text-white">{c.title}</div>
                <div className="flex flex-wrap gap-2 text-xs text-slate-400">
                  <span>{c.district || "â€”"}</span>
                  <span>|</span>
                  <span>{c.specialization_name || c.category || "â€”"}</span>
                  <span>|</span>
                  <span>{c.comment_count || 0} comments</span>
                </div>
                <div className="text-xs text-slate-500">{formatDateTime(c.created_at)}</div>
                <Link
                  to={`/public/cases/${c.id}`}
                  className="inline-flex items-center justify-center px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 hover:bg-slate-700 text-sm font-semibold text-white transition-colors"
                >
                  Open discussion
                </Link>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 shadow-lg shadow-slate-900/30">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-lg font-semibold text-white">Recent Bookings</div>
            <div className="text-sm text-slate-400">Latest activity (up to 5)</div>
          </div>
          <Link
            to="/client/manage-bookings"
            className="text-sm text-amber-300 hover:text-amber-200 underline"
          >
            View all
          </Link>
        </div>

        {loading && <div className="text-slate-400">Loading bookings...</div>}

        {!loading && error && (
          <EmptyState
            title="No data available"
            description={error}
            buttonLabel="Try again"
            buttonLink="/client/manage-bookings"
          />
        )}

        {!loading && !error && recentBookings.length === 0 && (
          <EmptyState
            title="No bookings yet"
            description="When you book a lawyer, the latest bookings will appear here."
            buttonLabel="Find a lawyer"
            buttonLink="/client/search"
          />
        )}

        {!loading && !error && recentBookings.length > 0 && (
          <div className="space-y-3">
            {recentBookings.map((booking) => (
              <div
                key={booking.id}
                className="bg-slate-900/70 border border-slate-800 rounded-xl p-4 flex items-center justify-between hover:border-slate-700 transition-colors"
              >
                <div>
                  <div className="flex items-center gap-3 mb-1">
                    <div className="text-white font-semibold">Booking #{booking.id}</div>
                    <StatusPill status={booking.status} />
                  </div>
                  <div className="text-sm text-slate-400">
                    Scheduled: {formatDateTime(booking.scheduled_at)}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Link
                    to={`/client/bookings/${booking.id}`}
                    className="px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 hover:bg-slate-700 text-sm font-medium text-white transition-colors"
                  >
                    View
                  </Link>
                  <Link
                    to={`/client/bookings/${booking.id}/documents`}
                    className="px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-sm font-medium text-white transition-colors"
                  >
                    Documents
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
      </div>
    </div>
  );
}
