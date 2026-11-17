export const NOTE_LIMIT = 20000;

function validNote(data) {
  if (typeof data?.content !== "string" || data.content.length > NOTE_LIMIT || !Number.isSafeInteger(data.revision) || data.revision < 0) throw new Error("Invalid notepad response");
  return data;
}

// One store per signed-in account. No private note text enters browser storage.
export function createNotepadStore(api, { delay = 700, schedule = setTimeout, cancel = clearTimeout } = {}) {
  let state = { loaded: false, loading: false, text: "", savedText: "", revision: 0, updatedAt: null, saving: false, error: "", conflict: null };
  let timer, loading, saving;
  let loadController, saveController;
  const listeners = new Set();
  const emit = (patch) => { state = { ...state, ...patch }; listeners.forEach((listener) => listener()); };
  const dirty = () => state.loaded && state.text !== state.savedText;
  const clearTimer = () => { if (timer !== undefined) cancel(timer); timer = undefined; };
  function edit(text) {
    if (!state.loaded || text.length > NOTE_LIMIT) return;
    emit({ text, error: state.conflict ? state.error : "" });
    clearTimer();
    if (dirty() && !state.conflict) timer = schedule(() => { void save(); }, delay);
  }
  function load() {
    if (loading) return loading;
    if (state.loaded) return Promise.resolve(true);
    emit({ loading: true, error: "" });
    loadController = new AbortController();
    loading = (async () => {
      try {
        const data = validNote(await api.get(loadController.signal));
        emit({ loaded: true, text: data.content, savedText: data.content, revision: data.revision, updatedAt: data.updated_at });
        return true;
      } catch { emit({ error: "Your notes could not be loaded. Try again." }); return false; }
      finally { emit({ loading: false }); loading = null; }
    })();
    return loading;
  }
  function save() {
    clearTimer();
    if (saving) return saving;
    if (!dirty()) return Promise.resolve(true);
    if (state.conflict) return Promise.resolve(false);
    emit({ saving: true, error: "" });
    saveController = new AbortController();
    saving = (async () => {
      try {
        // Serialize saves, including text typed while an earlier save was in flight.
        while (dirty()) {
          const content = state.text;
          const data = validNote(await api.save(content, state.revision, saveController.signal));
          if (data.content !== content) throw new Error("The saved text did not match");
          emit({ savedText: content, revision: data.revision, updatedAt: data.updated_at });
        }
        return true;
      } catch (error) {
        const conflict = error.response?.status === 409 ? error.response.data?.current : null;
        if (conflict && conflict.content === state.text && Number.isSafeInteger(conflict.revision)) {
          emit({ savedText: conflict.content, revision: conflict.revision, updatedAt: conflict.updated_at, error: "", conflict: null });
          return true;
        }
        emit({ error: conflict ? "Notes changed on another tab or device. Your text is still here. Choose a version below." : "Not saved. Keep this page open, check your connection and retry.", conflict });
        return false;
      } finally { emit({ saving: false }); saving = null; }
    })();
    return saving;
  }
  return {
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    getSnapshot: () => state,
    dirty, edit, load, save,
    keepMine() {
      if (!state.conflict) return Promise.resolve(false);
      emit({ savedText: state.conflict.content, revision: state.conflict.revision, conflict: null, error: "" });
      return save();
    },
    useSaved() {
      if (!state.conflict) return;
      const data = state.conflict;
      clearTimer();
      emit({ text: data.content, savedText: data.content, revision: data.revision, updatedAt: data.updated_at, conflict: null, error: "" });
    },
    dispose() { clearTimer(); loadController?.abort(); saveController?.abort(); },
  };
}
