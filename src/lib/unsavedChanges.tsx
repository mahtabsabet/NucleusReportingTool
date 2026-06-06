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
// While dirty, the user is warned before they lose the edits by:
//   • closing the tab / refreshing / leaving the site  (beforeunload)
//   • pressing the browser Back/Forward button          (popstate)
//   • clicking an in-app navigation that routes through useGuardedNavigate()
//
// We deliberately keep the manual Save — nothing is auto-saved; this only
// stops silent data loss. The confirm is a native window.confirm so it can
// block synchronously (required for the popstate case).
// ============================================================

const MESSAGE = 'You have unsaved changes that will be lost. Leave this page without saving?';

interface UnsavedChangesApi {
  setDirty: (dirty: boolean) => void;
  isDirty: () => boolean;
  // Returns true if it's safe to proceed (clean, or the user confirmed).
  confirmDiscard: () => boolean;
}

const Ctx = createContext<UnsavedChangesApi | null>(null);

export function UnsavedChangesProvider({ children }: { children: ReactNode }) {
  const [dirty, setDirtyState] = useState(false);
  // Mirror in a ref so the window-level handlers always read the latest value
  // without being re-bound on every change.
  const dirtyRef = useRef(false);

  const setDirty = useCallback((d: boolean) => {
    dirtyRef.current = d;
    setDirtyState(d);
  }, []);

  const confirmDiscard = useCallback(() => {
    if (!dirtyRef.current) return true;
    const ok = window.confirm(MESSAGE);
    if (ok) setDirty(false);
    return ok;
  }, [setDirty]);

  // Close tab / refresh / navigate to a non-app URL.
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (!dirtyRef.current) return;
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
    if (!dirty) return;
    window.history.pushState(null, '', window.location.href);
    const onPopState = () => {
      if (!dirtyRef.current) return;
      if (window.confirm(MESSAGE)) {
        setDirty(false);
        window.history.back(); // proceed past the sentinel to the real prior page
      } else {
        window.history.pushState(null, '', window.location.href); // re-arm; stay put
      }
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [dirty, setDirty]);

  const api = useMemo<UnsavedChangesApi>(
    () => ({ setDirty, confirmDiscard, isDirty: () => dirtyRef.current }),
    [setDirty, confirmDiscard],
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
 */
export function useUnsavedChanges(isDirty: boolean): void {
  const { setDirty } = useUnsavedChangesApi();
  useEffect(() => {
    setDirty(isDirty);
  }, [isDirty, setDirty]);
  useEffect(() => () => setDirty(false), [setDirty]);
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
