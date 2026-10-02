import { useEffect, useState } from "react";
function TeacherAbsences() {
  const [absences, setAbsences] = useState([]);
  const [teachers, setTeachers] = useState([]);

  const [teacherId, setTeacherId] = useState("");
  const [absenceDate, setAbsenceDate] = useState("");
  const [reason, setReason] = useState("");

  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(true);

  const API_URL = "http://127.0.0.1:8000";

  // =========================
  // FETCH ABSENCES
  // =========================
  const fetchAbsences = async () => {
    try {
      setLoading(true);

      const response = await fetch(
        `${API_URL}/teacher-absences`
      );

      if (!response.ok) {
        throw new Error(
          "Failed to fetch teacher absences"
        );
      }

      const data = await response.json();

      setAbsences(data);
    } catch (error) {
      console.error(
        "Error fetching absences:",
        error
      );
    } finally {
      setLoading(false);
    }
  };

  // =========================
  // FETCH TEACHERS
  // =========================
  const fetchTeachers = async () => {
    try {
      const response = await fetch(
        `${API_URL}/teachers`
      );

      if (!response.ok) {
        throw new Error(
          "Failed to fetch teachers"
        );
      }

      const data = await response.json();

      setTeachers(data);
    } catch (error) {
      console.error(
        "Error fetching teachers:",
        error
      );
    }
  };

  // =========================
  // LOAD DATA
  // =========================
  useEffect(() => {
    fetchAbsences();
    fetchTeachers();
  }, []);

  // =========================
  // ADD / UPDATE
  // =========================
  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!teacherId) {
      alert("Please select a teacher");
      return;
    }

    if (!absenceDate) {
      alert("Please select an absence date");
      return;
    }

    if (!reason.trim()) {
      alert("Please enter the reason for absence");
      return;
    }

    try {
      const params = new URLSearchParams();

      params.append("teacher_id", teacherId);
      params.append("absence_date", absenceDate);
      params.append("reason", reason.trim());

      // =========================
      // UPDATE
      // =========================
      if (editingId !== null) {
        const response = await fetch(
          `${API_URL}/teacher-absences/${editingId}?${params.toString()}`,
          {
            method: "PUT",
          }
        );

        if (!response.ok) {
          const errorData = await response.json();

          console.error(
            "Backend error:",
            errorData
          );

          throw new Error(
            "Failed to update absence"
          );
        }

        alert(
          "Teacher absence updated successfully"
        );

        resetForm();

        await fetchAbsences();

        return;
      }

      // =========================
      // ADD
      // =========================
      const response = await fetch(
        `${API_URL}/teacher-absences?${params.toString()}`,
        {
          method: "POST",
        }
      );

      if (!response.ok) {
        const errorData = await response.json();

        console.error(
          "Backend error:",
          errorData
        );

        throw new Error(
          "Failed to add absence"
        );
      }

      alert(
        "Teacher absence added successfully"
      );

      resetForm();

      await fetchAbsences();
    } catch (error) {
      console.error(
        "Error saving absence:",
        error
      );

      alert(
        "Could not save teacher absence"
      );
    }
  };

  // =========================
  // EDIT
  // =========================
  const handleEdit = (absence) => {
    setEditingId(absence.absence_id);

    setTeacherId(
      absence.teacher_id !== null &&
        absence.teacher_id !== undefined
        ? String(absence.teacher_id)
        : ""
    );

    // Convert date safely
    setAbsenceDate(
      absence.absence_date
        ? String(absence.absence_date).substring(
            0,
            10
          )
        : ""
    );

    setReason(absence.reason || "");

    // Scroll to form
    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  };

  // =========================
  // DELETE
  // =========================
  const handleDelete = async (id) => {
    const confirmDelete = window.confirm(
      "Are you sure you want to delete this teacher absence?"
    );

    if (!confirmDelete) {
      return;
    }

    try {
      const response = await fetch(
        `${API_URL}/teacher-absences/${id}`,
        {
          method: "DELETE",
        }
      );

      if (!response.ok) {
        const errorData = await response.json();

        console.error(
          "Backend error:",
          errorData
        );

        throw new Error(
          "Failed to delete absence"
        );
      }

      alert(
        "Teacher absence deleted successfully"
      );

      if (editingId === id) {
        resetForm();
      }

      await fetchAbsences();
    } catch (error) {
      console.error(
        "Error deleting absence:",
        error
      );

      alert(
        "Could not delete teacher absence"
      );
    }
  };

  // =========================
  // RESET
  // =========================
  const resetForm = () => {
    setTeacherId("");
    setAbsenceDate("");
    setReason("");
    setEditingId(null);
  };

  return (
    <div
      style={{
        padding: "30px",
        maxWidth: "1200px",
        margin: "0 auto",
      }}
    >
      <h1>Teacher Absences</h1>

      <p>
        Record and manage teacher absence
        information.
      </p>

      {/* =========================
          FORM
      ========================== */}
      <form
        onSubmit={handleSubmit}
        style={{
          marginBottom: "40px",
          padding: "20px",
          border: "1px solid #ddd",
          borderRadius: "8px",
          maxWidth: "500px",
          display: "flex",
          flexDirection: "column",
          gap: "14px",
        }}
      >
        <h2>
          {editingId !== null
            ? "Edit Teacher Absence"
            : "Add Teacher Absence"}
        </h2>

        {/* TEACHER */}
        <label>
          Teacher
        </label>

        <select
          value={teacherId}
          onChange={(e) =>
            setTeacherId(e.target.value)
          }
          style={{
            padding: "10px",
          }}
        >
          <option value="">
            Select Teacher
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

        {/* DATE */}
        <label>
          Absence Date
        </label>

        <input
          type="date"
          value={absenceDate}
          onChange={(e) =>
            setAbsenceDate(e.target.value)
          }
          style={{
            padding: "10px",
          }}
        />

        {/* REASON */}
        <label>
          Reason
        </label>

        <textarea
          placeholder="Enter reason for absence"
          value={reason}
          onChange={(e) =>
            setReason(e.target.value)
          }
          rows="4"
          style={{
            padding: "10px",
            resize: "vertical",
          }}
        />

        {/* BUTTONS */}
        <div>
          <button
            type="submit"
            style={{
              marginRight: "10px",
              padding: "10px 16px",
            }}
          >
            {editingId !== null
              ? "Update Absence"
              : "Add Absence"}
          </button>

          {editingId !== null && (
            <button
              type="button"
              onClick={resetForm}
              style={{
                padding: "10px 16px",
              }}
            >
              Cancel
            </button>
          )}
        </div>
      </form>

      {/* =========================
          LIST
      ========================== */}
      <h2>Absence Records</h2>

      {loading ? (
        <p>Loading teacher absences...</p>
      ) : absences.length === 0 ? (
        <p>No teacher absences found.</p>
      ) : (
        <div
          style={{
            overflowX: "auto",
          }}
        >
          <table
            border="1"
            cellPadding="10"
            style={{
              borderCollapse: "collapse",
              width: "100%",
              minWidth: "800px",
            }}
          >
            <thead>
              <tr>
                <th>ID</th>
                <th>Teacher</th>
                <th>Absence Date</th>
                <th>Reason</th>
                <th>Actions</th>
              </tr>
            </thead>

            <tbody>
              {absences.map((absence) => (
                <tr
                  key={absence.absence_id}
                >
                  <td>
                    {absence.absence_id}
                  </td>

                  <td>
                    {absence.teacher_name ||
                      "Unknown Teacher"}
                  </td>

                  <td>
                    {absence.absence_date
                      ? String(
                          absence.absence_date
                        ).substring(0, 10)
                      : "-"}
                  </td>

                  <td>
                    {absence.reason || "-"}
                  </td>

                  <td>
                    <button
                      onClick={() =>
                        handleEdit(absence)
                      }
                      style={{
                        marginRight: "8px",
                      }}
                    >
                      Edit
                    </button>

                    <button
                      onClick={() =>
                        handleDelete(
                          absence.absence_id
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
        </div>
      )}
    </div>
  );
}

export default TeacherAbsences;

