import { Outlet, useNavigate } from "react-router-dom";
import { logout as clearAuth } from "../services/auth";
import TopNavbar from "../components/TopNavbar";

export default function ApprenticeLayout() {
  const navigate = useNavigate();

  const navLinks = [
    { to: "/apprentice/dashboard", label: "Dashboard" },
    { to: "/apprentice/cases", label: "My Cases" },
    { to: "/apprentice/profile", label: "Profile" },
  ];

  const handleLogout = () => {
    clearAuth();
    localStorage.removeItem("email");
    localStorage.removeItem("user");
    if (window.axios) {
      delete window.axios.defaults.headers.common["Authorization"];
    }
    navigate("/login", { replace: true });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white">
      <TopNavbar
        brandTitle="LexiConnect"
        brandSubtitle="Apprentice Workspace"
        navLinks={navLinks}
        roleLabel="Apprentice"
        logoutAction={handleLogout}
      />
      <main className="mx-auto max-w-6xl px-6 py-8">
        <Outlet />
      </main>
    </div>
  );
}
