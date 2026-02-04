import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import apiClient from "../../../lib/apiClient";

export default function ForceResetPasswordPage() {
  const navigate = useNavigate();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("access_token");
    if (!token) {
      navigate("/login", { replace: true });
    }
  }, [navigate]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (loading) return;

    setError("");
    setStatus("");

    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    if (newPassword !== confirmNewPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      await apiClient.post("/auth/change-password", {
        current_password: currentPassword,
        new_password: newPassword,
      });

      setStatus("Password updated. Redirecting to dashboard...");
      setTimeout(() => navigate("/dashboard", { replace: true }), 800);
    } catch (err) {
      const message =
        err?.response?.data?.detail ||
        err?.response?.data?.message ||
        err?.message ||
        "Unable to update password.";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-lg mx-auto rounded-2xl border border-slate-200/10 bg-white/5 p-6 shadow-lg">
      <h1 className="text-2xl font-semibold text-white mb-2">
        Set a new password
      </h1>

      <form onSubmit={handleSubmit} className="space-y-4">
        <label className="block text-sm text-white">
          Current password
          <input
            type="password"
            className="mt-2 w-full rounded-lg bg-slate-900/70 border border-slate-700/70 px-4 py-3 text-sm text-white placeholder:text-slate-500 outline-none focus:border-amber-400/70 focus:ring-2 focus:ring-amber-400/30 transition-colors"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            placeholder="Enter current password"
            required
          />
        </label>

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
          Confirm new password
          <input
            type="password"
            className="mt-2 w-full rounded-lg bg-slate-900/70 border border-slate-700/70 px-4 py-3 text-sm text-white placeholder:text-slate-500 outline-none focus:border-amber-400/70 focus:ring-2 focus:ring-amber-400/30 transition-colors"
            value={confirmNewPassword}
            onChange={(event) => setConfirmNewPassword(event.target.value)}
            placeholder="Re-enter new password"
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
          {loading ? "Updating..." : "Update password"}
        </button>
      </form>
    </div>
  );
}
