// frontend/src/features/documents/services/documents.service.js
import api from "../../../services/api";

/**
 * IMPORTANT:
 * Your .env keeps VITE_API_BASE_URL as ORIGIN (http://127.0.0.1:8000)
 * and you want to keep api.js unchanged.
 *
 * Therefore, EVERY backend API endpoint must be called with "/api/..."
 * because baseURL does NOT contain "/api".
 */

/* ------------------------------------------------------------------ */
/* Booking Documents (booking_id required by backend)                   */
/* ------------------------------------------------------------------ */

// LIST booking docs
export const getBookingDocuments = async (bookingId) => {
  const id = Number(bookingId);
  if (!Number.isFinite(id) || id <= 0) {
    throw new Error("Invalid bookingId for getBookingDocuments()");
  }
  return api.get(`/api/bookings/${id}/documents`);
};

// Backwards-compatible alias (some pages import this name)
export const listDocuments = (bookingId) => getBookingDocuments(bookingId);

// Another safe alias in case some file uses this name
export const listBookingDocuments = (bookingId) => getBookingDocuments(bookingId);

// UPLOAD booking doc
export const uploadDocument = ({ bookingId, fileName, file }) => {
  const id = Number(bookingId);

  if (!Number.isFinite(id) || id <= 0) {
    throw new Error("Invalid bookingId for uploadDocument()");
  }
  if (!file) {
    throw new Error("No file selected");
  }

  const safeTitle = (fileName || file?.name || "Untitled").trim();

  const fd = new FormData();
  fd.append("booking_id", String(id));

  // backend accepts file_name and title
  fd.append("file_name", safeTitle);
  fd.append("title", safeTitle);

  fd.append("file", file);

  return api.post("/api/documents", fd, {
    headers: { "Content-Type": "multipart/form-data" },
  });
};

/* ------------------------------------------------------------------ */
/* Case Documents                                                      */
/* ------------------------------------------------------------------ */

// LIST case docs
export const listCaseDocuments = (caseId) => {
  const id = Number(caseId);
  if (!Number.isFinite(id) || id <= 0) {
    throw new Error("Invalid caseId for listCaseDocuments()");
  }
  return api.get(`/api/documents/by-case/${id}`);
};

/**
 * UPLOAD case doc
 * NOTE: This assumes your backend supports uploading a document with "case_id"
 * on the same /api/documents endpoint (common pattern).
 * If your backend uses a different endpoint, tell me the backend route and I’ll adjust.
 */
export const uploadCaseDocument = ({ caseId, fileName, file }) => {
  const id = Number(caseId);

  if (!Number.isFinite(id) || id <= 0) {
    throw new Error("Invalid caseId for uploadCaseDocument()");
  }
  if (!file) {
    throw new Error("No file selected");
  }

  const safeTitle = (fileName || file?.name || "Untitled").trim();

  const fd = new FormData();
  fd.append("case_id", String(id));
  fd.append("file_name", safeTitle);
  fd.append("title", safeTitle);
  fd.append("file", file);

  return api.post("/api/documents", fd, {
    headers: { "Content-Type": "multipart/form-data" },
  });
};

// Alias (just in case any page uses a different name)
export const uploadDocumentForCase = uploadCaseDocument;

/* ------------------------------------------------------------------ */
/* Delete Document                                                     */
/* ------------------------------------------------------------------ */

export const deleteDocument = (docId) => {
  const id = Number(docId);
  if (!Number.isFinite(id) || id <= 0) {
    throw new Error("Invalid docId for deleteDocument()");
  }
  return api.delete(`/api/documents/${id}`);
};

/* ------------------------------------------------------------------ */
/* Comments                                                            */
/* ------------------------------------------------------------------ */

// COMMENTS: LIST
export const listDocumentComments = (docId) => {
  const id = Number(docId);
  if (!Number.isFinite(id) || id <= 0) {
    throw new Error("Invalid docId for listDocumentComments()");
  }
  return api.get(`/api/documents/${id}/comments`);
};

// COMMENTS: CREATE (lawyer/admin only)
export const createDocumentComment = (docId, commentText) => {
  const id = Number(docId);
  if (!Number.isFinite(id) || id <= 0) {
    throw new Error("Invalid docId for createDocumentComment()");
  }
  return api.post(`/api/documents/${id}/comments`, {
    comment_text: (commentText || "").trim(),
  });
};
