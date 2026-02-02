import { Outlet } from "react-router-dom";
import TopNav from "../components/AppNavbar";
import useHasPrivilege from "../hooks/useHasPrivilege";

const AdminLayout = () => {
  const canAccessControl = useHasPrivilege("access_control.manage");
  const canViewAuditLog = useHasPrivilege("audit.view");
  const canApproveKyc = useHasPrivilege("kyc.approve");
  const canManageDisputes = useHasPrivilege("disputes.manage");

  const navItems = [
    { to: "/admin/dashboard", label: "Dashboard" },
    { to: "/admin/kyc-approval", label: "KYC Approval", enabled: canApproveKyc },
    { to: "/admin/disputes", label: "Disputes", enabled: canManageDisputes },
    { to: "/admin/audit-log", label: "Audit Log", enabled: canViewAuditLog },
    { to: "/admin/access-control", label: "Access Control", enabled: canAccessControl },
  ].filter((item) => item.enabled !== false);

  return (
    <>
      <TopNav links={navItems} brand="LexiConnect Admin Console" />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <Outlet />
      </main>
    </>
  );
};

export default AdminLayout;

