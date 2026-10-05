import { useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext";

const API_URL = "http://127.0.0.1:8000";

const ACCENT = { admin: "#1e293b", teacher: "#2563eb", student: "#7c3aed" };
const ROLE_LABEL = { admin: "Administrator", teacher: "Teacher", student: "Student" };

function initials(name) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] || "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

function Row({ label, value }) {
  return (
    <div
      style={{
        display: "flex", justifyContent: "space-between", gap: 16,
        padding: "13px 0", borderBottom: "1px solid #f1f5f9", fontSize: 14,
      }}
    >
      <span style={{ color: "#64748b" }}>{label}</span>
      <span style={{ fontWeight: 600, color: "#0f172a", textAlign: "right" }}>
        {value === null || value === undefined || value === "" ? "—" : value}
      </span>
    </div>
  );
}

/**
 * <Profile role="admin" /> | <Profile role="teacher" /> | <Profile role="student" />
 * Shows the logged-in person's details and holds the Sign out button.
 */
export default function Profile({ role }) {
  const { user, logout } = useAuth();
  const accent = ACCENT[role] || "#1e293b";

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);

        if (role === "teacher" && user?.teacher_id) {
          const [tRes, dRes, ttRes] = await Promise.all([
            fetch(`${API_URL}/teachers`),
            fetch(`${API_URL}/departments`),
            fetch(`${API_URL}/timetables`),
          ]);
          const teachers = tRes.ok ? await tRes.json() : [];
          const depts = dRes.ok ? await dRes.json() : [];
          const tts = ttRes.ok ? await ttRes.json() : [];

          const me = teachers.find((t) => t.teacher_id === user.teacher_id);
          const dept = depts.find((d) => d.department_id === me?.department_id);
          const myClasses = tts.filter((t) => t.teacher_id === user.teacher_id).length;

          setRows([
            ["Full name", me?.teacher_name || user?.name],
            ["Email", me?.email],
            ["Phone", me?.phone],
            ["Department", dept?.department_name],
            ["Designation", me?.designation],
            ["Classes this week", myClasses],
          ]);
        } else if (role === "student" && user?.student_id) {
          const sRes = await fetch(`${API_URL}/students`);
          const students = sRes.ok ? await sRes.json() : [];
          const me = students.find((s) => s.student_id === user.student_id);

          setRows([
            ["Full name", me?.student_name || user?.name],
            ["Roll number", me?.roll_number],
            ["Email", me?.email],
            ["Department", me?.department_name],
            ["Batch", me?.batch_name],
            ["Semester", me?.semester],
          ]);
        } else {
          setRows([
            ["Full name", user?.name],
            ["Role", ROLE_LABEL.admin],
            ["Email", user?.email],
            ["User ID", user?.user_id],
          ]);
        }
      } catch (e) {
        console.error("Could not load profile:", e);
        setRows([["Full name", user?.name]]);
      } finally {
        setLoading(false);
      }
    })();
  }, [role, user]);

  const handleSignOut = () => {
    logout();
    window.location.href = "/";
  };

  return (
    <div
      style={{
        maxWidth: 640, margin: "0 auto", padding: "32px 24px 64px",
        fontFamily: "'Inter',system-ui,sans-serif", color: "#0f172a",
      }}
    >
      <h1 style={{ margin: "0 0 4px", fontSize: 24, fontWeight: 700, letterSpacing: "-0.4px" }}>
        My Profile
      </h1>
      <p style={{ margin: "0 0 24px", fontSize: 14, color: "#64748b" }}>
        Your account details in SchedAI.
      </p>

      {/* Identity card */}
      <div
        style={{
          background: "#fff", border: "1px solid #e8eaed", borderRadius: 12,
          padding: "24px 28px", marginBottom: 20,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 12 }}>
          <div
            style={{
              width: 64, height: 64, borderRadius: "50%", background: accent,
              color: "#fff", display: "flex", alignItems: "center",
              justifyContent: "center", fontSize: 22, fontWeight: 700,
            }}
          >
            {initials(user?.name)}
          </div>
          <div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{user?.name}</div>
            <span
              style={{
                display: "inline-block", marginTop: 4, padding: "2px 10px",
                borderRadius: 20, fontSize: 12, fontWeight: 600,
                background: accent, color: "#fff",
              }}
            >
              {ROLE_LABEL[role]}
            </span>
          </div>
        </div>

        {loading ? (
          <p style={{ color: "#64748b", fontSize: 14 }}>Loading details…</p>
        ) : (
          <div>
            {rows.map(([label, value]) => (
              <Row key={label} label={label} value={value} />
            ))}
          </div>
        )}
      </div>

      {/* Sign out */}
      <div
        style={{
          background: "#fff", border: "1px solid #e8eaed", borderRadius: 12,
          padding: "20px 28px", display: "flex", alignItems: "center",
          justifyContent: "space-between", gap: 16, flexWrap: "wrap",
        }}
      >
        <div>
          <div style={{ fontWeight: 600, fontSize: 15 }}>Sign out</div>
          <div style={{ fontSize: 13, color: "#64748b", marginTop: 2 }}>
            Sign out of SchedAI on this device.
          </div>
        </div>
        <button
          onClick={handleSignOut}
          style={{
            padding: "10px 20px", borderRadius: 8, border: "1px solid #dc2626",
            background: "#fff", color: "#dc2626", fontWeight: 600,
            fontSize: 14, cursor: "pointer",
          }}
        >
          🚪 Sign out
        </button>
      </div>
    </div>
  );
}