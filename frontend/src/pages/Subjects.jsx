import { useEffect, useState } from "react";

function Subjects() {
  const [subjects, setSubjects] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [teachers, setTeachers] = useState([]);

  const [subjectName, setSubjectName] = useState("");
  const [subjectCode, setSubjectCode] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [teacherId, setTeacherId] = useState("");

  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(true);

  const API_URL = "http://127.0.0.1:8000";

  // =========================
  // FETCH SUBJECTS
  // =========================
  const fetchSubjects = async () => {
    try {
      setLoading(true);

      const response = await fetch(`${API_URL}/subjects`);

      if (!response.ok) {
        throw new Error("Failed to fetch subjects");
      }

      const data = await response.json();
      setSubjects(data);
    } catch (error) {
      console.error("Error fetching subjects:", error);
    } finally {
      setLoading(false);
    }
  };

  // =========================
  // FETCH DEPARTMENTS
  // =========================
  const fetchDepartments = async () => {
    try {
      const response = await fetch(`${API_URL}/departments`);

      if (!response.ok) {
        throw new Error("Failed to fetch departments");
      }

      const data = await response.json();
      setDepartments(data);
    } catch (error) {
      console.error("Error fetching departments:", error);
    }
  };

  // =========================
  // FETCH TEACHERS
  // =========================
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

  // =========================
  // LOAD ALL DATA
  // =========================
  useEffect(() => {
    fetchSubjects();
    fetchDepartments();
    fetchTeachers();
  }, []);

  // =========================
  // ADD / UPDATE SUBJECT
  // =========================
  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!subjectName.trim()) {
      alert("Please enter subject name");
      return;
    }

    if (!subjectCode.trim()) {
      alert("Please enter subject code");
      return;
    }

    if (!departmentId) {
      alert("Please select department");
      return;
    }

    if (!teacherId) {
      alert("Please select teacher");
      return;
    }

    try {
      const params = new URLSearchParams();

      params.append("subject_name", subjectName.trim());
      params.append("subject_code", subjectCode.trim());
      params.append("department_id", departmentId);
      params.append("teacher_id", teacherId);

      // =========================
      // UPDATE SUBJECT
      // =========================
      if (editingId !== null) {
        const response = await fetch(
          `${API_URL}/subjects/${editingId}?${params.toString()}`,
          {
            method: "PUT",
          }
        );

        if (!response.ok) {
          const errorData = await response.json();
          console.error("Backend error:", errorData);

          throw new Error("Failed to update subject");
        }

        alert("Subject updated successfully");

        resetForm();
        await fetchSubjects();

        return;
      }

      // =========================
      // ADD SUBJECT
      // =========================
      const response = await fetch(
        `${API_URL}/subjects?${params.toString()}`,
        {
          method: "POST",
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        console.error("Backend error:", errorData);

        throw new Error("Failed to add subject");
      }

      alert("Subject added successfully");

      resetForm();
      await fetchSubjects();
    } catch (error) {
      console.error("Error saving subject:", error);
      alert("Could not save subject");
    }
  };

  // =========================
  // EDIT SUBJECT
  // =========================
  const handleEdit = (subject) => {
    setEditingId(subject.subject_id);

    setSubjectName(subject.subject_name || "");
    setSubjectCode(subject.subject_code || "");

    setDepartmentId(
      subject.department_id !== null
        ? String(subject.department_id)
        : ""
    );

    setTeacherId(
      subject.teacher_id !== null
        ? String(subject.teacher_id)
        : ""
    );
  };

  // =========================
  // DELETE SUBJECT
  // =========================
  const handleDelete = async (id) => {
    const confirmDelete = window.confirm(
      "Are you sure you want to delete this subject?"
    );

    if (!confirmDelete) {
      return;
    }

    try {
      const response = await fetch(`${API_URL}/subjects/${id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error("Backend error:", errorData);

        throw new Error("Failed to delete subject");
      }

      alert("Subject deleted successfully");

      if (editingId === id) {
        resetForm();
      }

      await fetchSubjects();
    } catch (error) {
      console.error("Error deleting subject:", error);
      alert("Could not delete subject");
    }
  };

  // =========================
  // RESET FORM
  // =========================
  const resetForm = () => {
    setSubjectName("");
    setSubjectCode("");
    setDepartmentId("");
    setTeacherId("");
    setEditingId(null);
  };

  return (
    <div style={{ padding: "30px" }}>
      <h1>Subjects</h1>

      <p>Manage university subjects</p>

      {/* =========================
          ADD / EDIT FORM
      ========================== */}
      <form
        onSubmit={handleSubmit}
        style={{
          marginBottom: "30px",
          display: "flex",
          flexDirection: "column",
          gap: "12px",
          maxWidth: "400px",
        }}
      >
        <input
          type="text"
          placeholder="Enter subject name"
          value={subjectName}
          onChange={(e) => setSubjectName(e.target.value)}
          style={{
            padding: "10px",
          }}
        />

        <input
          type="text"
          placeholder="Enter subject code"
          value={subjectCode}
          onChange={(e) => setSubjectCode(e.target.value)}
          style={{
            padding: "10px",
          }}
        />

        <select
          value={departmentId}
          onChange={(e) => setDepartmentId(e.target.value)}
          style={{
            padding: "10px",
          }}
        >
          <option value="">Select Department</option>

          {departments.map((department) => (
            <option
              key={department.department_id}
              value={department.department_id}
            >
              {department.department_name}
            </option>
          ))}
        </select>

        <select
          value={teacherId}
          onChange={(e) => setTeacherId(e.target.value)}
          style={{
            padding: "10px",
          }}
        >
          <option value="">Select Teacher</option>

          {teachers.map((teacher) => (
            <option
              key={teacher.teacher_id}
              value={teacher.teacher_id}
            >
              {teacher.teacher_name}
            </option>
          ))}
        </select>

        <div>
          <button type="submit" style={{ marginRight: "10px" }}>
            {editingId !== null
              ? "Update Subject"
              : "Add Subject"}
          </button>

          {editingId !== null && (
            <button type="button" onClick={resetForm}>
              Cancel
            </button>
          )}
        </div>
      </form>

      {/* =========================
          SUBJECT LIST
      ========================== */}
      {loading ? (
        <p>Loading subjects...</p>
      ) : subjects.length === 0 ? (
        <p>No subjects found.</p>
      ) : (
        <table
          border="1"
          cellPadding="10"
          style={{
            borderCollapse: "collapse",
            width: "100%",
            maxWidth: "1100px",
          }}
        >
          <thead>
            <tr>
              <th>ID</th>
              <th>Subject Name</th>
              <th>Subject Code</th>
              <th>Department ID</th>
              <th>Teacher ID</th>
              <th>Actions</th>
            </tr>
          </thead>

          <tbody>
            {subjects.map((subject) => (
              <tr key={subject.subject_id}>
                <td>{subject.subject_id}</td>

                <td>{subject.subject_name}</td>

                <td>{subject.subject_code}</td>

                <td>{subject.department_id}</td>

                <td>{subject.teacher_id}</td>

                <td>
                  <button
                    onClick={() => handleEdit(subject)}
                    style={{ marginRight: "10px" }}
                  >
                    Edit
                  </button>

                  <button
                    onClick={() =>
                      handleDelete(subject.subject_id)
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

export default Subjects;

