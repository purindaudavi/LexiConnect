import api from "../../../services/api";

export const submitKyc = (data) => {
  return api.post("/api/kyc", data);
};

export const getMyKyc = () => {
  return api.get("/api/kyc/me");
};
