import api from "../../../services/api";

export async function getAuthLoginsPerMinute(minutes = 60) {
  const { data } = await api.get("/api/admin/metrics/auth-logins-per-minute", {
    params: { minutes },
  });
  return data;
}

export async function getAuditTopActions(days = 7, limit = 8) {
  const { data } = await api.get("/api/admin/metrics/audit-top-actions", {
    params: { days, limit },
  });
  return data;
}
