import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

const API_URL = "http://127.0.0.1:8000";

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
    maxWidth: 1100,
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
  label: { display: "block", fontSize: 13, fontWeight: 600, color: C.muted, marginBottom: 4 },
  input: {
    width: "100%",
    padding: "9px 12px",
    fontSize: 14,
    border: `1px solid ${C.border}`,
    borderRadius: 8,
    background: C.surface,
    color: C.text,
    outline: "none",
    boxSizing: "border-box",
    fontFamily: "inherit",
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

function TeacherAbsences() {
  const [absences, setAbsences] = useState([]);
  const [teachers, setTeachers] = useState([]);

  const [teacherId, setTeacherId] = useState("");
  const [absenceDate, setAbsenceDate] = useState("");
  const [reason, setReason] = useState("");

  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchAbsences = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_URL}/teacher-absences`);
      if (!response.ok) throw new Error("Failed to fetch teacher absences");
      setAbsences(await response.json());
    } catch (error) {
      console.error("Error fetching absences:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchTeachers = async () => {
    try {
      const response = await fetch(`${API_URL}/teachers`);
      if (!response.ok) throw new Error("Failed to fetch teachers");
      setTeachers(await response.json());
    } catch (error) {
      console.error("Error fetching teachers:", error);
    }
  };

  useEffect(() => {
    fetchAbsences();
    fetchTeachers();
  }, []);

  const resetForm = () => {
    setTeacherId("");
    setAbsenceDate("");
    setReason("");
    setEditingId(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!teacherId) return alert("Please select a teacher");
    if (!absenceDate) return alert("Please select an absence date");
    if (!reason.trim()) return alert("Please enter the reason for absence");

    try {
      const params = new URLSearchParams();
      params.append("teacher_id", teacherId);
      params.append("absence_date", absenceDate);
      params.append("reason", reason.trim());

      const isEdit = editingId !== null;
      const url = isEdit
        ? `${API_URL}/teacher-absences/${editingId}?${params.toString()}`
        : `${API_URL}/teacher-absences?${params.toString()}`;

      const response = await fetch(url, { method: isEdit ? "PUT" : "POST" });
      if (!response.ok) {
        console.error("Backend error:", await response.json());
        throw new Error(isEdit ? "Failed to update absence" : "Failed to add absence");
      }

      alert(isEdit ? "Teacher absence updated successfully" : "Teacher absence added successfully");
      resetForm();
      await fetchAbsences();
    } catch (error) {
      console.error("Error saving absence:", error);
      alert("Could not save teacher absence");
    }
  };

  const handleEdit = (absence) => {
    setEditingId(absence.absence_id);
    setTeacherId(
      absence.teacher_id !== null && absence.teacher_id !== undefined
        ? String(absence.teacher_id)
        : ""
    );
    setAbsenceDate(absence.absence_date ? String(absence.absence_date).substring(0, 10) : "");
    setReason(absence.reason || "");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete this teacher absence?")) return;

    try {
      const response = await fetch(`${API_URL}/teacher-absences/${id}`, { method: "DELETE" });
      if (!response.ok) {
        console.error("Backend error:", await response.json());
        throw new Error("Failed to delete absence");
      }
      alert("Teacher absence deleted successfully");
      if (editingId === id) resetForm();
      await fetchAbsences();
    } catch (error) {
      console.error("Error deleting absence:", error);
      alert("Could not delete teacher absence");
    }
  };

  return (
    <div style={S.page}>
      <h1 style={S.h1}>Teacher Absences</h1>
      <p style={S.sub}>Record and manage teacher absence information.</p>

      {/* hint: this page only records an absence */}
      <div
        style={{
          padding: "12px 16px",
          marginBottom: 20,
          background: "#eff6ff",
          border: "1px solid #bfdbfe",
          borderRadius: 10,
          color: "#1e40af",
          fontSize: 14,
        }}
      >
        ℹ️ Adding an absence here only <b>records</b> it. To also find substitutes for the affected
        classes automatically, use{" "}
        <Link to="/admin/substitutions" style={{ color: "#1d4ed8", fontWeight: 600 }}>
          Substitutions → Auto-Substitute
        </Link>
        .
      </div>

      {/* ── FORM ── */}
      <form onSubmit={handleSubmit} style={S.card}>
        <h2 style={{ ...S.cardTitle, marginBottom: 16 }}>
          {editingId !== null ? "✏️ Edit absence" : "➕ Add absence"}
        </h2>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: 16,
          }}
        >
          <div>
            <label style={S.label}>Teacher</label>
            <select value={teacherId} onChange={(e) => setTeacherId(e.target.value)} style={S.input}>
              <option value="">Select teacher</option>
              {teachers.map((teacher) => (
                <option key={teacher.teacher_id} value={teacher.teacher_id}>
                  {teacher.teacher_name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={S.label}>Absence date</label>
            <input
              type="date"
              value={absenceDate}
              onChange={(e) => setAbsenceDate(e.target.value)}
              style={S.input}
            />
          </div>
        </div>

        <div style={{ marginTop: 16 }}>
          <label style={S.label}>Reason</label>
          <textarea
            placeholder="Enter reason for absence"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows="3"
            style={{ ...S.input, resize: "vertical" }}
          />
        </div>

        <div style={{ marginTop: 16, display: "flex", gap: 10 }}>
          <button type="submit" style={S.btnPrimary}>
            {editingId !== null ? "Update absence" : "Add absence"}
          </button>
          {editingId !== null && (
            <button type="button" onClick={resetForm} style={S.btnGhost}>
              Cancel
            </button>
          )}
        </div>
      </form>

      {/* ── RECORDS ── */}
      <div style={S.card}>
        <h2 style={{ ...S.cardTitle, marginBottom: 14 }}>Absence records</h2>

        {loading ? (
          <p style={{ color: C.muted, margin: 0 }}>Loading teacher absences…</p>
        ) : absences.length === 0 ? (
          <p style={{ color: C.muted, margin: 0 }}>No teacher absences found.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 600 }}>
              <thead>
                <tr>
                  <th style={S.th}>Teacher</th>
                  <th style={S.th}>Date</th>
                  <th style={S.th}>Reason</th>
                  <th style={S.th}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {absences.map((absence) => (
                  <tr key={absence.absence_id}>
                    <td style={{ ...S.td, fontWeight: 600 }}>
                      {absence.teacher_name || "Unknown teacher"}
                    </td>
                    <td style={{ ...S.td, whiteSpace: "nowrap" }}>
                      {absence.absence_date ? String(absence.absence_date).substring(0, 10) : "—"}
                    </td>
                    <td style={{ ...S.td, color: C.muted }}>{absence.reason || "—"}</td>
                    <td style={{ ...S.td, whiteSpace: "nowrap" }}>
                      <button
                        onClick={() => handleEdit(absence)}
                        style={{ ...S.btnGhost, padding: "5px 10px", marginRight: 6 }}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(absence.absence_id)}
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

export default TeacherAbsences;