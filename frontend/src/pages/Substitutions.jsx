import { useEffect, useState } from "react";

function Substitutions() {
  const API_URL = "http://127.0.0.1:8000";

  const [substitutions, setSubstitutions] = useState([]);
  const [absences, setAbsences] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [timetables, setTimetables] = useState([]);

  const [absenceId, setAbsenceId] = useState("");
  const [substituteTeacherId, setSubstituteTeacherId] = useState("");
  const [timetableId, setTimetableId] = useState("");
  const [substitutionDate, setSubstitutionDate] = useState("");
  const [status, setStatus] = useState("Pending");

  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(true);

  // =========================
  // ONE-CLICK: MARK ABSENT + AUTO-ASSIGN SUBSTITUTES
  // =========================
  const [autoTeacherId, setAutoTeacherId] = useState("");
  const [autoDate, setAutoDate] = useState("");
  const [autoReason, setAutoReason] = useState("");
  const [autoRunning, setAutoRunning] = useState(false);
  const [autoResult, setAutoResult] = useState(null); // { message, assigned: [], unassigned: [] }

  // ==================== FETCH SUBSTITUTIONS ====================

  const fetchSubstitutions = async () => {
    try {
      setLoading(true);

      const response = await fetch(`${API_URL}/substitutions`);

      if (!response.ok) {
        throw new Error("Failed to fetch substitutions");
      }

      const data = await response.json();
      setSubstitutions(data);
    } catch (error) {
      console.error("Error fetching substitutions:", error);
    } finally {
      setLoading(false);
    }
  };

  // ==================== FETCH ABSENCES ====================

  const fetchAbsences = async () => {
    try {
      const response = await fetch(`${API_URL}/teacher-absences`);

      if (!response.ok) {
        throw new Error("Failed to fetch absences");
      }

      const data = await response.json();
      setAbsences(data);
    } catch (error) {
      console.error("Error fetching absences:", error);
    }
  };

  // ==================== FETCH TEACHERS ====================

  const fetchTeachers = async () => {
    try {
      const response = await fetch(`${API_URL}/teachers`);

      if (!response.ok) {
        throw new Error("Failed to fetch teachers");
      }

      const data = await response.json();
      setTeachers(data);
    } catch (error) {
      console.error("Error fetching teachers:", error);
    }
  };

  // ==================== FETCH TIMETABLES ====================

  const fetchTimetables = async () => {
    try {
      const response = await fetch(`${API_URL}/timetables`);

      if (!response.ok) {
        throw new Error("Failed to fetch timetables");
      }

      const data = await response.json();
      setTimetables(data);
    } catch (error) {
      console.error("Error fetching timetables:", error);
    }
  };

  // ==================== LOAD ALL DATA ====================

  useEffect(() => {
    fetchSubstitutions();
    fetchAbsences();
    fetchTeachers();
    fetchTimetables();
  }, []);

  // ==================== ONE-CLICK AUTO-SUBSTITUTE ====================

  const handleAutoSubstitute = async () => {
    if (!autoTeacherId) {
      alert("Please select which teacher is absent");
      return;
    }

    if (!autoDate) {
      alert("Please select the absence date");
      return;
    }

    try {
      setAutoRunning(true);
      setAutoResult(null);

      const params = new URLSearchParams();
      params.append("teacher_id", autoTeacherId);
      params.append("absence_date", autoDate);
      params.append("reason", autoReason || "Not specified");

      const response = await fetch(
        `${API_URL}/auto-substitute?${params.toString()}`,
        { method: "POST" }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Failed to run auto-substitute");
      }

      setAutoResult(data);

      // Refresh everything downstream so the new records show up.
      await fetchSubstitutions();
      await fetchAbsences();
    } catch (error) {
      console.error("Error running auto-substitute:", error);
      setAutoResult({ error: error.message });
    } finally {
      setAutoRunning(false);
    }
  };

  // Helper: look up a teacher's name by id for display in the results panel
  const teacherName = (id) => {
    const t = teachers.find((tt) => tt.teacher_id === id);
    return t ? t.teacher_name : `Teacher #${id}`;
  };

  // ==================== ADD / UPDATE ====================

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!absenceId) {
      alert("Please select teacher absence");
      return;
    }

    if (!substituteTeacherId) {
      alert("Please select substitute teacher");
      return;
    }

    if (!timetableId) {
      alert("Please select timetable");
      return;
    }

    if (!substitutionDate) {
      alert("Please select substitution date");
      return;
    }

    if (!status) {
      alert("Please select status");
      return;
    }

    try {
      const params = new URLSearchParams();

      params.append("absence_id", absenceId);
      params.append(
        "substitute_teacher_id",
        substituteTeacherId
      );
      params.append("timetable_id", timetableId);
      params.append("substitution_date", substitutionDate);
      params.append("status", status);

      // UPDATE
      if (editingId !== null) {
        const response = await fetch(
          `${API_URL}/substitutions/${editingId}?${params.toString()}`,
          {
            method: "PUT",
          }
        );

        if (!response.ok) {
          const errorData = await response.json();
          console.error("Backend error:", errorData);
          throw new Error("Failed to update substitution");
        }

        alert("Substitution updated successfully");

        resetForm();
        await fetchSubstitutions();

        return;
      }

      // ADD
      const response = await fetch(
        `${API_URL}/substitutions?${params.toString()}`,
        {
          method: "POST",
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        console.error("Backend error:", errorData);
        throw new Error("Failed to create substitution");
      }

      alert("Substitution created successfully");

      resetForm();
      await fetchSubstitutions();
    } catch (error) {
      console.error("Error saving substitution:", error);
      alert("Could not save substitution");
    }
  };

  // ==================== EDIT ====================

  const handleEdit = (substitution) => {
    setEditingId(substitution.substitution_id);

    // Backend GET returns only absence-related information,
    // so IDs are taken from the selected records where possible.

    setSubstitutionDate(
      substitution.substitution_date || ""
    );

    setStatus(substitution.status || "Pending");

    const matchingAbsence = absences.find(
      (absence) =>
        absence.teacher_name === substitution.absent_teacher
    );

    if (matchingAbsence) {
      setAbsenceId(String(matchingAbsence.absence_id));
    }

    const matchingTeacher = teachers.find(
      (teacher) =>
        teacher.teacher_name ===
        substitution.substitute_teacher
    );

    if (matchingTeacher) {
      setSubstituteTeacherId(
        String(matchingTeacher.teacher_id)
      );
    }

    const matchingTimetable = timetables.find(
      (timetable) =>
        timetable.subject_name === substitution.subject_name &&
        timetable.day_of_week === substitution.day_of_week &&
        timetable.start_time === substitution.start_time
    );

    if (matchingTimetable) {
      setTimetableId(
        String(matchingTimetable.timetable_id)
      );
    }
  };

  // ==================== DELETE ====================

  const handleDelete = async (id) => {
    const confirmDelete = window.confirm(
      "Are you sure you want to delete this substitution?"
    );

    if (!confirmDelete) {
      return;
    }

    try {
      const response = await fetch(
        `${API_URL}/substitutions/${id}`,
        {
          method: "DELETE",
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        console.error("Backend error:", errorData);
        throw new Error("Failed to delete substitution");
      }

      alert("Substitution deleted successfully");

      if (editingId === id) {
        resetForm();
      }

      await fetchSubstitutions();
    } catch (error) {
      console.error("Error deleting substitution:", error);
      alert("Could not delete substitution");
    }
  };

  // ==================== RESET ====================

  const resetForm = () => {
    setAbsenceId("");
    setSubstituteTeacherId("");
    setTimetableId("");
    setSubstitutionDate("");
    setStatus("Pending");
    setEditingId(null);
  };

  return (
    <div style={{ padding: "30px" }}>
      <h1>Substitutions</h1>

      <p>Manage teacher substitution records</p>

      {/* =========================
          ONE-CLICK: MARK ABSENT + AUTO-ASSIGN
      ========================== */}
      <div
        style={{
          marginBottom: "30px",
          padding: "20px",
          border: "2px solid #1e293b",
          borderRadius: "8px",
          maxWidth: "650px",
          background: "#f8fafc",
        }}
      >
        <h2 style={{ marginTop: 0 }}>🔄 Auto-Substitute Engine</h2>
        <p style={{ color: "#6b7280", marginTop: "-8px" }}>
          Mark a teacher absent — every affected class that day gets a
          substitute automatically (free + same department + least loaded).
        </p>

        <div
          style={{
            display: "flex",
            gap: "12px",
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <select
            value={autoTeacherId}
            onChange={(e) => setAutoTeacherId(e.target.value)}
            style={{ padding: "10px", minWidth: "200px" }}
          >
            <option value="">Select Absent Teacher</option>
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
            style={{ padding: "10px" }}
          />

          <input
            type="text"
            placeholder="Reason (optional)"
            value={autoReason}
            onChange={(e) => setAutoReason(e.target.value)}
            style={{ padding: "10px", minWidth: "180px" }}
          />

          <button
            onClick={handleAutoSubstitute}
            disabled={autoRunning}
            style={{
              padding: "10px 18px",
              background: autoRunning ? "#94a3b8" : "#1e293b",
              color: "white",
              fontWeight: "600",
              cursor: autoRunning ? "not-allowed" : "pointer",
            }}
          >
            {autoRunning ? "Assigning..." : "⚡ Mark Absent & Auto-Assign"}
          </button>
        </div>

        {/* RESULT */}
        {autoResult && (
          <div style={{ marginTop: "16px" }}>
            {autoResult.error ? (
              <p
                style={{
                  padding: "10px 14px",
                  borderRadius: "6px",
                  background: "#fee2e2",
                  color: "#991b1b",
                  margin: 0,
                }}
              >
                {autoResult.error}
              </p>
            ) : (
              <>
                <p
                  style={{
                    padding: "10px 14px",
                    borderRadius: "6px",
                    background: "#dcfce7",
                    color: "#166534",
                    margin: "0 0 10px",
                  }}
                >
                  {autoResult.message}
                </p>

                {autoResult.assigned && autoResult.assigned.length > 0 && (
                  <div style={{ marginBottom: "10px" }}>
                    <strong>✅ Assigned:</strong>
                    <ul style={{ margin: "6px 0 0", paddingLeft: "20px" }}>
                      {autoResult.assigned.map((a) => (
                        <li key={a.timetable_id}>
                          {a.day_of_week} {a.start_time}–{a.end_time} →{" "}
                          {teacherName(a.substitute_teacher_id)}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {autoResult.unassigned && autoResult.unassigned.length > 0 && (
                  <div>
                    <strong style={{ color: "#991b1b" }}>
                      ⚠️ Needs manual attention:
                    </strong>
                    <ul style={{ margin: "6px 0 0", paddingLeft: "20px" }}>
                      {autoResult.unassigned.map((u) => (
                        <li key={u.timetable_id}>
                          {u.day_of_week} {u.start_time}–{u.end_time} —{" "}
                          {u.reason}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* ==================== FORM (manual override) ==================== */}

      <form
        onSubmit={handleSubmit}
        style={{
          marginBottom: "30px",
          display: "flex",
          flexDirection: "column",
          gap: "12px",
          maxWidth: "500px",
        }}
      >
        <h2>
          {editingId !== null
            ? "Edit Substitution"
            : "Add Substitution (manual)"}
        </h2>
        {/* ABSENCE */}

        <select
          value={absenceId}
          onChange={(e) => setAbsenceId(e.target.value)}
          style={{ padding: "10px" }}
        >
          <option value="">
            Select Teacher Absence
          </option>

          {absences.map((absence) => (
            <option
              key={absence.absence_id}
              value={absence.absence_id}
            >
              {absence.teacher_name} -{" "}
              {absence.absence_date}
            </option>
          ))}
        </select>

        {/* SUBSTITUTE TEACHER */}

        <select
          value={substituteTeacherId}
          onChange={(e) =>
            setSubstituteTeacherId(e.target.value)
          }
          style={{ padding: "10px" }}
        >
          <option value="">
            Select Substitute Teacher
          </option>

          {teachers.map((teacher) => (
            <option
              key={teacher.teacher_id}
              value={teacher.teacher_id}
            >
              {teacher.teacher_name}
            </option>
          ))}
        </select>

        {/* TIMETABLE */}

        <select
          value={timetableId}
          onChange={(e) =>
            setTimetableId(e.target.value)
          }
          style={{ padding: "10px" }}
        >
          <option value="">
            Select Timetable
          </option>

          {timetables.map((timetable) => (
            <option
              key={timetable.timetable_id}
              value={timetable.timetable_id}
            >
              {timetable.day_of_week} -{" "}
              {timetable.subject_name} -{" "}
              {timetable.start_time} to{" "}
              {timetable.end_time}
            </option>
          ))}
        </select>

        {/* DATE */}

        <input
          type="date"
          value={substitutionDate}
          onChange={(e) =>
            setSubstitutionDate(e.target.value)
          }
          style={{ padding: "10px" }}
        />

        {/* STATUS */}

        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          style={{ padding: "10px" }}
        >
          <option value="Pending">Pending</option>
          <option value="Assigned">Assigned</option>
          <option value="Completed">Completed</option>
          <option value="Cancelled">Cancelled</option>
        </select>

        {/* BUTTONS */}

        <div>
          <button
            type="submit"
            style={{ marginRight: "10px" }}
          >
            {editingId !== null
              ? "Update Substitution"
              : "Add Substitution"}
          </button>

          {editingId !== null && (
            <button
              type="button"
              onClick={resetForm}
            >
              Cancel
            </button>
          )}
        </div>
      </form>

      {/* ==================== LIST ==================== */}

      {loading ? (
        <p>Loading substitutions...</p>
      ) : substitutions.length === 0 ? (
        <p>No substitutions found.</p>
      ) : (
        <table
          border="1"
          cellPadding="10"
          style={{
            borderCollapse: "collapse",
            width: "100%",
            maxWidth: "1200px",
          }}
        >
          <thead>
            <tr>
              <th>ID</th>
              <th>Date</th>
              <th>Absent Teacher</th>
              <th>Substitute Teacher</th>
              <th>Subject</th>
              <th>Day</th>
              <th>Time</th>
              <th>Room</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>

          <tbody>
            {substitutions.map((substitution) => (
              <tr
                key={substitution.substitution_id}
              >
                <td>
                  {substitution.substitution_id}
                </td>

                <td>
                  {substitution.substitution_date}
                </td>

                <td>
                  {substitution.absent_teacher}
                </td>

                <td>
                  {substitution.substitute_teacher}
                </td>

                <td>
                  {substitution.subject_name}
                </td>

                <td>
                  {substitution.day_of_week}
                </td>

                <td>
                  {substitution.start_time} -{" "}
                  {substitution.end_time}
                </td>

                <td>
                  {substitution.room_name}
                </td>

                <td>
                  {substitution.status}
                </td>

                <td>
                  <button
                    onClick={() =>
                      handleEdit(substitution)
                    }
                    style={{
                      marginRight: "10px",
                    }}
                  >
                    Edit
                  </button>

                  <button
                    onClick={() =>
                      handleDelete(
                        substitution.substitution_id
                      )
                    }
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
export default Substitutions;