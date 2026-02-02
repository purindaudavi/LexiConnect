import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import api from "../services/api";
import { getToken, logout as clearAuthStorage } from "../services/auth";

const AuthContext = createContext(null);

const emptyAuth = {
  user: null,
  roles: [],
  effectivePrivileges: [],
  loading: true,
  isAuthenticated: false,
};

export const AuthProvider = ({ children }) => {
  const [state, setState] = useState(emptyAuth);

  const logout = useCallback(() => {
    clearAuthStorage();
    setState({
      user: null,
      roles: [],
      effectivePrivileges: [],
      loading: false,
      isAuthenticated: false,
    });
  }, []);

  const refreshMe = useCallback(async () => {
    const token = getToken();
    if (!token) {
      setState((prev) => ({ ...prev, loading: false, isAuthenticated: false }));
      return;
    }
    try {
      const { data } = await api.get("/auth/me");
      setState({
        user: {
          id: data?.id,
          full_name: data?.full_name,
          email: data?.email,
          role: data?.role,
        },
        roles: Array.isArray(data?.roles) ? data.roles : [],
        effectivePrivileges: Array.isArray(data?.effective_privileges) ? data.effective_privileges : [],
        loading: false,
        isAuthenticated: true,
      });
    } catch (err) {
      if (err?.response?.status === 401) {
        logout();
        return;
      }
      setState((prev) => ({ ...prev, loading: false }));
    }
  }, [logout]);

  useEffect(() => {
    refreshMe();
  }, [refreshMe]);

  const value = useMemo(
    () => ({
      ...state,
      refreshMe,
      refreshPermissions: refreshMe,
      logout,
    }),
    [state, refreshMe, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
};
