import { useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext";

const API_URL = "http://127.0.0.1:8000";

export default function MyGuideCard() {
  const { user } = useAuth();
  const [data, setData] = useState(null);

  useEffect(() => {
    if (!user?.access_token) return;
    fetch(`${API_URL}/project-guides/me`, {
      headers: { Authorization: `Bearer ${user.access_token}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then(setData)
      .catch(() => {});
  }, [user]);

  // is semester mein project hi nahi hota -> card chhupa do
  if (!data) return null;
  if (!data.assigned && !data.eligible) return null;

  const p = data.project;
  return (
    <div
      style={{
        background: "#ffffff",
        border: "1px solid #e8eaed",
        borderRadius: 12,
        padding: "22px 26px",
        marginBottom: 20,
      }}
    >
      <p
        style={{
          fontSize: 11, fontWeight: 700, letterSpacing: "0.07em",
          textTransform: "uppercase", color: "#64748b", margin: "0 0 10px",
        }}
      >
        My Project Guide {p && `· ${p.project_type === "major" ? "Major" : "Mini"} Project`}
      </p>

      {data.assigned ? (
        <>
          <div style={{ fontSize: 20, fontWeight: 700 }}>👨‍🏫 {p.teacher_name}</div>
          {p.teacher_email && (
            <div style={{ fontSize: 13, color: "#64748b", marginTop: 2 }}>{p.teacher_email}</div>
          )}
          <div style={{ fontSize: 14, marginTop: 12 }}>
            Project: <b>{p.project_title}</b>
          </div>
          <div style={{ fontSize: 13, color: "#64748b", marginTop: 2 }}>
            Status: {p.project_status}
          </div>
        </>
      ) : (
        <div style={{ fontSize: 14, color: "#64748b" }}>{data.message}</div>
      )}
    </div>
  );
}