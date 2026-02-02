import api from "../../../services/api";

export async function getLawyerProfile(lawyerId) {
  const res = await api.get(`/api/lawyers/${lawyerId}/profile`);
  return res.data;
}
