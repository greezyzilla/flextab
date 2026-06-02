import { useState, useEffect, useCallback, useRef } from "react";

interface UndoAction {
  id: string;
  message: string;
  onUndo: () => void;
  timeout: number;
}

let _addToast: ((action: Omit<UndoAction, 'id'>) => void) | null = null;

export function showUndoToast(message: string, onUndo: () => void, timeout = 5000) {
  _addToast?.({ message, onUndo, timeout });
}

export function UndoToastContainer() {
  const [toasts, setToasts] = useState<UndoAction[]>([]);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const addToast = useCallback((action: Omit<UndoAction, 'id'>) => {
    const id = crypto.randomUUID();
    setToasts(prev => [...prev, { ...action, id }]);

    const timer = setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
      timersRef.current.delete(id);
    }, action.timeout);
    timersRef.current.set(id, timer);
  }, []);

  useEffect(() => {
    _addToast = addToast;
    return () => { _addToast = null; };
  }, [addToast]);

  const handleUndo = (toast: UndoAction) => {
    toast.onUndo();
    const timer = timersRef.current.get(toast.id);
    if (timer) clearTimeout(timer);
    timersRef.current.delete(toast.id);
    setToasts(prev => prev.filter(t => t.id !== toast.id));
  };

  const handleDismiss = (id: string) => {
    const timer = timersRef.current.get(id);
    if (timer) clearTimeout(timer);
    timersRef.current.delete(id);
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2">
      {toasts.map(toast => (
        <div
          key={toast.id}
          className="flex items-center gap-3 bg-black-800 border border-white/10 rounded-lg px-4 py-3 shadow-lg animate-in slide-in-from-bottom-2"
        >
          <span className="text-white/80 text-sm font-sans">{toast.message}</span>
          <button
            onClick={() => handleUndo(toast)}
            className="text-sm font-medium font-sans transition-colors"
            style={{ color: 'var(--accent)' }}
          >
            Undo
          </button>
          <button
            onClick={() => handleDismiss(toast.id)}
            className="text-white/30 hover:text-white/50 text-xs ml-1"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
