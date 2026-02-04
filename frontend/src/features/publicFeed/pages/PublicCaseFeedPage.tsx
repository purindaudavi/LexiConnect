import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, Briefcase, MapPin, MessageCircle, Search } from "lucide-react";

import { fetchPublicCases } from "../services/publicFeedApi";
import { getSpecializations } from "../../cases/services/cases.service";

type PublicCase = {
  id: number;
  title: string;
  district?: string;
  category?: string;
  specialization_id?: number;
  specialization_name?: string;
  created_at?: string;
  comment_count?: number;
};

const formatDate = (value?: string) => {
  if (!value) return "—";
  return new Date(value).toLocaleDateString();
};

export default function PublicCaseFeedPage() {
  const navigate = useNavigate();
  const [cases, setCases] = useState<PublicCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [offset, setOffset] = useState(0);
  const limit = 10;

  const [filters, setFilters] = useState({
    q: "",
    district: "",
    specialization_id: "",
    sort: "latest",
  });

  const [specializations, setSpecializations] = useState<Array<{ id: number; name: string }>>([]);
  const [specializationsLoading, setSpecializationsLoading] = useState(true);

  const districtOptions = useMemo(
    () => ["Colombo", "Kandy", "Galle", "Jaffna", "Gampaha"],
    []
  );

  useEffect(() => {
    let mounted = true;
    const loadSpecializations = async () => {
      try {
        const data = await getSpecializations();
        if (!mounted) return;
        setSpecializations(Array.isArray(data) ? data : []);
      } catch (err) {
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
    setLoading(true);
    setError("");

    const timeout = setTimeout(async () => {
      try {
        const params = {
          q: filters.q || undefined,
          district: filters.district || undefined,
          specialization_id: filters.specialization_id
            ? Number(filters.specialization_id)
            : undefined,
          sort: filters.sort || "latest",
          limit,
          offset,
        };
        const data = await fetchPublicCases(params);
        if (!mounted) return;
        setCases(Array.isArray(data) ? data : []);
      } catch (err) {
        if (!mounted) return;
        setError("Unable to load public cases right now.");
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }, 250);

    return () => {
      mounted = false;
      clearTimeout(timeout);
    };
  }, [filters, offset]);

  const resetPagination = () => setOffset(0);

  const handleFilterChange = (key: string, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    resetPagination();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white">
      <div className="max-w-6xl mx-auto px-6 py-10 space-y-8">
        <Link to="/" className="inline-flex items-center gap-2 text-sm text-amber-300">
          <ArrowLeft className="w-4 h-4" />
          Back to home
        </Link>

        <div className="space-y-2">
          <h1 className="text-3xl font-bold">Public Case Discussions</h1>
          <p className="text-slate-400 text-sm">
            Explore public case summaries and join the conversation.
          </p>
        </div>

        <div className="grid lg:grid-cols-4 gap-3">
          <div className="lg:col-span-2">
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-900/70 border border-slate-800">
              <Search className="w-4 h-4 text-slate-400" />
              <input
                value={filters.q}
                onChange={(e) => handleFilterChange("q", e.target.value)}
                placeholder="Search by keyword"
                className="w-full bg-transparent text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none"
              />
            </div>
          </div>
          <div>
            <select
              value={filters.district}
              onChange={(e) => handleFilterChange("district", e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-slate-900/70 border border-slate-800 text-sm text-slate-200 focus:outline-none"
            >
              <option value="">All districts</option>
              {districtOptions.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>
          <div>
            <select
              value={filters.specialization_id}
              onChange={(e) => handleFilterChange("specialization_id", e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-slate-900/70 border border-slate-800 text-sm text-slate-200 focus:outline-none"
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
              value={filters.sort}
              onChange={(e) => handleFilterChange("sort", e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-slate-900/70 border border-slate-800 text-sm text-slate-200 focus:outline-none"
            >
              <option value="latest">Latest</option>
              <option value="most_commented">Most Discussed</option>
            </select>
          </div>
        </div>

        {error && <div className="text-sm text-red-300">{error}</div>}

        {loading ? (
          <div className="text-slate-400 text-sm">Loading cases...</div>
        ) : cases.length === 0 ? (
          <div className="text-slate-400 text-sm">No cases found</div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {cases.map((c) => (
              <div
                key={c.id}
                className="border border-slate-800 rounded-xl bg-slate-900/60 p-4 space-y-3"
              >
                <div className="text-lg font-semibold text-white">{c.title}</div>
                <div className="flex flex-wrap gap-3 text-xs text-slate-400">
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="w-3 h-3" />
                    {c.district || "—"}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Briefcase className="w-3 h-3" />
                    {c.specialization_name || c.category || "—"}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <MessageCircle className="w-3 h-3" />
                    {c.comment_count || 0} comments
                  </span>
                </div>
                <div className="text-xs text-slate-500">{formatDate(c.created_at)}</div>
                <button
                  onClick={() => navigate(`/public/cases/${c.id}`)}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-sm text-white hover:bg-slate-700 transition-colors"
                >
                  View discussion <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between pt-2">
          <button
            disabled={offset === 0}
            onClick={() => setOffset((prev) => Math.max(0, prev - limit))}
            className="px-4 py-2 rounded-lg border border-slate-700 bg-slate-900 text-sm text-slate-200 disabled:opacity-50"
          >
            Previous
          </button>
          <button
            disabled={cases.length < limit}
            onClick={() => setOffset((prev) => prev + limit)}
            className="px-4 py-2 rounded-lg border border-slate-700 bg-slate-900 text-sm text-slate-200 disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
