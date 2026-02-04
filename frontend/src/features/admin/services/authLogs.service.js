import api from "../../../services/api";

const AUTH_LOGS_ENDPOINT = "/api/auth-logs";
const AUTH_LOGS_FALLBACK = "/api/auth/logs";

export async function listAuthLogs(params = {}) {
  try {
    const { data } = await api.get(AUTH_LOGS_ENDPOINT, { params });
    return data;
  } catch (err) {
    if (err?.response?.status === 404) {
      const { data } = await api.get(AUTH_LOGS_FALLBACK, { params });
      return data;
    }
    throw err;
  }
}
