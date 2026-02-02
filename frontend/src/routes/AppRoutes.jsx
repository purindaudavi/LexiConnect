import { Routes, Route, Navigate } from "react-router-dom";

import Login from "../pages/Login";
import Register from "../pages/Register";
import LandingPage from "../pages/LandingPage";
import NotAuthorized from "../pages/NotAuthorized";

import ProtectedRoute from "../components/ProtectedRoute";
import AuthLayout from "../layouts/AuthLayout";
import ClientLayout from "../layouts/ClientLayout";
import LawyerLayout from "../layouts/LawyerLayout";
import AdminLayout from "../layouts/AdminLayout";

import { getRole } from "../services/auth";

// Client pages (real)
import Dashboard from "../pages/Dashboard";
import SearchLawyers from "../pages/SearchLawyers";

// Booking pages
import Booking from "../pages/Booking";
import ManageBookings from "../pages/ManageBookings";

// Feature pages
import DocumentsList from "../features/documents/pages/DocumentsList";
import DocumentUpload from "../features/documents/pages/DocumentUpload";
import ClientBookingDetailPage from "../features/bookings/pages/ClientBookingDetailPage";
import ClientIntakeSubmitPage from "../features/intake/pages/ClientIntakeSubmitPage";

// Disputes (client)
import SubmitDisputePage from "../features/disputes/SubmitDisputePage";
import ClientMyDisputesPage from "../features/disputes/ClientMyDisputesPage";
import DisputeDetailPage from "../features/disputes/DisputeDetailPage";

// Admin disputes
import AdminDisputesListPage from "../features/disputes/AdminDisputesListPage";
import AdminDisputeDetailPage from "../features/disputes/AdminDisputeDetailPage";

// Lawyer pages
import AvailabilityEditor from "../pages/AvailabilityEditor";
import TokenQueue from "../pages/TokenQueue";
import BranchManagement from "../pages/BranchManagement";
import ServicePackages from "../pages/ServicePackages";
import ChecklistTemplates from "../pages/ChecklistTemplates";
import { LawyerKYC } from "../features/lawyer_kyc";
import LawyerIncomingBookingsPage from "../features/bookings/LawyerIncomingBookingsPage";
import LawyerBookingDetailPage from "../features/bookings/pages/LawyerBookingDetailPage";
import LawyerDocumentsView from "../features/documents/pages/LawyerDocumentsView";
import LawyerIntakeViewPage from "../features/intake/pages/LawyerIntakeViewPage";
import LawyerPublicProfile from "../pages/LawyerPublicProfile";
import LawyerMyRequestsPage from "../features/cases/pages/LawyerMyRequestsPage";
import LawyerEditProfilePage from "../features/lawyer_profile/pages/LawyerEditProfilePage";
import LawyerPublicProfilePage from "../features/lawyer_profile/pages/LawyerPublicProfilePage";
import LawyerSettingsPage from "../features/lawyer_profile/pages/LawyerSettingsPage";
import LawyerDashboard from "../pages/LawyerDashboard";

// OK Cases
import ClientCasesPage from "../features/cases/pages/ClientCasesPage";
import LawyerCaseFeedPage from "../features/cases/pages/LawyerCaseFeedPage";
import ClientCaseChecklistPage from "../features/checklist/pages/ClientCaseChecklistPage";
import LawyerCaseDetailPage from "../features/cases/pages/LawyerCaseDetailPage";
import ClientCaseDetailPage from "../features/cases/pages/ClientCaseDetailPage";
import ClientLawyerProfilePage from "../features/lawyers/pages/ClientLawyerProfilePage";

// OK Apprenticeship pages
import ApprenticeDashboard from "../features/apprenticeship/pages/ApprenticeDashboard";
import ApprenticeCaseView from "../features/apprenticeship/pages/ApprenticeCaseView";
import LawyerApprenticesPage from "../features/apprenticeship/pages/LawyerApprenticesPage";
import ApprenticeLayout from "../layouts/ApprenticeLayout";
import ApprenticeCases from "../features/apprenticeship/pages/ApprenticeCases";
import ApprenticeProfile from "../features/apprenticeship/pages/ApprenticeProfile";
import ApprenticeAssignedCases from "../features/apprenticeship/pages/ApprenticeAssignedCases";
import LawyerApprenticeshipNotes from
  "../features/apprenticeship/pages/LawyerApprenticeshipNotes";

// Admin pages (real)
import AdminDashboard from "../pages/admin/AdminDashboard";
import KYCApproval from "../pages/admin/KYCApproval";
import AuditLog from "../pages/admin/AuditLog";
import AccessControl from "../pages/admin/AccessControl";

