import { useEffect, useState } from "react";

const API_URL = "http://127.0.0.1:8000";

// seconds since midnight -> "1:20 PM"
function formatTime(seconds) {
  if (seconds === null || seconds === undefined) return "";
  const total = Number(seconds);
  if (Number.isNaN(total)) return "";
  const h24 = Math.floor(total / 3600) % 24;
  const m = Math.floor((total % 3600) / 60);
  return `${h24 % 12 || 12}:${String(m).padStart(2, "0")} ${h24 < 12 ? "AM" : "PM"}`;
}

function todayISODate() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

// ── design tokens ─────────────────────────────────────────────────────────────
const C = {
  surface: "#ffffff",
  border: "#e8eaed",
  text: "#0f172a",
  muted: "#64748b",
  accent: "#1e293b",
  faint: "#f1f5f9",
};

const S = {
  page: {
    padding: "28px 32px 64px",
    maxWidth: 1300,
    margin: "0 auto",
    color: C.text,
    fontFamily: "'Inter',system-ui,sans-serif",
  },
  h1: { margin: 0, fontSize: 26, fontWeight: 700, letterSpacing: "-0.4px" },
  sub: { margin: "4px 0 24px", fontSize: 14, color: C.muted },
  card: {
    background: C.surface,
    border: `1px solid ${C.border}`,
    borderRadius: 12,
    padding: "20px 24px",
    marginBottom: 20,
  },
  cardTitle: { margin: 0, fontSize: 16, fontWeight: 700 },
  cardSub: { margin: "4px 0 14px", fontSize: 13, color: C.muted },
  input: {
    padding: "9px 12px",
    fontSize: 14,
    border: `1px solid ${C.border}`,
    borderRadius: 8,
    background: C.surface,
    color: C.text,
    outline: "none",
    boxSizing: "border-box",
  },
  btnPrimary: {
    padding: "10px 18px",
    background: C.accent,
    color: "#fff",
    border: "none",
    borderRadius: 8,
    fontWeight: 600,
    fontSize: 14,
    cursor: "pointer",
  },
  btnGhost: {
    padding: "8px 14px",
    background: C.surface,
    color: C.accent,
    border: `1px solid ${C.border}`,
    borderRadius: 8,
    fontWeight: 600,
    fontSize: 13,
    cursor: "pointer",
  },
  btnDisabled: { background: "#94a3b8", cursor: "not-allowed" },
  th: {
    padding: "10px 12px",
    textAlign: "left",
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    color: C.muted,
    background: C.faint,
    borderBottom: `1px solid ${C.border}`,
    whiteSpace: "nowrap",
  },
  td: { padding: "11px 12px", fontSize: 14, borderBottom: `1px solid ${C.faint}`, verticalAlign: "top" },
};

function statusBadge(status) {
  const key = (status || "").toLowerCase();
  let style = { bg: "#e2e8f0", color: "#334155" };
  if (["auto-assigned", "assigned", "approved"].includes(key)) style = { bg: "#dcfce7", color: "#166534" };
  else if (key === "pending") style = { bg: "#fef3c7", color: "#92400e" };
  else if (["cancelled", "rejected"].includes(key)) style = { bg: "#fee2e2", color: "#991b1b" };
  else if (key === "completed") style = { bg: "#dbeafe", color: "#1e40af" };

  const label = key === "auto-assigned" ? "Auto-assigned" : status || "—";
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 10px",
        borderRadius: 20,
        fontSize: 12,
        fontWeight: 600,
        background: style.bg,
        color: style.color,
      }}
    >
      {label}
    </span>
  );
}

