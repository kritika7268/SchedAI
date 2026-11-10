import { useEffect, useState } from "react";
import { subscribeToasts } from "./services/toast";

export default function Toaster() {
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    return subscribeToasts((t) => {
      setToasts((prev) => [...prev.slice(-3), t]);
      setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== t.id)), 4500);
    });
  }, []);

  const close = (id) => setToasts((prev) => prev.filter((x) => x.id !== id));

  return (
    <div className="toast-wrap" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.type}`} role="status">
          <span className="toast-msg">{t.message}</span>
          <button className="toast-x" onClick={() => close(t.id)} aria-label="Close">×</button>
        </div>
      ))}
    </div>
  );
}