const DashboardRedirect = () => {
  const role = (getRole() || localStorage.getItem("role") || "").toLowerCase();

  if (role === "client") return <Navigate to="/client/dashboard" replace />;
  if (role === "lawyer") return <Navigate to="/lawyer/dashboard" replace />;
  if (role === "admin") return <Navigate to="/admin/dashboard" replace />;
  if (role === "apprentice") return <Navigate to="/apprentice/dashboard" replace />;

  return <Navigate to="/login" replace />;
};

const RequireAuth = ({ children }) => {
  const token = localStorage.getItem("access_token");
  return token ? children : <Navigate to="/login" replace />;
};

// OK Minimal Lawyer dashboard (with Case Feed link)
const LawyerDashboardHome = () => {
  return (
    <div className="space-y-4">
      <div className="bg-slate-900 text-white border border-slate-700 rounded-lg p-6">
        <h1 className="text-2xl font-bold">Lawyer Dashboard</h1>
        <p className="text-slate-300 mt-1">
          Minimal dashboard for demo. Chapa/Vithana can improve later.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <a
          href="/lawyer/bookings/incoming"
          className="block bg-slate-800 border border-slate-700 rounded-lg p-5 hover:bg-slate-700"
        >
          <div className="text-lg font-semibold text-white">Incoming Bookings</div>
          <div className="text-slate-300 text-sm mt-1">Confirm or reject requests</div>
        </a>

        <a
          href="/lawyer/cases/feed"
          className="block bg-slate-800 border border-slate-700 rounded-lg p-5 hover:bg-slate-700"
        >
          <div className="text-lg font-semibold text-white">Case Feed</div>
          <div className="text-slate-300 text-sm mt-1">Browse open cases & request access</div>
        </a>

        <a
          href="/lawyer/availability"
          className="block bg-slate-800 border border-slate-700 rounded-lg p-5 hover:bg-slate-700"
        >
          <div className="text-lg font-semibold text-white">Availability</div>
          <div className="text-slate-300 text-sm mt-1">Manage time slots</div>
        </a>

        <a
          href="/lawyer/token-queue"
          className="block bg-slate-800 border border-slate-700 rounded-lg p-5 hover:bg-slate-700"
        >
          <div className="text-lg font-semibold text-white">Token Queue</div>
          <div className="text-slate-300 text-sm mt-1">Today's consultation queue</div>
        </a>

        <a
          href="/lawyer/kyc"
          className="block bg-slate-800 border border-slate-700 rounded-lg p-5 hover:bg-slate-700"
        >
          <div className="text-lg font-semibold text-white">KYC</div>
          <div className="text-slate-300 text-sm mt-1">Submit or view status</div>
        </a>

        {/* Optional: Lawyer Apprenticeship page */}
        <a
          href="/lawyer/apprenticeship"
          className="block bg-slate-800 border border-slate-700 rounded-lg p-5 hover:bg-slate-700"
        >
          <div className="text-lg font-semibold text-white">Apprenticeship</div>
          <div className="text-slate-300 text-sm mt-1">Assign apprentices & view notes</div>
        </a>
      </div>
    </div>
  );
};

