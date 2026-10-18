import { useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext";

const API_URL = "http://127.0.0.1:8000";

export function useExamWeek() {
  const { user } = useAuth();
  const [week, setWeek] = useState(null);

  useEffect(() => {
    if (!user?.access_token) return;
    fetch(`${API_URL}/exams/week-status`, {
      headers: { Authorization: `Bearer ${user.access_token}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then(setWeek)
      .catch(() => {});
  }, [user]);

  return week;
}

export function ExamWeekBanner({ week }) {
  if (!week?.active) return null;
  return (
    <div
      style={{
        background: "#fef3c7", border: "1px solid #d97706", color: "#92400e",
        borderRadius: 10, padding: "12px 16px", marginBottom: 20, fontSize: 14, fontWeight: 600,
      }}
    >
      📝 Exam week ({week.week_start} to {week.week_end}): regular classes are suspended.
    </div>
  );
}