import { useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext";

const API_URL = "http://127.0.0.1:8000";

function fmt12(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}
const dateText = (iso) =>
  new Date(iso + "T00:00:00").toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });

export default function ExamReminders() {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const isTeacher = user?.role === "teacher";

  useEffect(() => {
    if (!user?.access_token) return;
    fetch(`${API_URL}/exams/reminders`, { headers: { Authorization: `Bearer ${user.access_token}` } })
      .then((r) => (r.ok ? r.json() : []))
      .then(setItems)
      .catch(() => {});
  }, [user]);

  if (items.length === 0) return null;

  return (
    <div style={{ marginBottom: 20 }}>
      {items.map((it) => {
        const urgent = it.days_left <= 1;
        const color = urgent ? "#b45309" : "#1e3a5f";
        const bg = urgent ? "#fffbeb" : "#f1f5f9";
        const border = urgent ? "#f59e0b" : "#cbd5e1";
        const shown = it.exams.slice(0, 5);
        return (
          <div
            key={it.exam_round}
            style={{ background: bg, border: `1px solid ${border}`, borderLeft: `5px solid ${color}`, borderRadius: 10, padding: "14px 18px", marginBottom: 10 }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 6 }}>
              <div style={{ fontWeight: 700, fontSize: 15, color }}>
                {urgent ? "⏰ " : "📝 "}{it.headline}
              </div>
              <div style={{ fontSize: 12, color: "#64748b" }}>
                {dateText(it.starts_on)} – {dateText(it.ends_on)}
              </div>
            </div>

            <div style={{ marginTop: 8 }}>
              {shown.map((e) => (
                <div key={e.exam_id} style={{ fontSize: 13, padding: "3px 0", display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <b style={{ minWidth: 92 }}>{e.days_left === 0 ? "Today" : dateText(e.exam_date)}</b>
                  <span>{fmt12(e.start_time)} – {fmt12(e.end_time)}</span>
                  <span>· {e.subject_name}</span>
                  <span style={{ color: "#64748b" }}>
                    · {e.room_name}{isTeacher ? ` · ${e.batch_name} (invigilation)` : ""}
                  </span>
                </div>
              ))}
              {it.exams.length > shown.length && (
                <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
                  +{it.exams.length - shown.length} more exam(s) in the timetable below
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}