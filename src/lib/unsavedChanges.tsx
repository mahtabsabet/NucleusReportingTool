import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useNavigate, type NavigateOptions, type To } from 'react-router-dom';

// ============================================================
// Unsaved-changes guard
//
// Forms that require an explicit Save call useUnsavedChanges(isDirty).
// While ANY registered source is dirty, the user is warned before they
// lose edits by:
//   • closing the tab / refreshing / leaving the site  (beforeunload)
//   • pressing the browser Back/Forward button          (popstate)
//   • clicking an in-app navigation routed through useGuardedNavigate()
//
// Multiple independent sources can be dirty at once (e.g. a page and a
// child widget), so each registers under its own id and the guard fires
// while any of them is dirty.
//
// We deliberately keep the manual Save — nothing is auto-saved; this only
// stops silent data loss. The confirm is a native window.confirm so it can
// block synchronously (required for the popstate case).
// ============================================================

const MESSAGE = 'You have unsaved changes that will be lost. Leave this page without saving?';

interface UnsavedChangesApi {
  setSourceDirty: (id: number, dirty: boolean) => void;
  removeSource: (id: number) => void;
  // Returns true if it's safe to proceed (clean, or the user confirmed).
  confirmDiscard: () => boolean;
}

const Ctx = createContext<UnsavedChangesApi | null>(null);

let sourceCounter = 0;

export function UnsavedChangesProvider({ children }: { children: ReactNode }) {
  const sourcesRef = useRef<Map<number, boolean>>(new Map());
  // State mirror drives the Back-button sentinel effect; the ref is the
  // source of truth the window-level handlers read synchronously.
  const [anyDirty, setAnyDirty] = useState(false);

  const recompute = useCallback(() => {
    let dirty = false;
    for (const v of sourcesRef.current.values()) {
      if (v) { dirty = true; break; }
    }
    setAnyDirty(dirty);
  }, []);

  const setSourceDirty = useCallback((id: number, dirty: boolean) => {
    sourcesRef.current.set(id, dirty);
    recompute();
  }, [recompute]);

  const removeSource = useCallback((id: number) => {
    sourcesRef.current.delete(id);
    recompute();
  }, [recompute]);

  const anyDirtyNow = () => {
    for (const v of sourcesRef.current.values()) if (v) return true;
    return false;
  };

  const confirmDiscard = useCallback(() => {
    if (!anyDirtyNow()) return true;
    const ok = window.confirm(MESSAGE);
    if (ok) {
      // Clear so the imminent navigation doesn't re-prompt; unmounting
      // editors will have their sources removed on cleanup anyway.
      sourcesRef.current.clear();
      recompute();
    }
    return ok;
  }, [recompute]);

  // Close tab / refresh / navigate to a non-app URL.
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (!anyDirtyNow()) return;
      e.preventDefault();
      e.returnValue = ''; // required for the prompt to show in most browsers
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);

  // Browser Back/Forward. While dirty we keep a duplicate "sentinel" history
  // entry so the first Back lands us back on this same URL, giving us a chance
  // to confirm before actually leaving.
  useEffect(() => {
    if (!anyDirty) return;
    window.history.pushState(null, '', window.location.href);
    const onPopState = () => {
      if (!anyDirtyNow()) return;
      if (window.confirm(MESSAGE)) {
        sourcesRef.current.clear();
        recompute();
        window.history.back(); // proceed past the sentinel to the real prior page
      } else {
        window.history.pushState(null, '', window.location.href); // re-arm; stay put
      }
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [anyDirty, recompute]);

  const api = useMemo<UnsavedChangesApi>(
    () => ({ setSourceDirty, removeSource, confirmDiscard }),
    [setSourceDirty, removeSource, confirmDiscard],
  );

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

function useUnsavedChangesApi(): UnsavedChangesApi {
  const ctx = useContext(Ctx);
  if (!ctx) {
    throw new Error('useUnsavedChanges must be used within an UnsavedChangesProvider');
  }
  return ctx;
}

/**
 * Register a form's live "dirty" flag with the guard. While the flag is true,
 * the user is warned before navigating or closing the tab. Clears on unmount.
 * Multiple components may call this independently; the guard fires while any
 * of them is dirty.
 */
export function useUnsavedChanges(isDirty: boolean): void {
  const { setSourceDirty, removeSource } = useUnsavedChangesApi();
  const idRef = useRef<number>();
  if (idRef.current === undefined) idRef.current = ++sourceCounter;

  useEffect(() => {
    setSourceDirty(idRef.current!, isDirty);
  }, [isDirty, setSourceDirty]);

  useEffect(() => () => removeSource(idRef.current!), [removeSource]);
}

/**
 * Drop-in replacement for react-router's useNavigate that prompts for
 * confirmation when there are unsaved changes before navigating.
 */
export function useGuardedNavigate() {
  const navigate = useNavigate();
  const { confirmDiscard } = useUnsavedChangesApi();
  return useCallback(
    (to: To | number, options?: NavigateOptions) => {
      if (!confirmDiscard()) return;
      if (typeof to === 'number') navigate(to);
      else navigate(to, options);
    },
    [navigate, confirmDiscard],
  );
}
