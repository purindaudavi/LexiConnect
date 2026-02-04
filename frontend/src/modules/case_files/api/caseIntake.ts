import api from "../../../services/api";

export async function getCaseIntake(caseId: number) {
  const res = await api.get(`/api/cases/${caseId}/intake`);
  return res.data;
}

export async function createCaseIntake(caseId: number, payload: any) {
  const res = await api.post(`/api/cases/${caseId}/intake`, payload);
  return res.data;
}

export async function updateCaseIntake(caseId: number, payload: any) {
  const res = await api.patch(`/api/cases/${caseId}/intake`, payload);
  return res.data;
}
