import React, { useMemo, useState } from "react";
import { useLocation, useParams, useNavigate, Link } from "react-router-dom";
import { uploadDocument } from "../services/documents.service";

export default function DocumentUpload() {
  const { bookingId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  const basePath = location.pathname.startsWith("/lawyer") ? "/lawyer" : "/client";

  const bookingIdNum = useMemo(() => Number(bookingId), [bookingId]);
  const hasValidBookingId = Number.isFinite(bookingIdNum) && bookingIdNum > 0;

  const [fileName, setFileName] = useState("");
  const [file, setFile] = useState(null);

  const [err, setErr] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  const canUpload = hasValidBookingId && file && fileName.trim().length > 0 && !loading;

  const onFilePick = (picked) => {
    setFile(picked);
    // auto-fill file name if empty
    if (!fileName.trim() && picked?.name) {
      const base = picked.name.replace(/\.[^/.]+$/, ""); // remove extension
      setFileName(base);
    }
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setErr("");
    setSuccess("");

    if (!hasValidBookingId) return setErr("Invalid booking id in URL.");
    if (!file) return setErr("Please choose a file.");
    if (!fileName.trim()) return setErr("File name is required.");

    try {
      setLoading(true);
      await uploadDocument({
        bookingId: bookingIdNum,
        fileName: fileName.trim(),
        file,
      });

      setSuccess("Uploaded successfully.");
      // go back to list
      navigate(`${basePath}/bookings/${bookingIdNum}/documents`);
    } catch (e2) {
      const status = e2?.response?.status;

      if (status === 401) setErr("Unauthorized. Please login again.");
      else if (status === 403) setErr("Not allowed to upload for this booking.");
      else setErr(e2?.response?.data?.detail || "Upload failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto p-6 text-white">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <div className="text-xs tracking-widest text-amber-300">DOCUMENTS</div>
          <h1 className="text-3xl font-bold">Upload Document</h1>
          <p className="text-slate-400 mt-1">
            Booking{" "}
            <span className="text-white font-semibold">
              {hasValidBookingId ? bookingIdNum : bookingId || "N/A"}
            </span>
          </p>
        </div>

        <div className="flex gap-2">
          <Link
            to={`${basePath}/bookings/${bookingIdNum}/documents`}
            className="px-4 py-2 rounded-lg bg-slate-900/40 border border-slate-700 hover:bg-slate-800 text-sm"
          >
            View documents
          </Link>
          <Link
            to={`${basePath}/bookings/${bookingIdNum}`}
            className="px-4 py-2 rounded-lg bg-slate-900/40 border border-slate-700 hover:bg-slate-800 text-sm"
          >
            Back to booking
          </Link>
        </div>
      </div>

      {!hasValidBookingId && (
        <div className="mb-4 rounded-lg border border-amber-700/60 bg-amber-900/30 p-3 text-amber-200">
          Invalid booking id in URL. Open this page from a booking details page.
        </div>
      )}

      {err && (
        <div className="mb-4 rounded-lg border border-red-700/60 bg-red-900/30 p-3 text-red-200">
          {err}
        </div>
      )}

      {success && (
        <div className="mb-4 rounded-lg border border-emerald-700/60 bg-emerald-900/30 p-3 text-emerald-200">
          {success}
        </div>
      )}

      <form
        onSubmit={onSubmit}
        className="rounded-xl border border-slate-700 bg-slate-900/40 p-5 space-y-4"
      >
        <div>
          <label className="block text-sm text-slate-300 mb-1">File name</label>
          <input
            className="w-full px-3 py-2 rounded bg-slate-800 border border-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-600/50"
            value={fileName}
            onChange={(e) => setFileName(e.target.value)}
            placeholder="e.g., NIC Scan / Agreement / Evidence"
            disabled={loading}
          />
          <div className="text-xs text-slate-400 mt-1">
            Tip: keep names short (e.g., "Session Notes - 2026-01-22").
          </div>
        </div>

        <div>
          <label className="block text-sm text-slate-300 mb-1">File</label>
          <input
            type="file"
            className="w-full"
            onChange={(e) => onFilePick(e.target.files?.[0] || null)}
            disabled={loading}
          />
          {file && (
            <div className="text-xs text-slate-400 mt-2">
              Selected: <span className="text-white">{file.name}</span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 pt-2">
          <Link
            to={`${basePath}/bookings/${bookingIdNum}/documents`}
            className="px-4 py-2 rounded-lg bg-slate-800 border border-slate-700 hover:bg-slate-700 text-sm"
          >
            Cancel
          </Link>

          <button
            type="submit"
            disabled={!canUpload}
            className={`px-5 py-2 rounded-lg font-semibold ${
              canUpload
                ? "bg-blue-600 hover:bg-blue-700"
                : "bg-slate-700 opacity-60 cursor-not-allowed"
            }`}
          >
            {loading ? "Uploading..." : "Upload"}
          </button>
        </div>
      </form>
    </div>
  );
}
