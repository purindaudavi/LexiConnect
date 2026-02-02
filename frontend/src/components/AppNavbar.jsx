import { NavLink, useNavigate } from "react-router-dom";
import { LogOut, Scale } from "lucide-react";
import { getUserFromToken, logout as clearAuth } from "../services/auth";

const TopNav = ({ links = [], brand = "LexiConnect" }) => {
  const navigate = useNavigate();
  const user = getUserFromToken();
  const role = user?.role || localStorage.getItem("role") || "User";
  const email = localStorage.getItem("email") || "User";

  const handleLogout = () => {
    clearAuth();
    localStorage.removeItem("user");
    localStorage.removeItem("email");

    // Optional: clear axios default header if you set it globally
    if (window.axios) {
      delete window.axios.defaults.headers.common["Authorization"];
    }

    // Redirect to landing page
    navigate("/", { replace: true });
  };

  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-slate-950/40 backdrop-blur">
      <div className="mx-auto max-w-6xl px-6 py-4 flex items-center justify-between gap-6">
        {/* Brand */}
        <div className="flex items-center gap-3 min-w-[210px]">
          <Scale className="text-amber-300" size={20} aria-hidden="true" />
          <div className="text-amber-300 font-semibold tracking-wide text-sm sm:text-base">
            {brand}
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex items-center gap-2 flex-1 justify-center">
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.to.endsWith("/dashboard")}
              className={({ isActive }) =>
                `px-4 py-2 rounded-lg text-sm font-medium transition ${
                  isActive
                    ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                    : "text-slate-200 hover:text-white hover:bg-white/5"
                }`
              }
            >
              {link.label}
            </NavLink>
          ))}
        </nav>

        {/* User badge and logout */}
        <div className="flex items-center gap-3 min-w-[210px] justify-end">
          <div className="hidden sm:flex flex-col items-end text-xs leading-tight">
            <span className="text-slate-300 font-medium">{email}</span>
            <span className="text-slate-400 capitalize">{role}</span>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 transition text-sm font-medium text-slate-200 hover:text-white"
          >
            <span>Logout</span>
            <LogOut size={16} aria-hidden="true" />
          </button>
        </div>
      </div>
    </header>
  );
};

export default TopNav;
