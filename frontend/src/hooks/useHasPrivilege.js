import { useAuth } from "../context/AuthContext";

export default function useHasPrivilege(key) {
  const { effectivePrivileges } = useAuth();
  if (!key) return false;
  return effectivePrivileges.includes(key);
}
