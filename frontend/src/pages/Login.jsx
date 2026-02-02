import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import authApi from "../services/authApi";
import { getUserFromToken } from "../services/auth";
import { useAuth } from "../context/AuthContext";

export default function Login() {
  const navigate = useNavigate();
  const { refreshMe } = useAuth();
  const [email, setEmail] = useState("lawyer@lexiconnect.local");
  const [password, setPassword] = useState("password");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (loading) return;
    setError("");
    setLoading(true);

    try {
      const formData = new URLSearchParams();
      formData.append("username", email);
      formData.append("password", password);

      // Swagger: POST /auth/login
      const { data } = await authApi.post("/login", formData);

      const token = data?.access_token;
      const refresh = data?.refresh_token;
      const tokenType = data?.token_type || "bearer";

      if (!token) throw new Error("No access_token returned from server");

      localStorage.setItem("access_token", token);
      localStorage.setItem("token", token);

      if (refresh) {
        localStorage.setItem("refresh_token", refresh);
      } else {
        // optional: clear old refresh token if one exists
        localStorage.removeItem("refresh_token");
      }

      localStorage.setItem("token_type", tokenType);

      // Decode role from JWT payload
      let role = "";
      try {
        let base64 = (token.split(".")[1] || "")
          .replace(/-/g, "+")
          .replace(/_/g, "/");
        while (base64.length % 4) {
          base64 += "=";
        }
        const payloadStr = atob(base64);
        const payload = JSON.parse(payloadStr);
        role = String(payload?.role || "").toLowerCase();
      } catch {
        const payload = getUserFromToken?.();
        role = String(payload?.role || "").toLowerCase();
      }

      if (role) localStorage.setItem("role", role);

      // Redirect based on role
      let target = "/dashboard";
      if (role === "lawyer") target = "/lawyer/dashboard";
      else if (role === "client") target = "/client/dashboard";
      else if (role === "admin") target = "/admin/dashboard";
      else if (role === "apprentice") target = "/apprentice/dashboard";

      await refreshMe();
      navigate(target, { replace: true });
    } catch (err) {
      const message =
        err?.response?.data?.detail ||
        err?.response?.data?.message ||
        err?.message ||
        "Login failed. Please check your credentials.";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full">
      <div className="flex justify-between items-center mb-4">
        <Link
          to="/"
          className="text-sm text-amber-300 hover:text-amber-200 flex items-center gap-1"
        >
          <span>&larr;</span>
          <span>Back to Home</span>
        </Link>
      </div>

      <div className="w-full rounded-2xl border border-amber-500/20 bg-white/5 backdrop-blur-md shadow-[0_20px_60px_rgba(0,0,0,0.55)] p-8 text-white">
        <div className="flex items-center justify-center gap-3 mb-4">
          <div className="text-3xl">LC</div>
          <div className="text-center">
            <div className="text-xl font-bold text-white">LexiConnect</div>
            <div className="text-xs text-slate-400 mt-0.5">
              Legal Excellence Platform
            </div>
          </div>
        </div>

        <h2 className="text-center text-2xl font-bold text-white mb-1">
          Welcome Back
        </h2>
        <p className="text-center text-sm text-slate-300 mb-6">
          Access your legal services portal
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block text-sm text-white">
            Email Address
            <div className="mt-2 relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-white text-base">
                @
              </span>
              <input
                className="w-full rounded-lg bg-slate-900/70 border border-slate-700/70 pl-10 pr-4 py-3 text-sm text-white placeholder:text-slate-500 outline-none focus:border-amber-400/70 focus:ring-2 focus:ring-amber-400/30 transition-colors"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="lawyer@lexiconnect.local"
                required
              />
            </div>
          </label>

          <label className="block text-sm text-white">
            Password
            <div className="mt-2 relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-white text-base">
                *
              </span>
              <input
                className="w-full rounded-lg bg-slate-900/70 border border-slate-700/70 pl-10 pr-4 py-3 text-sm text-white placeholder:text-slate-500 outline-none focus:border-amber-400/70 focus:ring-2 focus:ring-amber-400/30 transition-colors"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="password"
                required
              />
            </div>
          </label>

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
            {loading ? "Signing in..." : "Access Platform"}
          </button>
        </form>

        <div className="mt-5 text-center text-sm text-white">
          Don't have an account?{" "}
          <Link
            to="/register"
            className="font-semibold text-amber-400 hover:text-amber-300 hover:underline transition-colors"
          >
            Register Now
          </Link>
        </div>
      </div>
    </div>
  );
}
