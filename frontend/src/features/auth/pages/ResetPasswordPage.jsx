import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import apiClient from "../../../lib/apiClient";

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = useMemo(() => searchParams.get("token") || "", [searchParams]);

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (loading) return;

    setError("");
    setStatus("");

    if (!token) {
      setError("Reset token is missing.");
      return;
    }

    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      await apiClient.post("/auth/reset-password", {
        token,
        new_password: newPassword,
      });
      setStatus("Password reset successful. Redirecting to login...");
      setTimeout(() => navigate("/login", { replace: true }), 800);
    } catch (err) {
      const message =
        err?.response?.data?.detail ||
        err?.response?.data?.message ||
        err?.message ||
        "Unable to reset password.";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-lg mx-auto rounded-2xl border border-slate-200/10 bg-white/5 p-6 shadow-lg">
      <h1 className="text-2xl font-semibold text-white mb-2">Reset password</h1>
      <p className="text-sm text-slate-300 mb-6">
        Choose a new password for your account.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <label className="block text-sm text-white">
          New password
          <input
            type="password"
            className="mt-2 w-full rounded-lg bg-slate-900/70 border border-slate-700/70 px-4 py-3 text-sm text-white placeholder:text-slate-500 outline-none focus:border-amber-400/70 focus:ring-2 focus:ring-amber-400/30 transition-colors"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            placeholder="At least 8 characters"
            required
          />
        </label>

        <label className="block text-sm text-white">
          Confirm password
          <input
            type="password"
            className="mt-2 w-full rounded-lg bg-slate-900/70 border border-slate-700/70 px-4 py-3 text-sm text-white placeholder:text-slate-500 outline-none focus:border-amber-400/70 focus:ring-2 focus:ring-amber-400/30 transition-colors"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            placeholder="Re-enter your password"
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
          {loading ? "Resetting..." : "Reset password"}
        </button>
      </form>
    </div>
  );
}
