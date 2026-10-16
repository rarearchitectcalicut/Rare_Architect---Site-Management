
import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import { authApi } from "../api/authApi";
import {
  clearAuthTokens,
  getRefreshToken,
  setAuthTokens,
  setUnauthorizedHandler,
} from "../api/client";

export const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(false);

  const clearSession = useCallback(() => {
    clearAuthTokens();
    setUser(null);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(clearSession);

    return () => setUnauthorizedHandler(null);
  }, [clearSession]);

  const login = useCallback(async (phone, password) => {
    setLoading(true);

    try {
      const tokens = await authApi.login(phone, password);

      if (!tokens.access || !tokens.refresh) {
        throw new Error("Invalid authentication response");
      }

      setAuthTokens(tokens);

      const currentUser = await authApi.getMe();

      if (
        !currentUser ||
        !["ADMIN", "SUPERVISOR"].includes(currentUser.role)
      ) {
        throw new Error("Invalid user profile or role");
      }

      setUser(currentUser);
      return currentUser;
    } catch (error) {
      clearSession();
      throw error;
    } finally {
      setLoading(false);
    }
  }, [clearSession]);

  const logout = useCallback(async () => {
   
    const refresh = getRefreshToken();

    try {
      // Call backend while the access token is still available
      if (refresh) {
        await authApi.logout(refresh);
      }
    } catch (error) {
      console.error(
        "Backend logout failed:",
        error.response?.data?.detail || error.message
      );
    } finally {
      // Always clear frontend authentication state
      clearSession();
    }
  }, [clearSession]);

  const reloadUser = useCallback(async () => {
    const currentUser = await authApi.getMe();
    setUser(currentUser);
    return currentUser;
  }, []);

  const value = useMemo(
    () => ({
      user,
      loading,
      login,
      logout,
      reloadUser,
      isAuthenticated: Boolean(user),
    }),
    [user, loading, login, logout, reloadUser]
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}
