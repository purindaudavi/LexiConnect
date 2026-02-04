import React, { useMemo, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Scale,
  Lock,
  Search,
  Users,
  Clock3,
  FileCheck,
  MessageCircle,
  ShieldCheck,
  ArrowRight,
  Star,
  MapPin,
  Briefcase,
} from "lucide-react";
import useRequireAuth from "../hooks/useRequireAuth";
import LoginRequiredModal from "../components/ui/LoginRequiredModal";
import { fetchPublicCases } from "../features/publicFeed/services/publicFeedApi";
import { getSpecializations } from "../features/cases/services/cases.service";

export default function LandingPage() {
  const navigate = useNavigate();
  const { requireAuth, modalOpen, closeModal } = useRequireAuth();
  const [publicCases, setPublicCases] = useState([]);
  const [publicCasesLoading, setPublicCasesLoading] = useState(true);
  const [publicCasesError, setPublicCasesError] = useState("");
  const [specializations, setSpecializations] = useState([]);
  const [specializationsLoading, setSpecializationsLoading] = useState(true);
  const [filters, setFilters] = useState({
    q: "",
    district: "",
    specialization_id: "",
    sort: "latest",
  });

  const previewLawyers = useMemo(
    () => [
      { name: "Ayesha Perera", location: "Colombo", focus: "Family Law" },
      { name: "Nimal Fernando", location: "Kandy", focus: "Property & Conveyancing" },
      { name: "Tharindu Silva", location: "Galle", focus: "Corporate & Contracts" },
    ],
    []
  );

  const features = useMemo(
    () => [
      { title: "Verified Lawyers", icon: ShieldCheck, desc: "Profiles screened and KYC verified." },
      { title: "Digital Documents", icon: FileCheck, desc: "Upload, share, and access securely." },
      { title: "Smart Intake", icon: MessageCircle, desc: "Structured questionnaires for faster context." },
      { title: "Booking & Scheduling", icon: Clock3, desc: "Request times that fit both parties." },
      { title: "Case Tracking", icon: Search, desc: "Stay on top of progress and next steps." },
      { title: "Secure Messaging", icon: Lock, desc: "Keep client-lawyer comms private." },
    ],
    []
  );

  const steps = useMemo(
    () => [
      "Search for a lawyer that fits your need",
      "Review expertise, location, and languages",
      "Post your case or request a consultation",
      "Complete intake and share documents",
      "Get matched and confirm the booking",
      "Track progress and collaborate securely",
    ],
    []
  );

  const profilePreview = useMemo(
    () => [
      {
        name: "Dulani Jayasinghe",
        rating: "4.9",
        focus: "Corporate & Commercial",
        location: "Colombo • Hybrid",
        tags: ["M&A", "Contracts", "Startup Advisory"],
      },
      {
        name: "Isuru Bandara",
        rating: "4.7",
        focus: "Litigation & Disputes",
        location: "Kandy • In-person",
        tags: ["Civil", "Disputes", "Arbitration"],
      },
    ],
    []
  );

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
    setPublicCasesLoading(true);
    setPublicCasesError("");

    const timeout = setTimeout(async () => {
      try {
        const params = {
          q: filters.q || undefined,
          district: filters.district || undefined,
          specialization_id: filters.specialization_id
            ? Number(filters.specialization_id)
            : undefined,
          sort: filters.sort || "latest",
          limit: 6,
          offset: 0,
        };
        const data = await fetchPublicCases(params);
        if (!mounted) return;
        setPublicCases(Array.isArray(data) ? data : []);
      } catch (err) {
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
  }, [filters]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white">
      {/* Navbar */}
      <header className="fixed top-0 inset-x-0 z-40 border-b border-slate-800/60 bg-slate-950/80 backdrop-blur">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/40 text-amber-400">
              <Scale className="w-6 h-6" />
            </div>
            <div>
              <div className="text-lg font-bold tracking-tight">LexiConnect</div>
              <div className="text-xs text-slate-400">Digital legal workspace</div>
            </div>
          </div>

          <nav className="hidden md:flex items-center gap-6 text-sm text-slate-300">
            <a href="#home" className="hover:text-white transition-colors">
              Home
            </a>
            <a href="#search" className="hover:text-white transition-colors">
              Search Lawyers
            </a>
            <a href="#how" className="hover:text-white transition-colors">
              How It Works
            </a>
            <a href="#profiles" className="hover:text-white transition-colors">
              For Lawyers
            </a>
          </nav>

          <div className="flex items-center gap-3">
            <Link
              to="/login"
              className="px-3 py-2 rounded-lg border border-slate-700 bg-slate-900 hover:bg-slate-800 text-sm font-medium"
            >
              Login
            </Link>
            <Link
              to="/register"
              className="px-3 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-sm font-medium text-white"
            >
              Register
            </Link>
          </div>
        </div>
      </header>

      <main id="home" className="pt-28 pb-16">
        <div className="max-w-6xl mx-auto px-6 space-y-20">
          {/* Hero */}
          <section className="grid md:grid-cols-2 gap-10 items-center">
            <div className="space-y-6">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs font-semibold">
                <ShieldCheck className="w-4 h-4" />
                Trusted legal network
              </div>
              <h1 className="text-4xl md:text-5xl font-extrabold leading-tight">
                Find the Right Lawyer.{" "}
                <span className="text-amber-400">Manage Your Case Digitally.</span>
              </h1>
              <p className="text-lg text-slate-300 max-w-2xl">
                Compare verified lawyers, post cases securely, share documents, and track every step
                from intake to dispute resolution in one modern workspace.
              </p>
              <div className="flex flex-wrap gap-3">
                <Link
                  to="/search"
                  className="inline-flex items-center gap-2 px-5 py-3 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-semibold"
                >
                  <Search className="w-4 h-4" />
                  Search Lawyers
                </Link>
                <button
                  onClick={() => requireAuth(() => navigate("/client/cases/new"))}
                  className="inline-flex items-center gap-2 px-5 py-3 rounded-lg bg-slate-800 border border-slate-700 hover:bg-slate-700 text-white font-semibold"
                >
                  <Lock className="w-4 h-4" />
                  Post a Case
                </button>
              </div>
              <div className="flex items-center gap-4 text-sm text-slate-400">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-amber-300" />
                  Thousands of clients served
                </div>
                <div className="flex items-center gap-2">
                  <Clock3 className="w-4 h-4 text-amber-300" />
                  Fast digital onboarding
                </div>
              </div>
            </div>
            <div className="relative">
              <div className="absolute inset-0 blur-3xl bg-amber-500/10 rounded-full" />
              <div className="relative rounded-2xl border border-slate-800 bg-slate-900/60 p-6 shadow-2xl space-y-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-slate-800 border border-slate-700">
                    <FileCheck className="w-5 h-5 text-amber-300" />
                  </div>
                  <div>
                    <div className="text-sm text-slate-400">Workflow Preview</div>
                    <div className="text-lg font-semibold">Book • Intake • Docs</div>
                  </div>
                </div>
                <div className="space-y-2 text-sm text-slate-300">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-amber-300" /> Verified lawyer network
                  </div>
                  <div className="flex items-center gap-2">
                    <Lock className="w-4 h-4 text-amber-300" /> Secure document sharing
                  </div>
                  <div className="flex items-center gap-2">
                    <MessageCircle className="w-4 h-4 text-amber-300" /> Intake + messaging in one place
                  </div>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
                  <div className="text-xs text-slate-400 mb-1">Next Step</div>
                  <div className="text-sm text-white flex items-center gap-2">
                    Post your case <ArrowRight className="w-4 h-4 text-amber-300" />
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Trending Legal Issues */}
          <section className="space-y-5">
            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
              <div>
                <h2 className="text-2xl font-bold">Trending Legal Issues</h2>
                <p className="text-slate-400 text-sm">
                  Browse public case discussions and see what people are asking about.
                </p>
              </div>
              <Link
                to="/public/cases"
                className="text-sm text-amber-300 hover:text-amber-200 inline-flex items-center gap-2"
              >
                View all discussions <ArrowRight className="w-4 h-4" />
              </Link>
            </div>

            <div className="grid lg:grid-cols-4 gap-3">
              <div className="lg:col-span-2">
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-900/70 border border-slate-800">
                  <Search className="w-4 h-4 text-slate-400" />
                  <input
                    value={filters.q}
                    onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
                    placeholder="Search by keyword"
                    className="w-full bg-transparent text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none"
                  />
                </div>
              </div>
              <div>
                <select
                  value={filters.district}
                  onChange={(e) => setFilters((f) => ({ ...f, district: e.target.value }))}
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
                  onChange={(e) =>
                    setFilters((f) => ({ ...f, specialization_id: e.target.value }))
                  }
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
                  onChange={(e) => setFilters((f) => ({ ...f, sort: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg bg-slate-900/70 border border-slate-800 text-sm text-slate-200 focus:outline-none"
                >
                  <option value="latest">Latest</option>
                  <option value="most_commented">Most Discussed</option>
                </select>
              </div>
            </div>

            {publicCasesError && (
              <div className="text-sm text-red-300">{publicCasesError}</div>
            )}

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {publicCasesLoading ? (
                <div className="col-span-full text-slate-400 text-sm">Loading cases...</div>
              ) : publicCases.length === 0 ? (
                <div className="col-span-full text-slate-400 text-sm">No cases found</div>
              ) : (
                publicCases.map((c) => (
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
                    <div className="text-xs text-slate-500">
                      {c.created_at ? new Date(c.created_at).toLocaleDateString() : "—"}
                    </div>
                    <Link
                      to={`/public/cases/${c.id}`}
                      className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-sm text-white hover:bg-slate-700 transition-colors"
                    >
                      View discussion <ArrowRight className="w-4 h-4" />
                    </Link>
                  </div>
                ))
              )}
            </div>
          </section>

          {/* Guest Search Preview */}
          <section id="search" className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold">Preview lawyers</h2>
                <p className="text-slate-400 text-sm">
                  Sign in to view full profiles, compare lawyers, and book appointments.
                </p>
              </div>
            </div>
            <div className="grid md:grid-cols-3 gap-4">
              {previewLawyers.map((lawyer) => (
                <div
                  key={lawyer.name}
                  className="border border-slate-800 rounded-xl bg-slate-900/50 p-4 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-white">{lawyer.name}</div>
                      <div className="text-slate-400 text-sm">{lawyer.location}</div>
                    </div>
                    <Lock className="w-4 h-4 text-slate-500" />
                  </div>
                  <div className="text-sm text-amber-200">{lawyer.focus}</div>
                  <button
                    disabled
                    className="w-full mt-2 inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed"
                  >
                    <Lock className="w-4 h-4" />
                    Sign in to view profile
                  </button>
                </div>
              ))}
            </div>
            <div className="text-sm text-slate-400">
              Sign in to view full profiles, compare lawyers, and book appointments.
            </div>
          </section>

          {/* Why Sign Up */}
          <section id="lawyers" className="space-y-6">
            <h2 className="text-2xl font-bold">Why sign up</h2>
            <div className="grid md:grid-cols-3 gap-4">
              {features.map(({ title, icon: Icon, desc }) => (
                <div
                  key={title}
                  className="border border-slate-800 rounded-xl bg-slate-900/60 p-4 space-y-2"
                >
                  <div className="flex items-center gap-2 text-amber-300">
                    <Icon className="w-5 h-5" />
                    <div className="font-semibold text-white">{title}</div>
                  </div>
                  <div className="text-sm text-slate-400">{desc}</div>
                </div>
              ))}
            </div>
          </section>

          {/* How it works */}
          <section id="how" className="space-y-4">
            <h2 className="text-2xl font-bold">How LexiConnect works</h2>
            <div className="grid md:grid-cols-3 gap-4">
              {steps.map((step, idx) => (
                <div
                  key={step}
                  className="border border-slate-800 rounded-xl bg-slate-900/50 p-4 flex items-start gap-3"
                >
                  <div className="w-9 h-9 rounded-full bg-amber-500/10 border border-amber-500/40 text-amber-300 flex items-center justify-center text-sm font-bold">
                    {idx + 1}
                  </div>
                  <div className="text-sm text-slate-200">{step}</div>
                </div>
              ))}
            </div>
          </section>

          {/* Detailed Lawyer Profiles */}
          <section id="profiles" className="space-y-4">
            <h2 className="text-2xl font-bold">Detailed lawyer profiles</h2>
            <p className="text-slate-400 text-sm">
              See practice focus, ratings, availability, and languages at a glance.
            </p>
            <div className="grid md:grid-cols-2 gap-4">
              {profilePreview.map((p) => (
                <div
                  key={p.name}
                  className="border border-slate-800 rounded-xl bg-slate-900/60 p-5 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <div className="text-lg font-semibold text-white">{p.name}</div>
                    <div className="flex items-center gap-1 text-amber-300 font-semibold">
                      <Star className="w-4 h-4" />
                      {p.rating}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-slate-400 text-sm">
                    <Briefcase className="w-4 h-4" />
                    {p.focus}
                  </div>
                  <div className="flex items-center gap-2 text-slate-400 text-sm">
                    <MapPin className="w-4 h-4" />
                    {p.location}
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs text-amber-200">
                    {p.tags.map((t) => (
                      <span
                        key={t}
                        className="px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-100"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => requireAuth(() => navigate(`/client/profile/${p.name}`))}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800 border border-slate-700 text-sm text-white hover:bg-slate-700 transition-colors"
                    >
                      <Lock className="w-4 h-4" />
                      View full profile
                    </button>
                    <button
                      onClick={() => requireAuth(() => navigate(`/client/booking/${p.name}`))}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-sm text-white transition-colors"
                    >
                      <Lock className="w-4 h-4" />
                      Book appointment
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800 bg-slate-950 py-8">
        <div className="max-w-6xl mx-auto px-6 space-y-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <div className="text-lg font-bold">Ready to move your case forward?</div>
              <div className="text-slate-400 text-sm">Create your account and start securely.</div>
            </div>
            <div className="flex gap-3">
              <Link
                to="/login"
                className="px-4 py-2 rounded-lg border border-slate-700 bg-slate-900 hover:bg-slate-800 text-sm font-medium"
              >
                Login
              </Link>
              <Link
                to="/register"
                className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-sm font-medium text-white"
              >
                Register
              </Link>
            </div>
          </div>
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 text-slate-400 text-sm pt-4 border-t border-slate-800">
            <div className="flex items-center gap-2 text-white">
              <Scale className="w-4 h-4 text-amber-300" />
              LexiConnect
            </div>
            <div className="flex items-center gap-4">
              <a href="#home" className="hover:text-white">
                Home
              </a>
              <a href="#search" className="hover:text-white">
                Search
              </a>
              <a href="#how" className="hover:text-white">
                How it works
              </a>
            </div>
            <div>© {new Date().getFullYear()} LexiConnect. All rights reserved.</div>
          </div>
        </div>
      </footer>

      <LoginRequiredModal
        open={modalOpen}
        onClose={closeModal}
        title="Login to post a case"
        description="Create an account to post cases and receive lawyer requests."
      />
    </div>
  );
}
