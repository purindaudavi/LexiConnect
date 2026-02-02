import api from "../../../services/api";

// Method B:
// baseURL = http://127.0.0.1:8000
// so every cases endpoint MUST start with /api/cases

export async function getMyCases() {
  const res = await api.get("/api/cases/my");
  return res.data;
}

export async function getSpecializations() {
  const res = await api.get("/api/specializations");
  return res.data;
}

export async function getCaseById(caseId) {
  const res = await api.get(`/api/cases/${caseId}`);
  return res.data;
}

export async function getUserById(userId) {
  const res = await api.get(`/api/users/${userId}`);
  return res.data;
}

export async function createCase(payload) {
  const res = await api.post("/api/cases", payload);
  return res.data;
}

export async function getCaseFeed(params = {}) {
  const res = await api.get("/api/cases/feed", { params });
  return res.data;
}

export async function requestAccess(caseId, message) {
  // swagger: POST /api/cases/{case_id}/requests
  const res = await api.post(`/api/cases/${caseId}/requests`, { message });
  return res.data;
}

export async function getCaseRequests(caseId) {
  const res = await api.get(`/api/cases/${caseId}/requests`);
  return res.data;
}

export async function getMyCaseRequests() {
  const res = await api.get("/api/cases/requests/my");
  return res.data;
}

export async function updateCaseRequest(caseId, requestId, status) {
  // swagger: PATCH /api/cases/{case_id}/requests/{request_id}
  const res = await api.patch(`/api/cases/${caseId}/requests/${requestId}`, {
    status,
  });
  return res.data;
}
