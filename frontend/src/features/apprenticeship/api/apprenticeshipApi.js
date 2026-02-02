import api from "../../../services/api";




export const fetchCaseDocuments = async (caseId) => {
  const res = await api.get(`/api/documents/by-case/${caseId}`);
  return res.data;
};


// ✅ Users
export const fetchMe = async () => {
  const res = await api.get("/api/users/me");
  return res.data;
};

export const fetchUserById = async (userId) => {
  const res = await api.get(`/api/users/${userId}`);
  return res.data;
};

// ✅ Apprentice
export const fetchMyApprenticeCases = async () => {
  const res = await api.get("/api/apprenticeship/my/cases");
  return res.data;
};

export const fetchApprenticeCaseNotes = async (caseId) => {
  const res = await api.get(`/api/apprenticeship/cases/${caseId}/notes`);
  return res.data;
};

export const addApprenticeCaseNote = async (caseId, text) => {
  const res = await api.post(`/api/apprenticeship/cases/${caseId}/notes`, {
    note: text,
  });
  return res.data;
};

// ✅ Lawyer
export const assignApprenticeToCase = async ({ case_id, apprentice_id }) => {
  const res = await api.post("/api/apprenticeship/assign", {
    case_id,
    apprentice_id,
  });
  return res.data;
};

export const fetchCaseNotesForLawyer = async (caseId) => {
  const res = await api.get(`/api/apprenticeship/cases/${caseId}/notes`);
  return res.data;
};

// ✅ Dropdown: lawyer approved cases
export const fetchLawyerCases = async () => {
  const res = await api.get("/api/lawyer/cases");
  return res.data;
};

// ✅ Search apprentices
export const searchApprentices = async (query) => {
  const res = await api.get("/api/apprentices/search", {
    params: { q: query },
  });
  return res.data;
};

// ✅ NEW: dropdown choices
export const fetchApprenticeChoices = async () => {
  const res = await api.get("/api/apprenticeship/choices/apprentices");
  return res.data; // [{ id, full_name, email }]
};

export const fetchCaseChoices = async () => {
  const res = await api.get("/api/apprenticeship/choices/cases");
  return res.data; // [{ id, title, district, status, category }]
};


export const fetchDocumentReviewLinks = async (docId) => {
  const res = await api.get(`/api/documents/${docId}/review-link`);
  return res.data; // list
};

export const upsertDocumentReviewLink = async (docId, payload) => {
  const res = await api.post(`/api/documents/${docId}/review-link`, payload);
  return res.data; // saved row
};


export const downloadDocument = async (docId) => {
  const res = await api.get(`/api/documents/${docId}/download`, {
    responseType: "blob",
  });

  // Try to extract filename from Content-Disposition
  const disposition = res.headers?.["content-disposition"] || "";
  let filename = "";

  // supports filename="x.pdf" and filename*=UTF-8''x.pdf
  const utf8Match = disposition.match(/filename\*\s*=\s*UTF-8''([^;]+)/i);
  const plainMatch = disposition.match(/filename="?([^"]+)"?/i);

  if (utf8Match?.[1]) filename = decodeURIComponent(utf8Match[1]);
  else if (plainMatch?.[1]) filename = plainMatch[1];

  return { blob: res.data, filename, contentType: res.headers?.["content-type"] };
};



// add this to your apprenticeshipApi.js (same place you already have fetchCaseNotesForLawyer)

export const addLawyerCaseNote = async (caseId, text) => {
  const res = await api.post(`/api/apprenticeship/cases/${caseId}/notes`, {
    note: text,
  });
  return res.data;
};
