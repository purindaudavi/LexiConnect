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

// LIST booking docs (booking_id is required by backend)
export const getBookingDocuments = async (bookingId) => {
  const id = Number(bookingId);
  const url = `/api/bookings/${id}/documents`;

  const res = await api.get(url);
  return res;
};

export const listDocuments = (bookingId) => getBookingDocuments(bookingId);

// LIST case docs
export const listCaseDocuments = async (caseId) => {
  const id = Number(caseId);
  const res = await api.get(`/api/documents/by-case/${id}`);
  return res.data;
};

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

  // backend accepts file_name and title, but file_name is your standard
  fd.append("file_name", safeTitle);

  // optional: also send title (harmless, backend accepts both)
  fd.append("title", safeTitle);

  fd.append("file", file);

  return api.post("/api/documents", fd, {
    headers: { "Content-Type": "multipart/form-data" },
  });
};

// UPLOAD case doc
export const uploadCaseDocument = async ({ caseId, fileName, file }) => {
  const id = Number(caseId);

  if (!Number.isFinite(id) || id <= 0) {
    throw new Error("Invalid caseId for uploadCaseDocument()");
  }
  if (!file) {
    throw new Error("No file selected");
  }

  const safeTitle = (fileName || file?.name || "Untitled").trim();

  const fd = new FormData();
  fd.append("file_name", safeTitle);
  fd.append("title", safeTitle);
  fd.append("file", file);

  const res = await api.post(`/api/documents/by-case/${id}`, fd, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return res.data;
};

// DELETE
export const deleteDocument = (docId) => {
  const id = Number(docId);
  return api.delete(`/api/documents/${id}`);
};

// COMMENTS: LIST
export const listDocumentComments = (docId) => {
  const id = Number(docId);
  return api.get(`/api/documents/${id}/comments`);
};

// COMMENTS: CREATE (lawyer/admin only)
export const createDocumentComment = (docId, commentText) => {
  const id = Number(docId);
  return api.post(`/api/documents/${id}/comments`, {
    comment_text: (commentText || "").trim(),
  });
};
