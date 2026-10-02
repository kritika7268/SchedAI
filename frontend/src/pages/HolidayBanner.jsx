import { useEffect, useState } from "react";

const API_URL = "http://127.0.0.1:8000";

/**
 * Drop <HolidayBanner /> at the top of any dashboard (Admin/Teacher/Student).
 * Shows:
 *  - a green banner if today is a holiday
 *  - an amber strip listing holidays in the next 7 days
 * Renders nothing if there's nothing to show.
 */
function HolidayBanner() {
  const [data, setData] = useState(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_URL}/holidays/notifications`);
        if (!res.ok) return;
        setData(await res.json());
      } catch (e) {
        console.error("Could not load holiday notifications:", e);
      }
    })();
  }, []);

  if (!data || dismissed) return null;

  const { today_holidays, upcoming_holidays } = data;
  if (today_holidays.length === 0 && upcoming_holidays.length === 0) return null;

  const formatDate = (iso) =>
    new Date(iso + "T00:00:00").toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
    });

  return (
    <div style={{ marginBottom: 20 }}>
      {/* TODAY IS A HOLIDAY */}
      {today_holidays.length > 0 && (
        <div
          style={{
            background: "#dcfce7",
            border: "1px solid #16a34a",
            borderRadius: 10,
            padding: "14px 18px",
            marginBottom: upcoming_holidays.length > 0 ? 10 : 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 22 }}>🎉</span>
            <div style={{ fontWeight: 700, color: "#166534", fontSize: 14 }}>
              Today is a holiday: {today_holidays.map(h => h.holiday_name).join(", ")}
            </div>
          </div>
          <button
            onClick={() => setDismissed(true)}
            style={{
              background: "transparent",
              border: "none",
              color: "#166534",
              cursor: "pointer",
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            ✕
          </button>
        </div>
      )}

      {/* UPCOMING HOLIDAYS (next 7 days) */}
      {upcoming_holidays.length > 0 && (
        <div
          style={{
            background: "#fef3c7",
            border: "1px solid #d97706",
            borderRadius: 10,
            padding: "12px 18px",
            display: "flex",
            alignItems: "center",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <span style={{ fontSize: 18 }}>📅</span>
          <div style={{ fontSize: 13, color: "#92400e" }}>
            <strong>Coming up:</strong>{" "}
            {upcoming_holidays.map((h, i) => (
              <span key={h.holiday_id}>
                {h.holiday_name} ({formatDate(h.holiday_date)}
                {h.days_until === 1 ? ", tomorrow" : `, in ${h.days_until} days`})
                {i < upcoming_holidays.length - 1 ? " · " : ""}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default HolidayBanner;