import { useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext";

const API_URL = "http://127.0.0.1:8000";

function fmt12(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}
function prettyDate(iso) {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-IN", {
    weekday: "long", day: "numeric", month: "short",
  });
}

export default function MyExams() {
  const { user } = useAuth();
  const [rows, setRows] = useState([]);
  const isTeacher = user?.role === "teacher";

  useEffect(() => {
    if (!user?.access_token) return;
    fetch(`${API_URL}/exams/schedule`, {
      headers: { Authorization: `Bearer ${user.access_token}` },
    })
      .then((r) => (r.ok ? r.json() : []))
      .then(setRows)
      .catch(() => {});
  }, [user]);

  if (rows.length === 0) return null;

  const th = { padding: 6, textAlign: "left", color: "#64748b", fontSize: 12 };
  const td = { padding: 8, fontSize: 13 };

  return (
    <div style={{ background: "#fff", border: "1px solid #e8eaed", borderRadius: 12, padding: "22px 26px", marginBottom: 20 }}>
      <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: "#64748b", margin: "0 0 12px" }}>
        {isTeacher ? "My Exam Invigilation Duty" : "My Exam Timetable"}
      </p>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={th}>Date</th>
              <th style={th}>Time</th>
              {isTeacher && <th style={th}>Batch</th>}
              <th style={th}>Subject</th>
              <th style={th}>{isTeacher ? "Room / Lab" : "Room"}</th>
              {!isTeacher && <th style={th}>Exam</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.exam_id} style={{ borderTop: "1px solid #e8eaed" }}>
                <td style={{ ...td, fontWeight: 600 }}>{prettyDate(r.exam_date)}</td>
                <td style={td}>{fmt12(r.start_time)} – {fmt12(r.end_time)}</td>
                {isTeacher && <td style={td}>{r.batch_name}</td>}
                <td style={td}>{r.subject_name}</td>
                <td style={td}>
                  {r.room_name}
                  {isTeacher && r.room_type ? ` (${r.room_type})` : ""}
                </td>
                {!isTeacher && (
                    <td style={td}>{r.round_label}</td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}