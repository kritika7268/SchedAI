import { useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext";

const API_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

const C = {
  surface: "#ffffff", border: "#e8eaed", text: "#0f172a", muted: "#64748b",
  accent: "#1e293b", faint: "#f1f5f9", ok: "#16a34a", warn: "#d97706",
};

const card = { background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: "18px 22px", marginBottom: 20 };
const btn = (bg, color = "#fff") => ({
  padding: "8px 14px", background: bg, color, border: "none", borderRadius: 8,
  fontWeight: 600, fontSize: 13, cursor: "pointer",
});

function ProjectGuides() {
  const { user } = useAuth();
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(null);
  const [open, setOpen] = useState({});

  const api = async (path, options = {}) => {
    const res = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: { Authorization: `Bearer ${user?.access_token}`, "Content-Type": "application/json" },
    });
    let data = null;
    try { data = await res.json(); } catch (e) { /* no body */ }
    if (!res.ok) throw new Error(typeof data?.detail === "string" ? data.detail : "Something went wrong.");
    return data;
  };

  const load = async () => {
    try {
      setBatches(await api("/project-guides/overview"));
    } catch (e) {
      setMsg({ type: "error", text: e.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const allocate = async (batch, reset) => {
    if (reset && !window.confirm(
      `All students of ${batch.batch_name} will be redistributed equally. Guides may change (project titles are kept). Continue?`)) return;
    try {
      setBusy(batch.batch_id); setMsg(null);
      const r = await api("/project-guides/auto-allocate", {
        method: "POST", body: JSON.stringify({ batch_id: batch.batch_id, reset }),
      });
      setMsg({ type: "ok", text: `${batch.batch_name}: ${r.assigned_now} student(s) assigned.` });
      await load();
    } catch (e) {
      setMsg({ type: "error", text: e.message });
    } finally { setBusy(null); }
  };

  const reassign = async (projectId, guideId) => {
    try {
      setMsg(null);
      await api(`/project-guides/${projectId}/guide`, {
        method: "PUT", body: JSON.stringify({ guide_teacher_id: Number(guideId) }),
      });
      await load();
    } catch (e) { setMsg({ type: "error", text: e.message }); }
  };

  if (loading) return <div style={{ padding: 30 }}>Loading project guides…</div>;

  return (
    <div style={{ padding: "28px 32px 64px", maxWidth: 1100, margin: "0 auto", color: C.text }}>
      <h1 style={{ margin: 0, fontSize: 26 }}>Project Guides</h1>
      <p style={{ margin: "4px 0 22px", fontSize: 14, color: C.muted }}>
        BCA Semester 5 (Mini Project) and BCA Semester 6 (Major Project). Students are distributed equally among the guide teachers.
      </p>

      {msg && (
        <div style={{
          padding: "10px 14px", marginBottom: 16, borderRadius: 8, fontSize: 14,
          background: msg.type === "ok" ? "#dcfce7" : "#fee2e2",
          color: msg.type === "ok" ? "#166534" : "#991b1b",
        }}>{msg.text}</div>
      )}

      {batches.length === 0 && (
        <div style={{ ...card, color: C.muted }}>
          No eligible batch found. The batch name must start with "BCA" and the semester must be 5 or 6.
        </div>
      )}

      {batches.length === 1 && (
        <div style={{ ...card, color: C.warn, fontSize: 13 }}>
          Only one eligible batch found. If you expected both Semester 5 and Semester 6, add the missing batch on the Batches page.
        </div>
      )}

      {batches.map((b) => (
        <div key={b.batch_id} style={card}>
          <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 700 }}>
                {b.batch_name}{" "}
                <span style={{
                  fontSize: 11, padding: "3px 9px", borderRadius: 20, marginLeft: 6,
                  background: b.project_type === "major" ? "#ede9fe" : "#dbeafe",
                  color: b.project_type === "major" ? "#6d28d9" : "#1d4ed8",
                }}>
                  {b.project_type === "major" ? "MAJOR PROJECT" : "MINI PROJECT"}
                </span>
              </div>
              <div style={{ fontSize: 13, color: C.muted, marginTop: 3 }}>
                Semester {b.semester} · {b.assigned}/{b.total_students} students assigned · {b.eligible_guides.length} guides
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              {b.unassigned.length > 0 && (
                <button style={btn(C.accent)} disabled={busy === b.batch_id} onClick={() => allocate(b, false)}>
                  {busy === b.batch_id ? "Assigning…" : `Assign ${b.unassigned.length} student(s) equally`}
                </button>
              )}
              {b.assigned > 0 && (
                <button style={btn(C.faint, C.accent)} disabled={busy === b.batch_id} onClick={() => allocate(b, true)}>
                  Re-balance
                </button>
              )}
            </div>
          </div>

          {b.total_students === 0 && (
            <p style={{ fontSize: 13, color: C.warn, marginTop: 14 }}>
              This batch has no students yet. Add students from the Students page first.
            </p>
          )}

          <div style={{ marginTop: 16, display: "grid", gap: 10 }}>
            {b.guides.map((g) => {
              const key = `${b.batch_id}-${g.teacher_id}`;
              const pct = b.total_students ? (g.count * 100) / b.total_students : 0;
              return (
                <div key={key} style={{ border: `1px solid ${g.not_eligible ? C.warn : C.border}`, borderRadius: 10, padding: "12px 16px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>
                      👨‍🏫 {g.teacher_name} <span style={{ color: C.muted, fontWeight: 400 }}>· {g.count} student(s)</span>
                      {g.not_eligible && (
                        <span style={{ color: C.warn, fontWeight: 400, fontSize: 12 }}> · no longer a guide (use Re-balance)</span>
                      )}
                    </div>
                    <button style={btn(C.faint, C.accent)} onClick={() => setOpen({ ...open, [key]: !open[key] })}>
                      {open[key] ? "Hide ▲" : "Show students ▼"}
                    </button>
                  </div>
                  <div style={{ height: 6, background: "#e2e8f0", borderRadius: 6, marginTop: 8 }}>
                    <div style={{ width: `${pct}%`, height: "100%", background: C.ok, borderRadius: 6 }} />
                  </div>

                  {open[key] && (
                    <table style={{ width: "100%", marginTop: 12, fontSize: 13, borderCollapse: "collapse" }}>
                      <thead>
                        <tr style={{ textAlign: "left", color: C.muted }}>
                          <th style={{ padding: 6 }}>Roll</th><th>Student</th><th>Project title</th><th>Change guide</th>
                        </tr>
                      </thead>
                      <tbody>
                        {g.students.map((s) => (
                          <tr key={s.student_id} style={{ borderTop: `1px solid ${C.border}` }}>
                            <td style={{ padding: 6 }}>{s.roll_number}</td>
                            <td>{s.student_name}</td>
                            <td>{s.project_title}</td>
                            <td>
                              <select value={g.teacher_id} onChange={(e) => reassign(s.project_id, e.target.value)}>
                                {g.not_eligible && (
                                  <option value={g.teacher_id} disabled>{g.teacher_name}</option>
                                )}
                                {b.eligible_guides.map((t) => (
                                  <option key={t.teacher_id} value={t.teacher_id}>{t.teacher_name}</option>
                                ))}
                              </select>
                            </td>
                          </tr>
                        ))}
                        {g.students.length === 0 && (
                          <tr><td colSpan={4} style={{ padding: 8, color: C.muted }}>No students.</td></tr>
                        )}
                      </tbody>
                    </table>
                  )}
                </div>
              );
            })}
          </div>

          {b.unassigned.length > 0 && (
            <p style={{ fontSize: 13, color: C.warn, marginTop: 14 }}>
              Without a guide: {b.unassigned.map((s) => s.student_name).join(", ")}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

export default ProjectGuides;