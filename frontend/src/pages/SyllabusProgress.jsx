import { useEffect, useState } from "react";

function SyllabusProgress() {
  const API_URL = "http://127.0.0.1:8000";

  const [progress, setProgress] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [teachers, setTeachers] = useState([]);

  const [subjectId, setSubjectId] = useState("");
  const [teacherId, setTeacherId] = useState("");
  const [semester, setSemester] = useState("");
  const [totalUnits, setTotalUnits] = useState("");
  const [completedUnits, setCompletedUnits] = useState("");
  const [lastUpdated, setLastUpdated] = useState("");

  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(true);

  // ==================== FETCH PROGRESS ====================

  const fetchProgress = async () => {
    try {
      setLoading(true);

      const response = await fetch(
        `${API_URL}/syllabus-progress`
      );

      if (!response.ok) {
        throw new Error("Failed to fetch syllabus progress");
      }

      const data = await response.json();
      setProgress(data);
    } catch (error) {
      console.error("Error fetching progress:", error);
    } finally {
      setLoading(false);
    }
  };

  // ==================== FETCH SUBJECTS ====================

  const fetchSubjects = async () => {
    try {
      const response = await fetch(`${API_URL}/subjects`);

      if (!response.ok) {
        throw new Error("Failed to fetch subjects");
      }

      const data = await response.json();
      setSubjects(data);
    } catch (error) {
      console.error("Error fetching subjects:", error);
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

  // ==================== LOAD DATA ====================

  useEffect(() => {
    fetchProgress();
    fetchSubjects();
    fetchTeachers();
  }, []);

  // ==================== ADD / UPDATE ====================

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!subjectId) {
      alert("Please select subject");
      return;
    }

    if (!teacherId) {
      alert("Please select teacher");
      return;
    }

    if (!semester) {
      alert("Please enter semester");
      return;
    }

    if (!totalUnits) {
      alert("Please enter total units");
      return;
    }

    if (!completedUnits && completedUnits !== "0") {
      alert("Please enter completed units");
      return;
    }

    if (!lastUpdated) {
      alert("Please select last updated date");
      return;
    }

    if (
      Number(completedUnits) > Number(totalUnits)
    ) {
      alert(
        "Completed units cannot be greater than total units"
      );
      return;
    }

    try {
      const params = new URLSearchParams();

      params.append("subject_id", subjectId);
      params.append("teacher_id", teacherId);
      params.append("semester", semester);
      params.append("total_units", totalUnits);
      params.append("completed_units", completedUnits);
      params.append("last_updated", lastUpdated);

      // ==================== UPDATE ====================

      if (editingId !== null) {
        const response = await fetch(
          `${API_URL}/syllabus-progress/${editingId}?${params.toString()}`,
          {
            method: "PUT",
          }
        );

        if (!response.ok) {
          const errorData = await response.json();
          console.error("Backend error:", errorData);
          throw new Error(
            "Failed to update syllabus progress"
          );
        }

        alert("Syllabus progress updated successfully");

        resetForm();
        await fetchProgress();

        return;
      }

      // ==================== ADD ====================

      const response = await fetch(
        `${API_URL}/syllabus-progress?${params.toString()}`,
        {
          method: "POST",
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        console.error("Backend error:", errorData);
        throw new Error(
          "Failed to create syllabus progress"
        );
      }

      alert("Syllabus progress created successfully");

      resetForm();
      await fetchProgress();
    } catch (error) {
      console.error("Error saving progress:", error);
      alert("Could not save syllabus progress");
    }
  };

  // ==================== EDIT ====================

  const handleEdit = (item) => {
    setEditingId(item.progress_id);

    setSubjectId(
      item.subject_id !== undefined &&
        item.subject_id !== null
        ? String(item.subject_id)
        : ""
    );

    setTeacherId(
      item.teacher_id !== undefined &&
        item.teacher_id !== null
        ? String(item.teacher_id)
        : ""
    );

    setSemester(
      item.semester !== undefined &&
        item.semester !== null
        ? String(item.semester)
        : ""
    );

    setTotalUnits(
      item.total_units !== undefined &&
        item.total_units !== null
        ? String(item.total_units)
        : ""
    );

    setCompletedUnits(
      item.completed_units !== undefined &&
        item.completed_units !== null
        ? String(item.completed_units)
        : ""
    );

    setLastUpdated(
      item.last_updated
        ? String(item.last_updated).substring(0, 10)
        : ""
    );
  };

  // ==================== DELETE ====================

  const handleDelete = async (id) => {
    const confirmDelete = window.confirm(
      "Are you sure you want to delete this syllabus progress?"
    );

    if (!confirmDelete) {
      return;
    }

    try {
      const response = await fetch(
        `${API_URL}/syllabus-progress/${id}`,
        {
          method: "DELETE",
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        console.error("Backend error:", errorData);
        throw new Error(
          "Failed to delete syllabus progress"
        );
      }

      alert("Syllabus progress deleted successfully");

      if (editingId === id) {
        resetForm();
      }

      await fetchProgress();
    } catch (error) {
      console.error("Error deleting progress:", error);
      alert("Could not delete syllabus progress");
    }
  };

  // ==================== RESET ====================

  const resetForm = () => {
    setSubjectId("");
    setTeacherId("");
    setSemester("");
    setTotalUnits("");
    setCompletedUnits("");
    setLastUpdated("");
    setEditingId(null);
  };

  // ==================== PERCENTAGE ====================

  const calculatePercentage = (
    completed,
    total
  ) => {
    if (!total || Number(total) === 0) {
      return 0;
    }

    return Math.round(
      (Number(completed) / Number(total)) * 100
    );
  };

  return (
    <div style={{ padding: "30px" }}>
      <h1>Syllabus Progress</h1>

      <p>
        Track subject-wise syllabus completion
      </p>

      {/* ==================== FORM ==================== */}

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
        {/* SUBJECT */}

        <select
          value={subjectId}
          onChange={(e) =>
            setSubjectId(e.target.value)
          }
          style={{ padding: "10px" }}
        >
          <option value="">
            Select Subject
          </option>

          {subjects.map((subject) => (
            <option
              key={subject.subject_id}
              value={subject.subject_id}
            >
              {subject.subject_code} -{" "}
              {subject.subject_name}
            </option>
          ))}
        </select>

        {/* TEACHER */}

        <select
          value={teacherId}
          onChange={(e) =>
            setTeacherId(e.target.value)
          }
          style={{ padding: "10px" }}
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

        {/* SEMESTER */}

        <input
          type="number"
          min="1"
          max="8"
          placeholder="Semester"
          value={semester}
          onChange={(e) =>
            setSemester(e.target.value)
          }
          style={{ padding: "10px" }}
        />

        {/* TOTAL UNITS */}

        <input
          type="number"
          min="1"
          placeholder="Total Units"
          value={totalUnits}
          onChange={(e) =>
            setTotalUnits(e.target.value)
          }
          style={{ padding: "10px" }}
        />

        {/* COMPLETED UNITS */}

        <input
          type="number"
          min="0"
          placeholder="Completed Units"
          value={completedUnits}
          onChange={(e) =>
            setCompletedUnits(e.target.value)
          }
          style={{ padding: "10px" }}
        />

        {/* LAST UPDATED */}

        <label>
          Last Updated
        </label>

        <input
          type="date"
          value={lastUpdated}
          onChange={(e) =>
            setLastUpdated(e.target.value)
          }
          style={{ padding: "10px" }}
        />

        {/* BUTTONS */}

        <div>
          <button
            type="submit"
            style={{ marginRight: "10px" }}
          >
            {editingId !== null
              ? "Update Progress"
              : "Add Progress"}
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
        <p>Loading syllabus progress...</p>
      ) : progress.length === 0 ? (
        <p>No syllabus progress records found.</p>
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
              <th>Subject</th>
              <th>Code</th>
              <th>Teacher</th>
              <th>Semester</th>
              <th>Total Units</th>
              <th>Completed Units</th>
              <th>Progress</th>
              <th>Last Updated</th>
              <th>Actions</th>
            </tr>
          </thead>

          <tbody>
            {progress.map((item) => (
              <tr key={item.progress_id}>
                <td>{item.progress_id}</td>

                <td>{item.subject_name}</td>

                <td>{item.subject_code}</td>

                <td>{item.teacher_name}</td>

                <td>{item.semester}</td>

                <td>{item.total_units}</td>

                <td>{item.completed_units}</td>

                <td>
                  {calculatePercentage(
                    item.completed_units,
                    item.total_units
                  )}
                  %
                </td>

                <td>
                  {item.last_updated
                    ? String(
                        item.last_updated
                      ).substring(0, 10)
                    : ""}
                </td>

                <td>
                  <button
                    onClick={() =>
                      handleEdit(item)
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
                        item.progress_id
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
export default SyllabusProgress;

