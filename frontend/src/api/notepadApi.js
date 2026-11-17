import { api } from "./client";

export const notepadApi = {
  async get(signal) { return (await api.get("users/me/notepad/", { signal })).data; },
  async save(content, revision, signal) { return (await api.put("users/me/notepad/", { content, revision }, { signal })).data; },
};
