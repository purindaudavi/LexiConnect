import apiClient from "../../../lib/apiClient";

type PublicCasesParams = {
  q?: string;
  district?: string;
  specialization_id?: number;
  sort?: string;
  limit?: number;
  offset?: number;
};

function throwAuthRequired() {
  const err = new Error("Authentication required");
  (err as Error & { isAuthRequired?: boolean }).isAuthRequired = true;
  throw err;
}

function handleApiError(error: unknown) {
  const status = (error as { response?: { status?: number } })?.response?.status;
  if (status === 401) {
    throwAuthRequired();
  }
  throw error;
}

export async function fetchPublicCases(params: PublicCasesParams) {
  try {
    const res = await apiClient.get("/api/public/cases", { params });
    return res.data;
  } catch (error) {
    handleApiError(error);
  }
}

export async function fetchPublicCaseById(caseId: number) {
  try {
    const res = await apiClient.get(`/api/public/cases/${caseId}`);
    return res.data;
  } catch (error) {
    handleApiError(error);
  }
}

export async function fetchPublicCaseComments(
  caseId: number,
  params?: { sort?: string }
) {
  try {
    const res = await apiClient.get(`/api/public/cases/${caseId}/comments`, { params });
    return res.data;
  } catch (error) {
    handleApiError(error);
  }
}