function Substitutions() {
  const [substitutions, setSubstitutions] = useState([]);
  const [absences, setAbsences] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [timetables, setTimetables] = useState([]);

  // manual form
  const [showManual, setShowManual] = useState(false);
  const [absenceId, setAbsenceId] = useState("");
  const [substituteTeacherId, setSubstituteTeacherId] = useState("");
  const [timetableId, setTimetableId] = useState("");
  const [substitutionDate, setSubstitutionDate] = useState("");
  const [status, setStatus] = useState("Pending");
  const [editingId, setEditingId] = useState(null);

  const [loading, setLoading] = useState(true);

  // auto-substitute
  const [autoTeacherId, setAutoTeacherId] = useState("");
  const [autoDate, setAutoDate] = useState(todayISODate());
  const [autoReason, setAutoReason] = useState("");
  const [autoRunning, setAutoRunning] = useState(false);
  const [autoResult, setAutoResult] = useState(null);

  // ── fetchers ────────────────────────────────────────────────────────────────
  const fetchJson = async (path) => {
    const response = await fetch(`${API_URL}${path}`);
    if (!response.ok) throw new Error(`Failed to fetch ${path}`);
    return response.json();
  };

  const fetchSubstitutions = async () => {
    try {
      setLoading(true);
      setSubstitutions(await fetchJson("/substitutions"));
    } catch (error) {
      console.error("Error fetching substitutions:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSubstitutions();
    fetchJson("/teacher-absences").then(setAbsences).catch(console.error);
    fetchJson("/teachers").then(setTeachers).catch(console.error);
    fetchJson("/timetables").then(setTimetables).catch(console.error);
  }, []);

  // ── auto-substitute ─────────────────────────────────────────────────────────
  const handleAutoSubstitute = async () => {
    if (!autoTeacherId) return alert("Please select which teacher is absent");
    if (!autoDate) return alert("Please select the absence date");

    try {
      setAutoRunning(true);
      setAutoResult(null);

      const params = new URLSearchParams();
      params.append("teacher_id", autoTeacherId);
      params.append("absence_date", autoDate);
      params.append("reason", autoReason || "Not specified");

      const response = await fetch(`${API_URL}/auto-substitute?${params.toString()}`, {
        method: "POST",
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          typeof data.detail === "string" ? data.detail : "Failed to run auto-substitute"
        );
      }

      setAutoResult(data);
      setAutoReason("");

      await fetchSubstitutions();
      fetchJson("/teacher-absences").then(setAbsences).catch(console.error);
    } catch (error) {
      console.error("Error running auto-substitute:", error);
      setAutoResult({ error: error.message });
    } finally {
      setAutoRunning(false);
    }
  };

  // ── manual form ─────────────────────────────────────────────────────────────
  const resetForm = () => {
    setAbsenceId("");
    setSubstituteTeacherId("");
    setTimetableId("");
    setSubstitutionDate("");
    setStatus("Pending");
    setEditingId(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!absenceId) return alert("Please select teacher absence");
    if (!substituteTeacherId) return alert("Please select substitute teacher");
    if (!timetableId) return alert("Please select timetable");
    if (!substitutionDate) return alert("Please select substitution date");
    if (!status) return alert("Please select status");

    try {
      const params = new URLSearchParams();
      params.append("absence_id", absenceId);
      params.append("substitute_teacher_id", substituteTeacherId);
      params.append("timetable_id", timetableId);
      params.append("substitution_date", substitutionDate);
      params.append("status", status);

      const isEdit = editingId !== null;
      const url = isEdit
        ? `${API_URL}/substitutions/${editingId}?${params.toString()}`
        : `${API_URL}/substitutions?${params.toString()}`;

      const response = await fetch(url, { method: isEdit ? "PUT" : "POST" });
      if (!response.ok) {
        console.error("Backend error:", await response.json());
        throw new Error(isEdit ? "Failed to update substitution" : "Failed to create substitution");
      }

      alert(isEdit ? "Substitution updated successfully" : "Substitution created successfully");
      resetForm();
      setShowManual(false);
      await fetchSubstitutions();
    } catch (error) {
      console.error("Error saving substitution:", error);
      alert("Could not save substitution");
    }
  };

  const handleEdit = (sub) => {
    setEditingId(sub.substitution_id);
    setShowManual(true);
    setSubstitutionDate(sub.substitution_date || "");
    setStatus(sub.status || "Pending");

    const absence = absences.find((a) => a.teacher_name === sub.absent_teacher);
    if (absence) setAbsenceId(String(absence.absence_id));

    const teacher = teachers.find((t) => t.teacher_name === sub.substitute_teacher);
    if (teacher) setSubstituteTeacherId(String(teacher.teacher_id));

    const tt = timetables.find(
      (t) =>
        t.subject_name === sub.subject_name &&
        t.day_of_week === sub.day_of_week &&
        t.start_time === sub.start_time
    );
    if (tt) setTimetableId(String(tt.timetable_id));

    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete this substitution?")) return;

    try {
      const response = await fetch(`${API_URL}/substitutions/${id}`, { method: "DELETE" });
      if (!response.ok) {
        console.error("Backend error:", await response.json());
        throw new Error("Failed to delete substitution");
      }
      alert("Substitution deleted successfully");
      if (editingId === id) resetForm();
      await fetchSubstitutions();
    } catch (error) {
      console.error("Error deleting substitution:", error);
      alert("Could not delete substitution");
    }
  };

  // ── page ────────────────────────────────────────────────────────────────────
  return (
    <div style={S.page}>
      <h1 style={S.h1}>Substitutions</h1>
      <p style={S.sub}>
        When a teacher is absent, SchedAI finds a substitute for every affected class. Only that
        day's schedule changes — the weekly timetable stays the same.
      </p>

      {/* ── AUTO-SUBSTITUTE ── */}
      <div style={S.card}>
        <h2 style={S.cardTitle}>🔄 Auto-Substitute</h2>
        <p style={S.cardSub}>
          Picks a teacher who knows the subject, is free at that time, has fewer than 5 classes that
          day, and has the lightest load.
        </p>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <select
            value={autoTeacherId}
            onChange={(e) => setAutoTeacherId(e.target.value)}
            style={{ ...S.input, minWidth: 220 }}
          >
            <option value="">Select absent teacher</option>
            {teachers.map((teacher) => (
              <option key={teacher.teacher_id} value={teacher.teacher_id}>
                {teacher.teacher_name}
              </option>
            ))}
          </select>

          <input
            type="date"
            value={autoDate}
            onChange={(e) => setAutoDate(e.target.value)}
            style={S.input}
          />

          <input
            type="text"
            placeholder="Reason (optional)"
            value={autoReason}
            onChange={(e) => setAutoReason(e.target.value)}
            style={{ ...S.input, minWidth: 200 }}
          />

          <button
            onClick={handleAutoSubstitute}
            disabled={autoRunning}
            style={{ ...S.btnPrimary, ...(autoRunning ? S.btnDisabled : {}) }}
          >
            {autoRunning ? "Assigning…" : "⚡ Mark Absent & Auto-Assign"}
          </button>
        </div>

        {autoResult && (
          <div style={{ marginTop: 18 }}>
            {autoResult.error ? (
              <div
                style={{
                  padding: "10px 14px",
                  borderRadius: 8,
                  background: "#fee2e2",
                  color: "#991b1b",
                  fontSize: 14,
                }}
              >
                {autoResult.error}
              </div>
            ) : (
              <>
                <div
                  style={{
                    padding: "10px 14px",
                    borderRadius: 8,
                    background: "#dcfce7",
                    color: "#166534",
                    fontSize: 14,
                    fontWeight: 600,
                    marginBottom: 12,
                  }}
                >
                  ✓ {autoResult.message}
                </div>

                {autoResult.assigned?.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
                    {autoResult.assigned.map((a) => (
                      <div
                        key={a.timetable_id}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          flexWrap: "wrap",
                          gap: 8,
                          padding: "10px 14px",
                          background: C.faint,
                          borderLeft: "3px solid #16a34a",
                          borderRadius: 8,
                          fontSize: 14,
                        }}
                      >
                        <div>
                          <strong>{a.subject_name || "Class"}</strong>
                          <span style={{ color: C.muted }}>
                            {" "}
                            · {a.day_of_week} · {a.start_label || a.start_time}
                          </span>
                        </div>
                        <div>
                          → <strong>{a.substitute_teacher_name}</strong>
                          {a.match === "department" && (
                            <span
                              title="No teacher with this exact subject skill was free, so a teacher from the same department was chosen."
                              style={{
                                marginLeft: 8,
                                padding: "1px 8px",
                                borderRadius: 20,
                                fontSize: 11,
                                fontWeight: 600,
                                background: "#fef3c7",
                                color: "#92400e",
                              }}
                            >
                              same department
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {autoResult.unassigned?.length > 0 && (
                  <div>
                    <div style={{ fontWeight: 700, color: "#991b1b", fontSize: 14, marginBottom: 8 }}>
                      ⚠️ Needs manual attention
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {autoResult.unassigned.map((u) => (
                        <div
                          key={u.timetable_id}
                          style={{
                            padding: "10px 14px",
                            background: "#fef2f2",
                            borderLeft: "3px solid #dc2626",
                            borderRadius: 8,
                            fontSize: 14,
                          }}
                        >
                          <strong>
                            {u.day_of_week} · {u.start_label || u.start_time}
                          </strong>
                          <span style={{ color: C.muted }}> — {u.reason}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* ── MANUAL ADD / EDIT (collapsed) ── */}
      <div style={S.card}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div>
            <h2 style={S.cardTitle}>
              {editingId !== null ? "✏️ Edit substitution" : "➕ Add a substitution manually"}
            </h2>
            <p style={{ ...S.cardSub, margin: "4px 0 0" }}>
              Optional — use this to override what the auto-substitute chose.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              if (showManual && editingId !== null) resetForm();
              setShowManual(!showManual);
            }}
            style={S.btnGhost}
          >
            {showManual ? "Hide form" : "Show form"}
          </button>
        </div>

        {showManual && (
          <form
            onSubmit={handleSubmit}
            style={{
              marginTop: 18,
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
              gap: 14,
            }}
          >
            <select value={absenceId} onChange={(e) => setAbsenceId(e.target.value)} style={S.input}>
              <option value="">Select teacher absence</option>
              {absences.map((absence) => (
                <option key={absence.absence_id} value={absence.absence_id}>
                  {absence.teacher_name} — {String(absence.absence_date).substring(0, 10)}
                </option>
              ))}
            </select>

            <select
              value={substituteTeacherId}
              onChange={(e) => setSubstituteTeacherId(e.target.value)}
              style={S.input}
            >
              <option value="">Select substitute teacher</option>
              {teachers.map((teacher) => (
                <option key={teacher.teacher_id} value={teacher.teacher_id}>
                  {teacher.teacher_name}
                </option>
              ))}
            </select>

            <select value={timetableId} onChange={(e) => setTimetableId(e.target.value)} style={S.input}>
              <option value="">Select class</option>
              {timetables.map((t) => (
                <option key={t.timetable_id} value={t.timetable_id}>
                  {t.day_of_week} · {t.subject_name} · {formatTime(t.start_time)}
                  {t.batch_name ? ` · ${t.batch_name}` : ""}
                </option>
              ))}
            </select>

            <input
              type="date"
              value={substitutionDate}
              onChange={(e) => setSubstitutionDate(e.target.value)}
              style={S.input}
            />

            <select value={status} onChange={(e) => setStatus(e.target.value)} style={S.input}>
              <option value="Pending">Pending</option>
              <option value="Assigned">Assigned</option>
              <option value="Completed">Completed</option>
              <option value="Cancelled">Cancelled</option>
            </select>

            <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
              <button type="submit" style={S.btnPrimary}>
                {editingId !== null ? "Update" : "Add"}
              </button>
              {editingId !== null && (
                <button
                  type="button"
                  onClick={() => {
                    resetForm();
                    setShowManual(false);
                  }}
                  style={S.btnGhost}
                >
                  Cancel
                </button>
              )}
            </div>
          </form>
        )}
      </div>

      {/* ── RECORDS ── */}
      <div style={S.card}>
        <h2 style={{ ...S.cardTitle, marginBottom: 14 }}>Substitution records</h2>

        {loading ? (
          <p style={{ color: C.muted, margin: 0 }}>Loading substitutions…</p>
        ) : substitutions.length === 0 ? (
          <p style={{ color: C.muted, margin: 0 }}>No substitutions yet.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 900 }}>
              <thead>
                <tr>
                  <th style={S.th}>Date</th>
                  <th style={S.th}>Absent teacher</th>
                  <th style={S.th}>Substitute</th>
                  <th style={S.th}>Class</th>
                  <th style={S.th}>Time</th>
                  <th style={S.th}>Room</th>
                  <th style={S.th}>Status</th>
                  <th style={S.th}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {substitutions.map((sub) => (
                  <tr key={sub.substitution_id}>
                    <td style={{ ...S.td, whiteSpace: "nowrap" }}>
                      <div style={{ fontWeight: 600 }}>{sub.substitution_date}</div>
                      <div style={{ fontSize: 12, color: C.muted }}>{sub.day_of_week}</div>
                    </td>
                    <td style={S.td}>{sub.absent_teacher}</td>
                    <td style={{ ...S.td, fontWeight: 600 }}>{sub.substitute_teacher}</td>
                    <td style={S.td}>{sub.subject_name}</td>
                    <td style={{ ...S.td, whiteSpace: "nowrap" }}>
                      {sub.start_label || formatTime(sub.start_time)} –{" "}
                      {sub.end_label || formatTime(sub.end_time)}
                    </td>
                    <td style={S.td}>{sub.room_name}</td>
                    <td style={S.td}>{statusBadge(sub.status)}</td>
                    <td style={{ ...S.td, whiteSpace: "nowrap" }}>
                      <button
                        onClick={() => handleEdit(sub)}
                        style={{ ...S.btnGhost, padding: "5px 10px", marginRight: 6 }}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(sub.substitution_id)}
                        style={{
                          ...S.btnGhost,
                          padding: "5px 10px",
                          color: "#dc2626",
                          borderColor: "#fecaca",
                        }}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default Substitutions;