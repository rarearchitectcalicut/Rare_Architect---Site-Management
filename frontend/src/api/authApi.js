import { api } from "./client";

export const authApi = {
  login: async (phone, password) => {
    const { data } = await api.post("auth/login/", {
      phone,
      password,
    });

    return data;
  },

  getMe: async () => {
    const { data } = await api.get("auth/me/");
    return data;
  },

  logout: async (refresh) => {
    return api.post("auth/logout/", { refresh });
  },

  changePassword: async (payload) => {
    const { data } = await api.post(
      "auth/change-password/",
      payload
    );
    return data;
  },
};