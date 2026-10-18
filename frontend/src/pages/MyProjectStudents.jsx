import { useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext";

const API_URL = "http://127.0.0.1:8000";

export default function MyProjectStudents() {
  const { user } = useAuth();
  const [rows, setRows] = useState([]);

  const headers = {
    Authorization: `Bearer ${user?.access_token}`,
    "Content-Type": "application/json",
  };

  const load = () => {
    if (!user?.access_token) return;
    fetch(`${API_URL}/project-guides/my-students`, { headers })
      .then((r) => (r.ok ? r.json() : []))
      .then(setRows)
      .catch(() => {});
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line
  }, [user]);

  const save = async (row, patch) => {
    await fetch(`${API_URL}/project-guides/${row.project_id}/details`, {
      method: "PUT",
      headers,
      body: JSON.stringify(patch),
    });
    load();
  };

  // teacher ke paas koi project student nahi -> card chhupa do
  if (rows.length === 0) return null;

  const byBatch = {};
  rows.forEach((r) => {
    const key = r.batch_name || "Batch";
    (byBatch[key] = byBatch[key] || []).push(r);
  });

  return (
    <div
      style={{
        background: "#ffffff",
        border: "1px solid #e8eaed",
        borderRadius: 12,
        padding: "24px 28px",
        marginBottom: 24,
      }}
    >
      <p
        style={{
          fontSize: 11, fontWeight: 700, letterSpacing: "0.08em",
          textTransform: "uppercase", color: "#64748b", margin: "0 0 12px",
        }}
      >
        My Project Students ({rows.length})
      </p>

      {Object.keys(byBatch).map((batch) => (
        <div key={batch} style={{ marginTop: 14 }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>
            {batch} · {byBatch[batch][0].project_type === "major" ? "Major" : "Mini"} ·{" "}
            {byBatch[batch].length} student(s)
          </div>
          <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse", marginTop: 6 }}>
            <tbody>
              {byBatch[batch].map((r) => (
                <tr key={r.project_id} style={{ borderTop: "1px solid #e8eaed" }}>
                  <td style={{ padding: 6, whiteSpace: "nowrap" }}>{r.roll_number}</td>
                  <td style={{ padding: 6 }}>{r.student_name}</td>
                  <td style={{ padding: 6 }}>
                    <input
                      defaultValue={r.project_title}
                      onBlur={(e) =>
                        e.target.value !== r.project_title &&
                        save(r, { project_title: e.target.value })
                      }
                      style={{ width: "100%", padding: 5, boxSizing: "border-box" }}
                    />
                  </td>
                  <td style={{ padding: 6 }}>
                    <select
                      value={r.project_status}
                      onChange={(e) => save(r, { project_status: e.target.value })}
                    >
                      <option>Assigned</option>
                      <option>In Progress</option>
                      <option>Completed</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}