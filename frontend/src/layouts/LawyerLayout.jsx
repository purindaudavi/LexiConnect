// src/layouts/LawyerLayout.jsx
import { Outlet, useNavigate } from "react-router-dom";
import { logout as clearAuth } from "../services/auth";
import TopNavbar from "../components/TopNavbar";

const LawyerLayout = () => {
  const navigate = useNavigate();

  const navLinks = [
    { to: "/lawyer/dashboard", label: "Dashboard" },
    { to: "/lawyer/availability", label: "Availability" },
    { to: "/lawyer/token-queue", label: "Token Queue" },
    { to: "/lawyer/bookings/incoming", label: "Incoming Bookings" },
    { to: "/lawyer/cases/requests", label: "My Requests" },
    { to: "/lawyer/branches", label: "Branches" },
    { to: "/lawyer/services", label: "Services" },
    { to: "/lawyer/checklist", label: "Checklist" },
    { to: "/lawyer/kyc", label: "KYC Status" },
  ];

  const user = {
    name: localStorage.getItem("email") || "Lawyer",
    avatar: localStorage.getItem("avatar") || "",
  };

  const handleLogout = () => {
    clearAuth();
    localStorage.removeItem("email");
    localStorage.removeItem("user");

    if (window.axios) {
      delete window.axios.defaults.headers.common["Authorization"];
    }

    navigate("/", { replace: true });
  };

  return (
    <div className="min-h-screen text-white bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      <TopNavbar
        brandTitle="LexiConnect"
        brandSubtitle="Lawyer Dashboard"
        navLinks={navLinks}
        roleLabel="Lawyer"
        user={user}
        logoutAction={handleLogout}
      />

      <main className="min-h-[calc(100vh-76px)] mx-auto w-full max-w-6xl px-6 py-8">
        <Outlet />
      </main>
    </div>
  );
};

export default LawyerLayout;
