import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import PageShell from "../../../components/ui/PageShell";
import StatusPill from "../../../components/ui/StatusPill";
import EmptyState from "../../../components/ui/EmptyState";
import { getBookingById } from "../../../services/bookings";
import api from "../../../services/api";
import { getIntakeByBooking, getIntakeByCase } from "../../intake/services/intake.service";
import { getBookingChecklist } from "../services/bookingChecklist.service";
import { createDocumentComment, uploadDocument } from "../../documents/services/documents.service";

const formatDateTime = (value) => {
  if (!value) return "-";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
};

export default function LawyerBookingDetailPage() {
  const { bookingId } = useParams();
  const [booking, setBooking] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [docs, setDocs] = useState([]);
  const [intake, setIntake] = useState(null);
  const [docError, setDocError] = useState("");
  const [intakeError, setIntakeError] = useState("");
  const [checklist, setChecklist] = useState(null);
  const [checklistError, setChecklistError] = useState("");
  const [checklistLoading, setChecklistLoading] = useState(false);
  const [showWrapUp, setShowWrapUp] = useState(false);
  const [wrapUpFile, setWrapUpFile] = useState(null);
  const [wrapUpFileName, setWrapUpFileName] = useState("");
  const [wrapUpComment, setWrapUpComment] = useState("");
  const [wrapUpSaving, setWrapUpSaving] = useState(false);
  const [wrapUpError, setWrapUpError] = useState("");
  const [wrapUpSuccess, setWrapUpSuccess] = useState("");

  const fetchDocs = async (bookingData) => {
    if (!bookingData) return;
    try {
      if (bookingData?.case_id) {
        const { data: caseDocs } = await api.get(`/api/documents/by-case/${bookingData.case_id}`);
        setDocs(caseDocs || []);
      } else {
        const { data: bookingDocs } = await api.get(`/api/documents`, { params: { booking_id: bookingId } });
        setDocs(bookingDocs || []);
      }
    } catch (e) {
      setDocError(e?.response?.data?.detail || "Failed to load documents");
    }
  };

  useEffect(() => {
    setBooking(null);
    setDocs([]);
    setDocError("");
    setIntake(null);
    setIntakeError("");

    const loadBooking = async () => {
      setLoading(true);
      setError("");
      try {
        const data = await getBookingById(bookingId);
        setBooking(data);
      } catch (err) {
        const message =
          err?.response?.data?.detail ||
          err?.response?.data?.message ||
          "Could not load booking.";
        setError(message);
      } finally {
        setLoading(false);
      }
    };

    loadBooking();
  }, [bookingId]);

  useEffect(() => {
    if (!booking) return;

    const loadIntake = async () => {
      try {
        if (booking?.case_id) {
          const intakeData = await getIntakeByCase(booking.case_id);
          setIntake(intakeData || null);
        } else {
          const { data: intakeData } = await getIntakeByBooking(bookingId);
          setIntake(intakeData || null);
        }
      } catch (e) {
        setIntake(null);
        if (e?.response?.status === 404) {
          setIntake(null);
        } else {
          setIntakeError(e?.response?.data?.detail || "Failed to load intake");
        }
      }
    };

    const loadChecklist = async () => {
      setChecklistLoading(true);
      setChecklistError("");
      try {
        const data = await getBookingChecklist(bookingId);
        setChecklist(data || null);
      } catch (e) {
        if (e?.response?.status === 404) {
          setChecklist(null);
        } else {
          setChecklistError(e?.response?.data?.detail || "Failed to load checklist");
        }
      } finally {
        setChecklistLoading(false);
      }
    };

    fetchDocs(booking);
    loadIntake();
    loadChecklist();
  }, [bookingId, booking?.id, booking?.case_id, booking]);

  useEffect(() => {
    if (booking?.status?.toLowerCase() === "completed") {
      setShowWrapUp(true);
    }
  }, [booking?.status]);

  const statusClass = useMemo(() => booking?.status, [booking]);

  const handleWrapUpSubmit = async (e) => {
    e.preventDefault();
    setWrapUpError("");
    setWrapUpSuccess("");

    if (!wrapUpFile) {
      setWrapUpError("Please attach session notes.");
      return;
    }

    try {
      setWrapUpSaving(true);
      const res = await uploadDocument({
        bookingId,
        fileName: wrapUpFileName || wrapUpFile?.name,
        file: wrapUpFile,
      });
      const createdDoc = res?.data;
      const commentText = wrapUpComment.trim();
      if (commentText && createdDoc?.id) {
        await createDocumentComment(createdDoc.id, commentText);
      }
      setWrapUpSuccess("Session wrap-up saved.");
      setWrapUpFile(null);
      setWrapUpFileName("");
      setWrapUpComment("");
      fetchDocs(booking);
    } catch (e2) {
      setWrapUpError(e2?.response?.data?.detail || "Failed to save wrap-up.");
    } finally {
      setWrapUpSaving(false);
    }
  };

  if (loading) {
    return (
      <PageShell title="Booking Details" subtitle="Loading booking...">
        <div className="text-slate-300">Loading...</div>
      </PageShell>
    );
  }

  if (error || !booking) {
    return (
      <PageShell title="Booking Details">
        <EmptyState
          title="Could not load booking"
          description={error || "Booking not found."}
          buttonLabel="Back to incoming"
          buttonLink="/lawyer/bookings/incoming"
        />
      </PageShell>
    );
  }

  return (
    <PageShell
      title={`Booking #${booking.id}`}
      subtitle="Review request details"
      maxWidth="max-w-4xl"
      contentClassName="space-y-6"
    >
      <div className="bg-slate-800 border border-slate-700 rounded-lg p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm text-slate-400">Status</div>
            <div className="mt-1">
              <StatusPill status={statusClass} />
            </div>
          </div>
          <div className="text-right text-sm text-slate-400">
            Created: <span className="text-white">{formatDateTime(booking.created_at)}</span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <div className="space-y-1">
            <div className="text-slate-400 text-xs uppercase tracking-wide">Scheduled</div>
            <div className="text-white font-medium">{formatDateTime(booking.scheduled_at)}</div>
          </div>
          <div className="space-y-1">
            <div className="text-slate-400 text-xs uppercase tracking-wide">Client ID</div>
            <div className="text-white font-medium">{booking.client_id ?? "-"}</div>
          </div>
        </div>

        {booking.note && (
          <div className="bg-slate-900/60 border border-slate-700 rounded-lg p-4">
            <div className="text-sm text-slate-400 mb-1">Client Note</div>
            <div className="text-white text-sm whitespace-pre-wrap">{booking.note}</div>
          </div>
        )}
      </div>

      <div className="bg-slate-800 border border-slate-700 rounded-lg p-5 space-y-2">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-lg font-semibold text-white">Documents</div>
            <div className="text-sm text-slate-400">
              View uploaded documents (read-only). {docError && <span className="text-red-400">{docError}</span>}
            </div>
          </div>
          <Link
            to={`/lawyer/bookings/${booking.id}/documents`}
            className="px-3 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-sm font-medium text-white transition-colors"
          >
            Open Documents
          </Link>
        </div>
        <div className="text-xs text-slate-400">Items: {docs.length}</div>
      </div>

      <div className="bg-slate-800 border border-slate-700 rounded-lg p-5 space-y-2">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-lg font-semibold text-white">Intake</div>
            <div className="text-sm text-slate-400">
              Review intake details (view only). {intakeError && <span className="text-red-400">{intakeError}</span>}
            </div>
          </div>
          <Link
            to={`/lawyer/bookings/${booking.id}/intake`}
            className="px-3 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-sm font-medium text-white transition-colors"
          >
            View Intake
          </Link>
        </div>
        <div className="text-xs text-slate-400">
          Status: {intake ? "Submitted" : intakeError ? "Error" : "Not submitted"}
        </div>
      </div>

      <div className="bg-slate-800 border border-slate-700 rounded-lg p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-lg font-semibold text-white">Checklist</div>
            <div className="text-sm text-slate-400">
              Review required items for this booking.{" "}
              {checklistError && <span className="text-red-400">{checklistError}</span>}
            </div>
          </div>
        </div>

        {checklistLoading && <div className="text-slate-300 text-sm">Loading checklist...</div>}

        {!checklistLoading && checklist && checklist.missing_required?.length > 0 && (
          <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg text-amber-100 text-sm">
            <div className="font-semibold">Some required items are missing.</div>
            <ul className="list-disc list-inside mt-1 space-y-1">
              {checklist.missing_required.map((m) => (
                <li key={m.template_id}>{m.question || `Template #${m.template_id}`}</li>
              ))}
            </ul>
          </div>
        )}

        {!checklistLoading && checklist && (
          <>
            <div className="text-sm text-slate-200">
              Required: <b>{checklist.completed_required}</b> / <b>{checklist.total_required}</b> completed
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full text-sm text-slate-200">
                <thead>
                  <tr className="text-left text-slate-400 border-b border-slate-700">
                    <th className="py-2 pr-4">Question</th>
                    <th className="py-2 pr-4">Answer</th>
                    <th className="py-2">Document</th>
                  </tr>
                </thead>
                <tbody>
                  {(checklist.items || []).map((item) => (
                    <tr key={item.template_id} className="border-b border-slate-800">
                      <td className="py-2 pr-4 text-white">{item.question || `Template #${item.template_id}`}</td>
                      <td className="py-2 pr-4 text-slate-200">
                        {(item.answer_text || "").trim() ? item.answer_text : "Not provided"}
                      </td>
                      <td className="py-2 text-slate-300">{item.document_id ?? "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {showWrapUp && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg p-6 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-lg font-semibold text-white">Session Wrap-up</div>
                <div className="text-sm text-slate-400">
                  Upload session notes and add a summary for the client.
                </div>
              </div>
              <button
                onClick={() => setShowWrapUp(false)}
                className="text-slate-400 hover:text-white text-sm"
              >
                Close
              </button>
            </div>

            {wrapUpError && (
              <div className="text-sm text-red-200 bg-red-900/40 border border-red-700 rounded p-2">
                {wrapUpError}
              </div>
            )}
            {wrapUpSuccess && (
              <div className="text-sm text-emerald-200 bg-emerald-900/40 border border-emerald-700 rounded p-2">
                {wrapUpSuccess}
              </div>
            )}

            <form onSubmit={handleWrapUpSubmit} className="space-y-3">
              <div>
                <label className="text-sm text-slate-300">Document title</label>
                <input
                  value={wrapUpFileName}
                  onChange={(e) => setWrapUpFileName(e.target.value)}
                  placeholder="Session notes - summary"
                  className="mt-1 w-full rounded-lg bg-slate-950/70 border border-slate-700 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-sm text-slate-300">Upload notes</label>
                <input
                  type="file"
                  onChange={(e) => setWrapUpFile(e.target.files?.[0] || null)}
                  className="mt-1 w-full text-sm text-slate-300"
                />
              </div>
              <div>
                <label className="text-sm text-slate-300">Comment for client</label>
                <textarea
                  value={wrapUpComment}
                  onChange={(e) => setWrapUpComment(e.target.value)}
                  rows={3}
                  placeholder="Key takeaways, next steps, and follow-ups..."
                  className="mt-1 w-full rounded-lg bg-slate-950/70 border border-slate-700 px-3 py-2 text-sm"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowWrapUp(false)}
                  className="px-4 py-2 rounded-lg border border-slate-600 text-slate-200 text-sm"
                >
                  Later
                </button>
                <button
                  type="submit"
                  disabled={wrapUpSaving}
                  className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-slate-950 text-sm font-semibold disabled:opacity-60"
                >
                  {wrapUpSaving ? "Saving..." : "Save Wrap-up"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </PageShell>
  );
}
