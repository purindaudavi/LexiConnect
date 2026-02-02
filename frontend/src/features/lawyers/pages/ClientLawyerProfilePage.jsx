import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getLawyerProfile } from "../services/lawyers.service";

export default function ClientLawyerProfilePage() {
  const { lawyerId } = useParams();
  const [lawyer, setLawyer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const data = await getLawyerProfile(lawyerId);
        setLawyer(data || null);
      } catch (err) {
        const message =
          err?.response?.data?.detail ||
          err?.response?.data?.message ||
          "Failed to load lawyer profile.";
        setError(message);
        setLawyer(null);
      } finally {
        setLoading(false);
      }
    };

    if (lawyerId) load();
  }, [lawyerId]);

  const languages = useMemo(() => {
    if (!lawyer || !Array.isArray(lawyer.languages)) return [];
    return lawyer.languages.filter(Boolean);
  }, [lawyer]);

  if (loading) {
    return (
      <div className="min-h-screen px-6 py-8 text-white">
        <div className="text-slate-300">Loading...</div>
      </div>
    );
  }

  if (!lawyer || error) {
    return (
      <div className="min-h-screen px-6 py-8 text-white space-y-4">
        <div className="text-red-300">{error || "Lawyer not found."}</div>
        <Link to="/client/cases" className="text-amber-200 hover:text-amber-100 text-sm">
          Back to cases
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen px-6 py-8 text-white">
      <div className="max-w-3xl space-y-6">
        <div className="flex items-center justify-between">
          <Link to="/client/cases" className="text-amber-200 hover:text-amber-100 text-sm">
            Back to cases
          </Link>
        </div>

        <div className="border border-slate-800 rounded-2xl bg-slate-900/70 p-6 space-y-3">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-white">{lawyer.name || "Lawyer"}</h1>
            {lawyer.verified && (
              <span className="text-xs uppercase tracking-wide text-amber-200 bg-amber-500/10 border border-amber-500/30 px-3 py-1 rounded-full">
                Verified
              </span>
            )}
          </div>
          <div className="text-sm text-slate-300">
            {lawyer.specialization || "General Practice"}
          </div>
          <div className="text-sm text-slate-400">
            {[lawyer.city, lawyer.district].filter(Boolean).join(", ") || "Location not set"}
          </div>
        </div>

        <div className="border border-slate-800 rounded-2xl bg-slate-900/70 p-6 space-y-4">
          <div>
            <div className="text-sm text-slate-400">About</div>
            <div className="text-sm text-slate-200">
              {lawyer.bio || "No bio provided yet."}
            </div>
          </div>
          <div>
            <div className="text-sm text-slate-400">Languages</div>
            <div className="text-sm text-slate-200">
              {languages.length ? languages.join(", ") : "Not specified"}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
