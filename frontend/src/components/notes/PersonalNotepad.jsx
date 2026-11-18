import { useEffect, useImperativeHandle, useRef, useState, useSyncExternalStore } from "react";
import { Check, CloudUpload, LoaderCircle, LockKeyhole, NotebookPen, X } from "lucide-react";
import ApprovalModal from "../approvals/ApprovalModal";
import { notepadApi } from "../../api/notepadApi";
import { createNotepadStore, NOTE_LIMIT } from "./notepadStore";

export default function PersonalNotepad({ ref }) {
  const [store] = useState(() => createNotepadStore(notepadApi));
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const [open, setOpen] = useState(false);
  const [paperTone, setPaperTone] = useState("ivory");
  const trigger = useRef(null);
  const editor = useRef(null);
  const hasOpened = useRef(false);
  const dirty = store.dirty();
  const status = state.conflict ? "Choose a version" : state.error ? "Not saved" : state.saving ? "Saving..." : dirty ? "Unsaved changes" : state.loaded ? "All changes saved" : "Private to your account";

  function show() { setOpen(true); void store.load(); }
  function close() { setOpen(false); void store.save(); }

  useImperativeHandle(ref, () => ({
    async prepareToLeave() {
      const saved = await store.save();
      if (!saved) setOpen(true);
      return saved;
    },
  }), [store]);

  useEffect(() => {
    function beforeUnload(event) {
      if (!store.dirty()) return;
      event.preventDefault(); event.returnValue = "";
    }
    function reconnect() { if (store.dirty()) void store.save(); }
    window.addEventListener("beforeunload", beforeUnload);
    window.addEventListener("online", reconnect);
    return () => {
      store.dispose();
      window.removeEventListener("beforeunload", beforeUnload);
      window.removeEventListener("online", reconnect);
    };
  }, [store]);

  useEffect(() => {
    if (open && state.loaded) editor.current?.focus();
  }, [open, state.loaded]);

  useEffect(() => {
    if (open) hasOpened.current = true;
    else if (hasOpened.current) trigger.current?.focus();
  }, [open]);

  return <>
    <button ref={trigger} type="button" className="rare-notepad-trigger" aria-label={`Open personal notes${dirty ? ", unsaved changes" : state.error ? ", needs attention" : ""}`} title="Personal notes" aria-haspopup="dialog" onClick={show}>
      <NotebookPen size={20} strokeWidth={1.8} aria-hidden="true" />
      {(dirty || state.error) && <span className="rare-notepad-unsaved" aria-hidden="true" />}
    </button>
    {open && <ApprovalModal compact className="rare-notepad-modal" label="Personal notes" onClose={close}>
      <div className="rare-notepad" data-paper-tone={paperTone}>
        <header className="rare-notepad-heading">
          <span className="rare-notepad-heading-icon" aria-hidden="true"><NotebookPen size={21} strokeWidth={1.5} /></span>
          <div className="rare-notepad-heading-copy">
            <p className="rare-notepad-eyebrow">Your personal space</p>
            <h2>Notes<span aria-hidden="true">.</span></h2>
          </div>
          <button type="button" onClick={close} aria-label="Close personal notes" className="rare-notepad-close"><X size={18} aria-hidden="true" /></button>
        </header>
        <div className="rare-notepad-toolbar">
          <div className="rare-notepad-palette">
            <div className="rare-notepad-tones" role="group" aria-label="Paper tone">
              {["ivory", "lilac", "sage"].map((tone) => <button key={tone} type="button" className="rare-notepad-tone" data-tone={tone} aria-label={`${tone[0].toUpperCase()}${tone.slice(1)} paper`} aria-pressed={paperTone === tone} onClick={() => setPaperTone(tone)}>
                <span className="rare-notepad-swatch" aria-hidden="true">{paperTone === tone && <Check size={12} />}</span>
                <span>{tone[0].toUpperCase()}{tone.slice(1)}</span>
              </button>)}
            </div>
          </div>
          <div className="rare-notepad-save-state" data-state={state.conflict || state.error ? "error" : dirty || state.saving ? "pending" : "saved"} role="status" aria-live="polite">{state.saving ? <LoaderCircle size={14} aria-hidden="true" className="motion-safe:animate-spin" /> : dirty || state.error ? <CloudUpload size={14} aria-hidden="true" /> : <Check size={14} aria-hidden="true" />}<span>{state.loading ? "Loading your notes..." : status}</span></div>
        </div>
        {!state.loaded ? <div className="rare-notepad-loading">{state.error ? <><p role="alert">{state.error}</p><button className="rare-button rare-button-secondary" type="button" onClick={() => void store.load()}>Try again</button></> : <p>Opening your notepad...</p>}</div> : <>
          <div className="rare-notepad-paper">
            <div className="rare-notepad-paper-heading"><label htmlFor="personal-notes-text">Your notes</label><span title="Character limit">{state.text.length.toLocaleString()} / {NOTE_LIMIT.toLocaleString()}</span></div>
            <textarea ref={editor} id="personal-notes-text" className="rare-notepad-editor" value={state.text} onChange={(event) => store.edit(event.target.value)} maxLength={NOTE_LIMIT} placeholder={"A thought, a reminder, a little idea..."} spellCheck />
          </div>
          {state.error && <div className="rare-notepad-error" role="alert"><p>{state.error}</p>{state.conflict ? <>
            <details><summary>Review the saved version</summary><pre>{state.conflict.content || "(Empty notepad)"}</pre></details>
            <div className="flex flex-wrap gap-2"><button type="button" className="rare-button rare-button-primary" onClick={() => void store.keepMine()}>Keep my version</button><button type="button" className="rare-button rare-button-secondary" onClick={store.useSaved}>Use saved version</button></div>
          </> : <button type="button" className="rare-button rare-button-secondary" onClick={() => void store.save()}>Retry save</button>}</div>}
          <footer><span><LockKeyhole size={12} aria-hidden="true" />Private to your account</span><span className="rare-notepad-timestamp" title={state.updatedAt ? new Date(state.updatedAt).toLocaleString() : undefined}>{state.updatedAt && !dirty ? `Saved at ${new Date(state.updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "Autosaves as you type"}</span></footer>
        </>}
      </div>
    </ApprovalModal>}
  </>;
}