const AppRoutes = () => {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />

      {/* Dashboard redirect */}
      <Route path="/dashboard" element={<DashboardRedirect />} />

      {/* Auth */}
      <Route element={<AuthLayout />}>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
      </Route>

      {/* Client area */}
      <Route
        element={
          <RequireAuth>
            <ProtectedRoute allowedRoles={["client"]}>
              <ClientLayout />
            </ProtectedRoute>
          </RequireAuth>
        }
      >
        <Route path="/client/dashboard" element={<Dashboard />} />
        <Route path="/client/search" element={<SearchLawyers />} />
        <Route path="/client/profile/:id" element={<LawyerPublicProfile />} />
        <Route path="/client/lawyers/:lawyerId" element={<ClientLawyerProfilePage />} />

        {/* Cases */}
        <Route path="/client/cases" element={<ClientCasesPage />} />
        <Route path="/client/cases/:caseId" element={<ClientCaseDetailPage />} />
        <Route path="/client/cases/:caseId/checklist" element={<ClientCaseChecklistPage />} />

        {/* Booking */}
        <Route path="/client/booking" element={<Booking />} />
        <Route path="/client/booking/:lawyerId" element={<Booking />} />

        <Route path="/client/manage-bookings" element={<ManageBookings />} />
        <Route path="/client/my-bookings" element={<Navigate to="/client/manage-bookings" replace />} />

        {/* Booking hub */}
        <Route path="/client/bookings/:bookingId" element={<ClientBookingDetailPage />} />
        <Route path="/client/bookings/:bookingId/intake" element={<ClientIntakeSubmitPage />} />

        {/* Docs */}
        <Route path="/client/bookings/:bookingId/documents" element={<DocumentsList />} />
        <Route path="/client/bookings/:bookingId/documents/upload" element={<DocumentUpload />} />

        {/* Disputes */}
        <Route path="/disputes/submit" element={<SubmitDisputePage />} />
        <Route path="/disputes/my" element={<ClientMyDisputesPage />} />
        <Route path="/disputes/:id" element={<DisputeDetailPage />} />
      </Route>

      {/* Lawyer area */}
      <Route
        element={
          <RequireAuth>
            <ProtectedRoute allowedRoles={["lawyer"]}>
              <LawyerLayout />
            </ProtectedRoute>
          </RequireAuth>
        }
      >
        <Route path="/lawyer/dashboard" element={<LawyerDashboard />} />
        <Route path="/lawyer/availability" element={<AvailabilityEditor />} />
        <Route path="/lawyer/token-queue" element={<TokenQueue />} />
        <Route path="/lawyer/branches" element={<BranchManagement />} />
        <Route path="/lawyer/services" element={<ServicePackages />} />
        <Route path="/lawyer/checklist" element={<ChecklistTemplates />} />
        <Route path="/lawyer/kyc" element={<LawyerKYC />} />
        <Route path="/lawyer/bookings/incoming" element={<LawyerIncomingBookingsPage />} />
        <Route path="/lawyer/bookings/:bookingId" element={<LawyerBookingDetailPage />} />
        <Route path="/lawyer/bookings/:bookingId/documents" element={<LawyerDocumentsView />} />
        <Route path="/lawyer/bookings/:bookingId/documents/upload" element={<DocumentUpload />} />
        <Route path="/lawyer/bookings/:bookingId/intake" element={<LawyerIntakeViewPage />} />

        <Route path="/lawyer/apprenticeship/notes" element={<LawyerApprenticeshipNotes />} />


        <Route path="/lawyer/cases/feed" element={<LawyerCaseFeedPage />} />
        <Route path="/lawyer/cases/requests" element={<LawyerMyRequestsPage />} />
        <Route path="/lawyer/cases/:caseId" element={<LawyerCaseDetailPage />} />
        <Route path="/lawyer/profile/edit" element={<LawyerEditProfilePage />} />
        <Route path="/lawyer/public-profile" element={<LawyerPublicProfilePage />} />
        <Route path="/lawyer/settings" element={<LawyerSettingsPage />} />

        {/* Optional: Apprenticeship page for lawyers */}
        <Route path="/lawyer/apprenticeship" element={<LawyerApprenticesPage />} />
      </Route>

      {/* Apprentice area */}
      <Route
        element={
          <RequireAuth>
            <ProtectedRoute allowedRoles={["apprentice"]} redirectTo="/dashboard">
              <ApprenticeLayout />
            </ProtectedRoute>
          </RequireAuth>
        }
      >
        <Route path="/apprentice" element={<Navigate to="/apprentice/dashboard" replace />} />
        <Route path="/apprentice/dashboard" element={<ApprenticeDashboard />} />  
        <Route path="/apprentice/cases" element={<ApprenticeAssignedCases />} />
        <Route path="/apprentice/cases/:caseId" element={<ApprenticeCaseView />} />
        <Route path="/apprentice/profile" element={<ApprenticeProfile />} />
      </Route>

      {/* Admin area */} 
      <Route
        element={
          <ProtectedRoute allowedRoles={["admin"]}>
            <AdminLayout />
          </ProtectedRoute>
        }
      >
        <Route path="/admin/dashboard" element={<AdminDashboard />} />
        <Route path="/admin/kyc-approval" element={<KYCApproval />} />
        <Route path="/admin/audit-log" element={<AuditLog />} />
        <Route path="/admin/access-control" element={<AccessControl />} />

        <Route path="/admin/disputes" element={<AdminDisputesListPage />} />
        <Route path="/admin/disputes/:id" element={<AdminDisputeDetailPage />} />
      </Route>

      {/* Legacy redirects */}
      <Route path="/booking/:lawyerId" element={<Navigate to="/client/booking/:lawyerId" replace />} />
      <Route path="/booking" element={<Navigate to="/client/booking" replace />} />
      <Route path="/manage-bookings" element={<Navigate to="/client/manage-bookings" replace />} />
      <Route path="/my-bookings" element={<Navigate to="/client/manage-bookings" replace />} />
      <Route path="/search" element={<Navigate to="/client/search" replace />} />
      <Route path="/profile/:id" element={<Navigate to="/client/profile/:id" replace />} />
      <Route path="/admin" element={<Navigate to="/admin/dashboard" replace />} />

      <Route path="/not-authorized" element={<NotAuthorized />} />

      {/* Fallback */}
      <Route path="*" element={<div>404 - Page not found</div>} />
    </Routes>
  );
};

export default AppRoutes;
