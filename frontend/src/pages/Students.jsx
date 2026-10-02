import { useEffect, useState } from "react";

function Students() {
  const [students, setStudents] = useState([]);
  const [departments, setDepartments] = useState([]);

  const [studentName, setStudentName] = useState("");
  const [rollNumber, setRollNumber] = useState("");
  const [email, setEmail] = useState("");
  const [semester, setSemester] = useState("");
  const [departmentId, setDepartmentId] = useState("");

  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(true);

  const API_URL = "http://127.0.0.1:8000";

  // =========================
  // FETCH STUDENTS
  // =========================
  const fetchStudents = async () => {
    try {
      setLoading(true);

      const response = await fetch(`${API_URL}/students`);

      if (!response.ok) {
        throw new Error("Failed to fetch students");
      }

      const data = await response.json();
      setStudents(data);
    } catch (error) {
      console.error("Error fetching students:", error);
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
  // LOAD DATA
  // =========================
  useEffect(() => {
    fetchStudents();
    fetchDepartments();
  }, []);

  // =========================
  // ADD / UPDATE STUDENT
  // =========================
  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!studentName.trim()) {
      alert("Please enter student name");
      return;
    }

    if (!rollNumber.trim()) {
      alert("Please enter roll number");
      return;
    }

    if (!email.trim()) {
      alert("Please enter email");
      return;
    }

    if (!semester) {
      alert("Please enter semester");
      return;
    }

    if (Number(semester) < 1 || Number(semester) > 10) {
      alert("Please enter a valid semester");
      return;
    }

    if (!departmentId) {
      alert("Please select department");
      return;
    }

    try {
      const params = new URLSearchParams();

      params.append("student_name", studentName.trim());
      params.append("roll_number", rollNumber.trim());
      params.append("email", email.trim());
      params.append("semester", semester);
      params.append("department_id", departmentId);

      // =========================
      // UPDATE STUDENT
      // =========================
      if (editingId !== null) {
        const response = await fetch(
          `${API_URL}/students/${editingId}?${params.toString()}`,
          {
            method: "PUT",
          }
        );

        if (!response.ok) {
          const errorData = await response.json();
          console.error("Backend error:", errorData);

          throw new Error("Failed to update student");
        }

        alert("Student updated successfully");

        resetForm();
        await fetchStudents();

        return;
      }

      // =========================
      // ADD STUDENT
      // =========================
      const response = await fetch(
        `${API_URL}/students?${params.toString()}`,
        {
          method: "POST",
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        console.error("Backend error:", errorData);

        throw new Error("Failed to add student");
      }

      alert("Student added successfully");

      resetForm();
      await fetchStudents();
    } catch (error) {
      console.error("Error saving student:", error);
      alert("Could not save student");
    }
  };

  // =========================
  // EDIT STUDENT
  // =========================
  const handleEdit = (student) => {
    setEditingId(student.student_id);

    setStudentName(student.student_name || "");
    setRollNumber(student.roll_number || "");
    setEmail(student.email || "");

    setSemester(
      student.semester !== null && student.semester !== undefined
        ? String(student.semester)
        : ""
    );

    setDepartmentId(
      student.department_id !== null &&
        student.department_id !== undefined
        ? String(student.department_id)
        : ""
    );
  };

  // =========================
  // DELETE STUDENT
  // =========================
  const handleDelete = async (id) => {
    const confirmDelete = window.confirm(
      "Are you sure you want to delete this student?"
    );

    if (!confirmDelete) {
      return;
    }

    try {
      const response = await fetch(`${API_URL}/students/${id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error("Backend error:", errorData);

        throw new Error("Failed to delete student");
      }

      alert("Student deleted successfully");

      if (editingId === id) {
        resetForm();
      }

      await fetchStudents();
    } catch (error) {
      console.error("Error deleting student:", error);
      alert("Could not delete student");
    }
  };

  // =========================
  // RESET FORM
  // =========================
  const resetForm = () => {
    setStudentName("");
    setRollNumber("");
    setEmail("");
    setSemester("");
    setDepartmentId("");
    setEditingId(null);
  };

  return (
    <div style={{ padding: "30px" }}>
      <h1>Students</h1>

      <p>Manage university students</p>

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
          placeholder="Enter student name"
          value={studentName}
          onChange={(e) => setStudentName(e.target.value)}
          style={{
            padding: "10px",
          }}
        />

        <input
          type="text"
          placeholder="Enter roll number"
          value={rollNumber}
          onChange={(e) => setRollNumber(e.target.value)}
          style={{
            padding: "10px",
          }}
        />

        <input
          type="email"
          placeholder="Enter email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{
            padding: "10px",
          }}
        />

        <input
          type="number"
          placeholder="Enter semester"
          value={semester}
          onChange={(e) => setSemester(e.target.value)}
          min="1"
          max="10"
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

        <div>
          <button type="submit" style={{ marginRight: "10px" }}>
            {editingId !== null
              ? "Update Student"
              : "Add Student"}
          </button>

          {editingId !== null && (
            <button type="button" onClick={resetForm}>
              Cancel
            </button>
          )}
        </div>
      </form>

      {/* =========================
          STUDENT LIST
      ========================== */}
      {loading ? (
        <p>Loading students...</p>
      ) : students.length === 0 ? (
        <p>No students found.</p>
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
              <th>Student Name</th>
              <th>Roll Number</th>
              <th>Email</th>
              <th>Semester</th>
              <th>Department ID</th>
              <th>Actions</th>
            </tr>
          </thead>

          <tbody>
            {students.map((student) => (
              <tr key={student.student_id}>
                <td>{student.student_id}</td>

                <td>{student.student_name}</td>

                <td>{student.roll_number}</td>

                <td>{student.email}</td>

                <td>{student.semester}</td>

                <td>{student.department_id}</td>

                <td>
                  <button
                    onClick={() => handleEdit(student)}
                    style={{ marginRight: "10px" }}
                  >
                    Edit
                  </button>

                  <button
                    onClick={() =>
                      handleDelete(student.student_id)
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
export default Students;

