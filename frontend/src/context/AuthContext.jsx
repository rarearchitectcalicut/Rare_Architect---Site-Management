
import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { authApi } from "../api/authApi";
import LoadingScreen from "../components/LoadingScreen";
import { disableDevicePush } from "../utils/pushNotifications";
import {
  clearAuthTokens,
  getRefreshToken,
  setAuthTokens,
  setUnauthorizedHandler,
} from "../api/client";

export const AuthContext = createContext(null);

function isAuthenticationFailure(error) {
  return error?.response?.status === 401;
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [restoreError, setRestoreError] = useState("");
  const [restoreAttempt, setRestoreAttempt] = useState(0);
  const restoreRequest = useRef(null);

  const clearSession = useCallback(() => {
    // Also revoke browser delivery after expired authentication. Never block logout.
    void disableDevicePush({ localOnly: true }).catch(() => {});
    clearAuthTokens();
    setUser(null);
    setRestoreError("");
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(clearSession);

    return () => setUnauthorizedHandler(null);
  }, [clearSession]);

  useEffect(() => {
    let cancelled = false;

    // Share the request across Strict Mode's effect setup/cleanup cycle.
    if (!restoreRequest.current) {
      restoreRequest.current = getRefreshToken()
        ? authApi.getMe()
        : Promise.resolve(null);
    }

    restoreRequest.current
      .then((currentUser) => {
        if (cancelled) return;
        if (
          currentUser &&
          !["ADMIN", "SUPERVISOR"].includes(currentUser.role)
        ) {
          clearSession();
          return;
        }
        setUser(currentUser);
      })
      .catch((error) => {
        if (cancelled) return;
        if (isAuthenticationFailure(error)) clearSession();
        else setRestoreError("Unable to restore your session. Check your connection and try again.");
      })
      .finally(() => {
        if (!cancelled) setInitializing(false);
      });

    return () => {
      cancelled = true;
    };
  }, [clearSession, restoreAttempt]);

  const login = useCallback(async (phone, password) => {
    setLoading(true);
    let profilePending = false;

    try {
      const tokens = await authApi.login(phone, password);

      if (!tokens.access || !tokens.refresh) {
        clearSession();
        throw new Error("Invalid authentication response");
      }

      setAuthTokens(tokens);
      setUser(null);
      profilePending = true;

      const currentUser = await authApi.getMe();

      if (
        !currentUser ||
        !["ADMIN", "SUPERVISOR"].includes(currentUser.role)
      ) {
        clearSession();
        throw new Error("Invalid user profile or role");
      }

      setUser(currentUser);
      setRestoreError("");
      return currentUser;
    } catch (error) {
      if (isAuthenticationFailure(error)) clearSession();
      else if (profilePending && getRefreshToken()) {
        setRestoreError("Unable to restore your session. Check your connection and try again.");
      }
      throw error;
    } finally {
      setLoading(false);
    }
  }, [clearSession]);

  const logout = useCallback(async () => {
   
    const refresh = getRefreshToken();

    // Both operations are attempted: a failed server request must still unsubscribe
    // the browser. API revocation uses the existing token before it is cleared.
    await disableDevicePush().catch(() => {});

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
      {initializing ? (
        <LoadingScreen message="Restoring your session..." standalone />
      ) : restoreError ? (
        <main className="flex min-h-dvh items-center justify-center bg-[#F1EADF] p-6">
          <div className="w-full max-w-md space-y-4 rounded-2xl border border-[#E7DED2] bg-[#FFFDFA] p-6 text-[#211E1A]">
            <p role="alert" className="text-sm">{restoreError}</p>
            <div className="flex flex-wrap gap-3">
              <button type="button" className="rare-button rare-button-primary" disabled={loading} onClick={() => {
                restoreRequest.current = null;
                setRestoreError("");
                setInitializing(true);
                setRestoreAttempt((attempt) => attempt + 1);
              }}>Retry</button>
              <button type="button" className="rare-button rare-button-secondary" disabled={loading} onClick={async () => {
                setLoading(true);
                try { await logout(); } finally { setLoading(false); }
              }}>Sign out</button>
            </div>
          </div>
        </main>
      ) : children}
    </AuthContext.Provider>
  );
}
