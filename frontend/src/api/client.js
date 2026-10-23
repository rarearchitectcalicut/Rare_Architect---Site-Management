
import axios from "axios";

const BASE_URL = import.meta.env.VITE_API_BASE_URL;

if (!BASE_URL) {
  throw new Error("VITE_API_BASE_URL is not configured");
}

export const api = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
});

const tokenClient = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
});

const SESSION_KEY = "rare.auth.tokens";

function readStoredTokens() {
  try {
    return JSON.parse(sessionStorage.getItem(SESSION_KEY)) || {};
  } catch {
    return {};
  }
}

const storedTokens = readStoredTokens();
let accessToken = storedTokens.access ?? null;
let refreshToken = storedTokens.refresh ?? null;
let refreshPromise = null;
let unauthorizedHandler = null;

export function setAuthTokens(tokens) {
  accessToken = tokens?.access ?? null;
  refreshToken = tokens?.refresh ?? null;
  try {
    sessionStorage.setItem(
      SESSION_KEY,
      JSON.stringify({ access: accessToken, refresh: refreshToken })
    );
  } catch {
    // Authentication still works in memory if browser storage is unavailable.
  }
}

export function clearAuthTokens() {
  accessToken = null;
  refreshToken = null;
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // Browser storage may be unavailable.
  }
}

export function setUnauthorizedHandler(handler) {
  unauthorizedHandler = handler;
}

export function getRefreshToken() {
  return refreshToken;
}



// REQUEST INTERCEPTORS
api.interceptors.request.use((config) => {
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});




// RESPONSE INTERCEPTORS
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (
      !originalRequest ||
      error.response?.status !== 401 ||
      originalRequest.url?.includes("auth/login/") ||
      originalRequest.url?.includes("auth/refresh/")
    ) {
      return Promise.reject(error);
    }

    const requestToken = originalRequest.headers?.Authorization;

    if (originalRequest._retry || !refreshToken) {
      if (accessToken && requestToken === `Bearer ${accessToken}`) {
        clearAuthTokens();
        unauthorizedHandler?.();
      }
      return Promise.reject(error);
    }

    originalRequest._retry = true;

    // A concurrent request may already have refreshed this expired token.
    if (accessToken && requestToken !== `Bearer ${accessToken}`) {
      originalRequest.headers.Authorization = `Bearer ${accessToken}`;
      return api(originalRequest);
    }

    const tokenUsed = refreshToken;

    try {
      if (!refreshPromise) {
        refreshPromise = tokenClient
          .post("auth/refresh/", {
            refresh: tokenUsed,
          })
          .then(({ data }) => {
            if (!data.access) {
              throw new Error("No refreshed access token");
            }

            // A backend with refresh rotation may return both.
            if (refreshToken === tokenUsed) {
              setAuthTokens({
                access: data.access,
                refresh: data.refresh ?? refreshToken,
              });
            }

            return data.access;
          })
          .finally(() => {
            refreshPromise = null;
          });
      }

      const newAccessToken = await refreshPromise;

      // The user may have logged out while refresh was running.
      if (!accessToken || accessToken !== newAccessToken) {
        return Promise.reject(error);
      }

      originalRequest.headers.Authorization =
        `Bearer ${newAccessToken}`;

      return api(originalRequest);
    } catch (refreshError) {
      if (refreshToken === tokenUsed) {
        clearAuthTokens();
        unauthorizedHandler?.();
      }

      return Promise.reject(refreshError);
    }
  }
);
