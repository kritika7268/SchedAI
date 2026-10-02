import { useEffect, useRef, useState } from "react";

const API_URL = "http://127.0.0.1:8000";
const WS_URL = "ws://127.0.0.1:8000";

const ICONS = { info: "ℹ️", success: "✅", warning: "⚠️", danger: "🚨" };
const COLORS = {
  info:    { bg: "#eff6ff", border: "#3b82f6", text: "#1e40af" },
  success: { bg: "#dcfce7", border: "#16a34a", text: "#166534" },
  warning: { bg: "#fef3c7", border: "#d97706", text: "#92400e" },
  danger:  { bg: "#fee2e2", border: "#dc2626", text: "#991b1b" },
};

/**
 * <NotificationBell role="admin" />   role: "admin" | "teacher" | "student"
 *
 * Connects to the backend WebSocket for live push notifications, and
 * loads recent history on mount. Unread count persists across page
 * reloads via localStorage (per role).
 *
 * Auto-reconnects every 3s if the socket drops (e.g. backend restart).
 */
function NotificationBell({ role }) {
  const [notifications, setNotifications] = useState([]);
  const [open, setOpen] = useState(false);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef(null);
  const dropdownRef = useRef(null);

  const lastSeenKey = `schedai_last_seen_notification_${role}`;

  // ── load history on mount ───────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_URL}/notifications?role=${role}`);
        if (res.ok) {
          const data = await res.json();
          setNotifications(data);
        }
      } catch (e) {
        console.error("Could not load notification history:", e);
      }
    })();
  }, [role]);

  // ── WebSocket with auto-reconnect ───────────────────────────────────────
  useEffect(() => {
    let ws;
    let retryTimer;
    let closedByUs = false;

    const connect = () => {
      ws = new WebSocket(`${WS_URL}/ws/notifications?role=${role}`);
      wsRef.current = ws;

      ws.onopen = () => setConnected(true);

      ws.onclose = () => {
        setConnected(false);
        if (!closedByUs) {
          retryTimer = setTimeout(connect, 3000);
        }
      };

      ws.onerror = () => ws.close();

      ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          setNotifications((prev) => {
            // avoid duplicates (history + live push)
            if (prev.some((n) => n.notification_id === payload.notification_id)) {
              return prev;
            }
            return [payload, ...prev].slice(0, 50);
          });
        } catch (e) {
          console.error("Bad notification payload:", e);
        }
      };
    };

    connect();

    return () => {
      closedByUs = true;
      clearTimeout(retryTimer);
      if (ws) ws.close();
    };
  }, [role]);

  // ── close dropdown on outside click ─────────────────────────────────────
  useEffect(() => {
    const handleClick = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const lastSeenId = Number(localStorage.getItem(lastSeenKey) || 0);
  const unreadCount = notifications.filter(
    (n) => n.notification_id > lastSeenId
  ).length;

  const handleToggle = () => {
    const next = !open;
    setOpen(next);
    if (next && notifications.length > 0) {
      const maxId = Math.max(...notifications.map((n) => n.notification_id));
      localStorage.setItem(lastSeenKey, String(maxId));
    }
  };

  const timeAgo = (isoLike) => {
    const then = new Date(isoLike.replace(" ", "T"));
    const diffMin = Math.floor((Date.now() - then.getTime()) / 60000);
    if (diffMin < 1) return "just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    return `${Math.floor(diffHr / 24)}d ago`;
  };

  return (
    <div style={{ position: "relative" }} ref={dropdownRef}>
      <button
        onClick={handleToggle}
        style={{
          position: "relative",
          background: "transparent",
          border: "none",
          cursor: "pointer",
          fontSize: 20,
          padding: 6,
          display: "flex",
          alignItems: "center",
        }}
        title={connected ? "Connected — live notifications" : "Reconnecting…"}
      >
        🔔
        {unreadCount > 0 && (
          <span style={{
            position: "absolute", top: 0, right: 0,
            background: "#dc2626", color: "#fff",
            fontSize: 10, fontWeight: 700,
            borderRadius: 10, minWidth: 16, height: 16,
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: "0 3px",
          }}>
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
        {!connected && (
          <span style={{
            position: "absolute", bottom: 2, right: 2,
            width: 6, height: 6, borderRadius: "50%",
            background: "#9ca3af",
          }} />
        )}
      </button>

      {open && (
        <div style={{
          position: "absolute", right: 0, top: "calc(100% + 8px)",
          width: 340, maxHeight: 420, overflowY: "auto",
          background: "#fff", border: "1px solid #e5e7eb",
          borderRadius: 10, boxShadow: "0 8px 24px rgba(15,23,42,0.12)",
          zIndex: 50,
        }}>
          <div style={{
            padding: "12px 16px", borderBottom: "1px solid #f1f5f9",
            fontWeight: 700, fontSize: 13, color: "#111827",
          }}>
            Notifications
          </div>

          {notifications.length === 0 ? (
            <div style={{ padding: "24px 16px", textAlign: "center", color: "#9ca3af", fontSize: 13 }}>
              No notifications yet.
            </div>
          ) : (
            notifications.map((n) => {
              const c = COLORS[n.notif_type] || COLORS.info;
              return (
                <div
                  key={n.notification_id}
                  style={{
                    padding: "12px 16px",
                    borderBottom: "1px solid #f8fafc",
                    borderLeft: `3px solid ${c.border}`,
                    display: "flex",
                    gap: 10,
                  }}
                >
                  <span style={{ fontSize: 16 }}>{ICONS[n.notif_type] || "ℹ️"}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, color: "#111827" }}>
                      {n.title}
                    </div>
                    <div style={{ fontSize: 12, color: "#4b5563", marginTop: 2 }}>
                      {n.message}
                    </div>
                    <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 4 }}>
                      {timeAgo(n.created_at)}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

export default NotificationBell;