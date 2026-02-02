import apiClient from "../../../lib/apiClient";

type CommentBody = {
  content: string;
  parent_id?: number;
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

export async function createCaseComment(caseId: number, body: CommentBody) {
  try {
    const res = await apiClient.post(`/api/public/cases/${caseId}/comments`, body);
    return res.data;
  } catch (error) {
    handleApiError(error);
  }
}

export async function createCaseReply(caseId: number, body: CommentBody) {
  try {
    const res = await apiClient.post(`/api/public/cases/${caseId}/comments`, body);
    return res.data;
  } catch (error) {
    handleApiError(error);
  }
}

export async function voteComment(commentId: number, value: 1 | -1 | 0) {
  try {
    const res = await apiClient.post(`/api/public/comments/${commentId}/vote`, { value });
    return res.data;
  } catch (error) {
    handleApiError(error);
  }
}

export async function removeVote(commentId: number) {
  try {
    return voteComment(commentId, 0);
  } catch (error) {
    handleApiError(error);
  }
}
