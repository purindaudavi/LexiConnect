import { useState } from "react";
import { Link } from "react-router-dom";

import apiClient from "../../../lib/apiClient";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (loading) return;

    setError("");
    setStatus("");
    setLoading(true);

    try {
      await apiClient.post("/auth/forgot-password", { email });
      setStatus("If the email exists, a reset link was sent.");
    } catch (err) {
      const message =
        err?.response?.data?.detail ||
        err?.response?.data?.message ||
        err?.message ||
        "Unable to request reset link.";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-lg mx-auto rounded-2xl border border-slate-200/10 bg-white/5 p-6 shadow-lg">
      <h1 className="text-2xl font-semibold text-white mb-2">Forgot password</h1>
      <p className="text-sm text-slate-300 mb-6">
        Enter your email and we will send a reset link if it exists.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <label className="block text-sm text-white">
          Email
          <input
            type="email"
            className="mt-2 w-full rounded-lg bg-slate-900/70 border border-slate-700/70 px-4 py-3 text-sm text-white placeholder:text-slate-500 outline-none focus:border-amber-400/70 focus:ring-2 focus:ring-amber-400/30 transition-colors"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
            required
          />
        </label>

        {status && (
          <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
            {status}
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-gradient-to-r from-amber-400 via-amber-500 to-amber-600 py-3 font-semibold text-white shadow-lg hover:shadow-xl hover:shadow-amber-500/25 active:scale-[0.98] disabled:opacity-70 transition-all"
        >
          {loading ? "Sending..." : "Send reset link"}
        </button>

        <div className="text-center text-xs text-white">
          <Link
            to="/login"
            className="font-semibold text-amber-400 hover:text-amber-300 hover:underline transition-colors"
          >
            Back to Login
          </Link>
        </div>
      </form>
    </div>
  );
}
