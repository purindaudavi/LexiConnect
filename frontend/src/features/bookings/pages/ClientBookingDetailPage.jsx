import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  getBookingById,
  getLawyerServicePackages,
} from "../../../services/bookings";
import { getBookingDocuments } from "../../documents/services/documents.service";
import { getIntakeByBooking, getIntakeByCase } from "../../intake/services/intake.service";
import api from "../../../services/api";

const tabs = ["Details", "Documents", "Intake", "Disputes", "Reviews"];

const statusStyles = {
  pending: "bg-yellow-900/30 text-yellow-200 border border-yellow-700/60",
  confirmed: "bg-green-900/30 text-green-200 border border-green-700/60",
  cancelled: "bg-red-900/30 text-red-200 border border-red-700/60",
  rejected: "bg-red-900/30 text-red-200 border border-red-700/60",
};

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

const formatDateTime = (value) => {
  if (!value) return "-";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
};

const Card = ({ children }) => (
  <div className="bg-slate-900/40 border border-slate-700/70 rounded-xl p-5">
    {children}
  </div>
);

export default function ClientBookingDetailPage() {
  const { bookingId } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // ---- tab state ----
  const [activeTab, setActiveTab] = useState("Details");

  // ---- booking ----
  const [booking, setBooking] = useState(null);
  const [bookingError, setBookingError] = useState("");
  const [bookingLoading, setBookingLoading] = useState(true);

  // ---- meta ----
  const [metaLoading, setMetaLoading] = useState(false);
  const [lawyerInfo, setLawyerInfo] = useState(null);
  const [branchInfo, setBranchInfo] = useState(null);
  const [serviceInfo, setServiceInfo] = useState(null);
  const [caseInfo, setCaseInfo] = useState(null);

  // ---- docs ----
  const [docs, setDocs] = useState([]);
  const [docError, setDocError] = useState("");
  const [docLoading, setDocLoading] = useState(true);

  // ---- intake ----
  const [intake, setIntake] = useState(null);
  const [intakeError, setIntakeError] = useState("");
  const [intakeLoading, setIntakeLoading] = useState(true);

  // =========================================================
  // 1) Read tab from URL: ?tab=Documents
  // =========================================================
  useEffect(() => {
    const t = searchParams.get("tab");
    if (!t) return;

    const desired = t.trim();
    if (tabs.includes(desired)) {
      setActiveTab(desired);
    }
  }, [searchParams]);

  const setTabAndUrl = (tab) => {
    setActiveTab(tab);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("tab", tab);
      return next;
    });
  };

  // =========================================================
  // 2) Load booking
  // =========================================================
  useEffect(() => {
    const loadBooking = async () => {
      setBookingError("");
      setBookingLoading(true);
      try {
        const data = await getBookingById(bookingId);
        setBooking(data);
      } catch (err) {
        const message =
          err?.response?.data?.detail ||
          err?.response?.data?.message ||
          "Failed to load booking.";
        setBookingError(message);
        setBooking(null);
      } finally {
        setBookingLoading(false);
      }
    };

    loadBooking();
  }, [bookingId]);

  // =========================================================
  // 3) Load meta/docs/intake after booking exists
  // =========================================================
  useEffect(() => {
    if (!booking?.id) return;

    const loadMeta = async () => {
      setMetaLoading(true);
      try {
        const [lawyerRes, caseRes, serviceList, branchesRes] = await Promise.all([
          booking.lawyer_id ? api.get(`/api/lawyers/${booking.lawyer_id}`) : Promise.resolve(null),
          booking.case_id ? api.get(`/api/cases/${booking.case_id}`) : Promise.resolve(null),
          booking.service_package_id ? getLawyerServicePackages(booking.lawyer_id) : Promise.resolve([]),
          booking.branch_id
            ? api.get(`/api/branches?lawyer_id=${booking.lawyer_id}`)
            : Promise.resolve(null),
        ]);

        const servicesList = serviceList || [];
        const branchesList = branchesRes?.data || [];

        setLawyerInfo(lawyerRes?.data || null);
        setCaseInfo(caseRes?.data || null);

        setServiceInfo(
          booking.service_package_id
            ? servicesList.find((svc) => svc.id === booking.service_package_id) || null
            : null
        );

        setBranchInfo(
          booking.branch_id
            ? branchesList.find((branch) => branch.id === booking.branch_id) || null
            : null
        );
      } catch {
        setLawyerInfo(null);
        setCaseInfo(null);
        setServiceInfo(null);
        setBranchInfo(null);
      } finally {
        setMetaLoading(false);
      }
    };

    const loadDocs = async () => {
      setDocError("");
      setDocLoading(true);
      try {
        // Docs are case-owned; the booking endpoint resolves case_id and returns the
        // shared case documents so all bookings in the case stay consistent.
        const res = await getBookingDocuments(booking.id); // safe use numeric id
        setDocs(res?.data || res || []);
      } catch (err) {
        setDocError(
          err?.response?.data?.detail ||
            err?.response?.data?.message ||
            "Failed to load documents."
        );
      } finally {
        setDocLoading(false);
      }
    };

    const loadIntake = async () => {
      setIntakeError("");
      setIntakeLoading(true);
      try {
        if (booking?.case_id) {
          try {
            const data = await getIntakeByCase(booking.case_id);
            setIntake(data || null);
            return;
          } catch {
            const res = await getIntakeByBooking(booking.id);
            setIntake(res?.data || null);
            return;
          }
        }

        const res = await getIntakeByBooking(booking.id);
        setIntake(res?.data || null);
      } catch (err) {
        if (err?.response?.status === 404) {
          setIntake(null);
        } else {
          setIntakeError(
            err?.response?.data?.detail ||
              err?.response?.data?.message ||
              "Failed to load intake status."
          );
        }
      } finally {
        setIntakeLoading(false);
      }
    };

    loadMeta();
    loadDocs();
    loadIntake();
  }, [booking?.id]);

  const statusClass = useMemo(() => {
    const key = (booking?.status || "").toLowerCase();
    return statusStyles[key] || "bg-slate-800 border border-slate-600 text-slate-100";
  }, [booking?.status]);

  // =========================================================
  // UI blocks
  // =========================================================
  const renderDetails = () => (
    <div className="space-y-4">
      <Card>
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <div className="text-sm text-slate-400">Booking ID</div>
            <div className="text-2xl font-semibold text-white">#{booking?.id}</div>
          </div>
          <span className={`px-4 py-1.5 rounded-full text-sm font-semibold ${statusClass}`}>
            {(booking?.status || "Unknown").toUpperCase()}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div className="bg-slate-950/40 border border-slate-700/60 rounded-lg p-3">
            <div className="text-slate-400 text-xs uppercase tracking-wide mb-1">Lawyer</div>
            <div className="text-white font-medium">{lawyerInfo?.full_name || "Lawyer"}</div>
            <div className="text-xs text-slate-400 mt-1">
              {[
                lawyerInfo?.specialization,
                [lawyerInfo?.city, lawyerInfo?.district].filter(Boolean).join(", "),
              ]
                .filter(Boolean)
                .join(" - ") || "Profile not available"}
            </div>
          </div>

          <div className="bg-slate-950/40 border border-slate-700/60 rounded-lg p-3">
            <div className="text-slate-400 text-xs uppercase tracking-wide mb-1">Branch</div>
            <div className="text-white font-medium">{branchInfo?.name || "Branch not assigned"}</div>
            <div className="text-xs text-slate-400 mt-1">{branchInfo?.city || "-"}</div>
          </div>

          <div className="bg-slate-950/40 border border-slate-700/60 rounded-lg p-3">
            <div className="text-slate-400 text-xs uppercase tracking-wide mb-1">Scheduled</div>
            <div className="text-white font-medium">{formatDateTime(booking?.scheduled_at)}</div>
          </div>

          <div className="bg-slate-950/40 border border-slate-700/60 rounded-lg p-3">
            <div className="text-slate-400 text-xs uppercase tracking-wide mb-1">Created</div>
            <div className="text-white font-medium">{formatDateTime(booking?.created_at)}</div>
          </div>

          <div className="bg-slate-950/40 border border-slate-700/60 rounded-lg p-3">
            <div className="text-slate-400 text-xs uppercase tracking-wide mb-1">Service</div>
            <div className="text-white font-medium">{serviceInfo?.name || "Service not available"}</div>
          </div>

          <div className="bg-slate-950/40 border border-slate-700/60 rounded-lg p-3">
            <div className="text-slate-400 text-xs uppercase tracking-wide mb-1">Case</div>
            <div className="text-white font-medium">{caseInfo?.title || "Case not available"}</div>
          </div>
        </div>

        {booking?.note && (
          <div className="mt-4 bg-slate-950/40 border border-slate-700/60 rounded-lg p-4">
            <div className="text-sm text-slate-400 mb-1">Client Note</div>
            <div className="text-white whitespace-pre-wrap">{booking.note}</div>
          </div>
        )}

        {metaLoading && (
          <div className="mt-4 text-sm text-slate-400">Loading booking details...</div>
        )}
      </Card>
    </div>
  );

  const renderDocuments = () => (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-lg font-semibold">Documents</div>
          <div className="text-slate-400 text-sm">
            Uploaded documents for this booking ({docs.length}).
          </div>
        </div>

        <Link
          to={`/client/bookings/${bookingId}/documents`}
          className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium"
        >
          Manage Documents
        </Link>
      </div>

      {docLoading && <div className="text-slate-400">Loading documents...</div>}

      {docError && (
        <div className="p-3 rounded-lg border border-red-700/60 bg-red-900/30 text-red-200 text-sm">
          {docError}
        </div>
      )}

        {!docLoading && !docError && docs.length === 0 && (
          <Card>
          <div className="text-white font-semibold mb-1">No documents yet</div>
          <div className="text-slate-400 text-sm mb-4">
            Upload PDFs, images, or related files for your lawyer to review.
          </div>
          <Link
            to={`/client/bookings/${bookingId}/documents/upload`}
            className="inline-flex px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium"
          >
            Upload Document
          </Link>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {docs.slice(0, 4).map((doc) => {
          const fallbackPath = `${API_BASE}${
            doc.file_path?.startsWith("/") ? "" : "/"
          }${doc.file_path || ""}`;
          const fileUrl = doc.file_url ? `${API_BASE}${doc.file_url}` : fallbackPath;
          const fileName = doc.file_path?.split("/").pop() || doc.original_name || doc.original_filename || "file";

          return (
            <div
              key={doc.id}
              className="bg-slate-900/40 border border-slate-700/70 rounded-xl p-4 flex items-center justify-between gap-4"
            >
              <div className="min-w-0">
                <div className="font-semibold text-white truncate">{doc.title || "Untitled"}</div>
                <div className="text-xs text-slate-400 truncate">{fileName} • #{doc.id}</div>
              </div>

              <a
                href={fileUrl}
                target="_blank"
                rel="noreferrer"
                className="shrink-0 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium"
              >
                Open
              </a>
            </div>
          );
        })}
      </div>

      {docs.length > 4 && (
        <div className="text-sm text-slate-400">
          Showing 4 recent documents. Use <span className="text-white">Manage Documents</span> to view all.
        </div>
      )}
    </div>
  );

  const renderIntake = () => (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-lg font-semibold">Intake Form</div>
          <div className="text-slate-400 text-sm">
            Provide details to help your lawyer prepare for the consultation.
          </div>
        </div>
        <Link
          to={`/client/bookings/${bookingId}/intake`}
          className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium"
        >
          {intake ? "View / Update Intake" : "Fill Intake Form"}
        </Link>
      </div>

      {intakeLoading && <div className="text-slate-400">Checking intake status...</div>}

      {intakeError && (
        <div className="p-3 rounded-lg border border-red-700/60 bg-red-900/30 text-red-200 text-sm">
          {intakeError}
        </div>
      )}

      {!intakeLoading && !intakeError && !intake && (
        <Card>
          <div className="text-white font-semibold mb-1">No intake submitted yet</div>
          <div className="text-slate-400 text-sm mb-4">
            Completing the intake helps your lawyer understand your case faster.
          </div>
          <Link
            to={`/client/bookings/${bookingId}/intake`}
            className="inline-flex px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium"
          >
            Fill Intake Form
          </Link>
        </Card>
      )}

      {!intakeLoading && intake && (
        <Card>
          <div className="flex items-center justify-between mb-4">
            <div className="text-sm text-slate-400">Submitted</div>
            <div className="text-sm text-slate-200">
              {formatDateTime(intake.created_at || intake.updated_at)}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm mb-4">
            <div>
              <div className="text-slate-400 text-xs uppercase mb-1">Case Type</div>
              <div className="text-white font-medium">{intake.case_type || "-"}</div>
            </div>
            <div>
              <div className="text-slate-400 text-xs uppercase mb-1">Urgency</div>
              <div className="text-white font-medium">{intake.urgency || "-"}</div>
            </div>
          </div>

          <div className="mb-3">
            <div className="text-slate-400 text-xs uppercase mb-1">Subject</div>
            <div className="text-white font-medium">{intake.subject || "-"}</div>
          </div>

          <div>
            <div className="text-slate-400 text-xs uppercase mb-1">Details</div>
            <div className="text-white whitespace-pre-wrap">{intake.details || "No details provided."}</div>
          </div>
        </Card>
      )}
    </div>
  );

  const renderDisputes = () => (
    <div className="space-y-4">
      <Card>
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-lg font-semibold mb-1">Disputes</div>
            <div className="text-slate-400 text-sm">
              Have an issue with this booking? Submit a dispute and we will review it.
            </div>
          </div>
          <Link
            to={`/disputes/submit?booking_id=${bookingId}`}
            className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-sm font-medium"
          >
            Submit Dispute
          </Link>
        </div>

        <div className="mt-4 text-sm">
          <Link to="/disputes/my" className="text-amber-300 hover:text-amber-200 underline">
            View my disputes
          </Link>
        </div>
      </Card>
    </div>
  );

  const renderReviews = () => (
    <Card>
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="text-lg font-semibold mb-1">Reviews</div>
          <div className="text-slate-400 text-sm">
            You will soon be able to rate and review your experience with the lawyer.
          </div>
        </div>
        <div className="text-sm text-slate-400">N/A</div>
      </div>

      <div className="mt-4 text-sm text-slate-400">
        This is intentionally minimal for now. Chapa will implement full reviews later.
      </div>
    </Card>
  );

  const renderTabContent = () => {
    switch (activeTab) {
      case "Documents":
        return renderDocuments();
      case "Intake":
        return renderIntake();
      case "Disputes":
        return renderDisputes();
      case "Reviews":
        return renderReviews();
      default:
        return renderDetails();
    }
  };

  // =========================================================
  // Loading / Error
  // =========================================================
  if (bookingLoading) {
    return <div className="text-slate-300">Loading booking...</div>;
  }

  if (bookingError || !booking) {
    return (
      <div className="bg-red-900/20 border border-red-700/50 text-red-200 p-5 rounded-xl max-w-xl">
        <div className="font-semibold mb-2">Could not load booking</div>
        <div className="text-sm mb-4">{bookingError || "Booking not found."}</div>
        <div className="flex gap-3">
          <button
            onClick={() => navigate(-1)}
            className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-sm"
          >
            Go Back
          </button>
          <Link
            to="/client/manage-bookings"
            className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-sm"
          >
            My Bookings
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header row */}
      <div className="bg-slate-900/40 border border-slate-700/70 rounded-2xl p-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="space-y-1">
          <div className="text-sm text-slate-400">Booking</div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold text-white">#{booking.id}</h1>
            <span className={`px-3 py-1 rounded-full text-xs font-semibold ${statusClass}`}>
              {(booking?.status || "Unknown").toUpperCase()}
            </span>
          </div>
          <div className="text-slate-400 text-sm">
            Scheduled: <span className="text-slate-200">{formatDateTime(booking?.scheduled_at)}</span>
          </div>
        </div>

        <div className="flex gap-2 flex-wrap">
          <Link
            to="/client/manage-bookings"
            className="px-4 py-2 rounded-lg border border-slate-600 bg-slate-800 hover:bg-slate-700 text-sm text-white"
          >
            Back to My Bookings
          </Link>

          <button
            onClick={() => navigate(`/client/bookings/${bookingId}/documents`)}
            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium"
          >
            Open Documents
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2">
        {tabs.map((tab) => {
          const active = activeTab === tab;
          return (
            <button
              key={tab}
              onClick={() => setTabAndUrl(tab)}
              className={`px-4 py-2 rounded-full text-sm font-semibold border transition-colors ${
                active
                  ? "bg-amber-600/20 border-amber-500 text-white"
                  : "bg-slate-900/30 border-slate-700 text-slate-300 hover:text-white hover:border-slate-500"
              }`}
            >
              {tab}
              {tab === "Documents" && !docLoading && (
                <span className="ml-2 text-xs text-slate-400">({docs.length})</span>
              )}
              {tab === "Intake" && !intakeLoading && (
                <span className="ml-2 text-xs text-slate-400">
                  ({intake ? "Submitted" : "Pending"})
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Content */}
      {renderTabContent()}
    </div>
  );
}
