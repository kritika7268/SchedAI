import { useEffect, useState } from "react";

function Teachers() {
  const [teachers, setTeachers] = useState([]);
  const [departments, setDepartments] = useState([]);

  const [teacherName, setTeacherName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [departmentId, setDepartmentId] = useState("");

  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(true);

  const API_URL = "http://127.0.0.1:8000";

  // =========================
  // FETCH TEACHERS
  // =========================
  const fetchTeachers = async () => {
    try {
      setLoading(true);

      const response = await fetch(`${API_URL}/teachers`);

      if (!response.ok) {
        throw new Error("Failed to fetch teachers");
      }

      const data = await response.json();
      setTeachers(data);
    } catch (error) {
      console.error("Error fetching teachers:", error);
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
    fetchTeachers();
    fetchDepartments();
  }, []);

  // =========================
  // ADD / UPDATE TEACHER
  // =========================
  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!teacherName.trim()) {
      alert("Please enter teacher name");
      return;
    }

    if (!email.trim()) {
      alert("Please enter email");
      return;
    }

    if (!phone.trim()) {
      alert("Please enter phone number");
      return;
    }

    if (!departmentId) {
      alert("Please select department");
      return;
    }

    try {
      const params = new URLSearchParams();

      params.append("teacher_name", teacherName.trim());
      params.append("email", email.trim());
      params.append("phone", phone.trim());
      params.append("department_id", departmentId);

      // =========================
      // UPDATE TEACHER
      // =========================
      if (editingId !== null) {
        const response = await fetch(
          `${API_URL}/teachers/${editingId}?${params.toString()}`,
          {
            method: "PUT",
          }
        );

        if (!response.ok) {
          const errorData = await response.json();
          console.error("Backend error:", errorData);

          throw new Error("Failed to update teacher");
        }

        alert("Teacher updated successfully");

        resetForm();
        await fetchTeachers();

        return;
      }

      // =========================
      // ADD TEACHER
      // =========================
      const response = await fetch(
        `${API_URL}/teachers?${params.toString()}`,
        {
          method: "POST",
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        console.error("Backend error:", errorData);

        throw new Error("Failed to add teacher");
      }

      alert("Teacher added successfully");

      resetForm();
      await fetchTeachers();
    } catch (error) {
      console.error("Error saving teacher:", error);
      alert("Could not save teacher");
    }
  };

  // =========================
  // EDIT TEACHER
  // =========================
  const handleEdit = (teacher) => {
    setEditingId(teacher.teacher_id);

    setTeacherName(teacher.teacher_name || "");
    setEmail(teacher.email || "");
    setPhone(teacher.phone || "");
    setDepartmentId(
      teacher.department_id !== null
        ? String(teacher.department_id)
        : ""
    );
  };

  // =========================
  // DELETE TEACHER
  // =========================
  const handleDelete = async (id) => {
    const confirmDelete = window.confirm(
      "Are you sure you want to delete this teacher?"
    );

    if (!confirmDelete) {
      return;
    }

    try {
      const response = await fetch(`${API_URL}/teachers/${id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error("Backend error:", errorData);

        throw new Error("Failed to delete teacher");
      }

      alert("Teacher deleted successfully");

      if (editingId === id) {
        resetForm();
      }

      await fetchTeachers();
    } catch (error) {
      console.error("Error deleting teacher:", error);
      alert("Could not delete teacher");
    }
  };

  // =========================
  // RESET FORM
  // =========================
  const resetForm = () => {
    setTeacherName("");
    setEmail("");
    setPhone("");
    setDepartmentId("");
    setEditingId(null);
  };

  return (
    <div style={{ padding: "30px" }}>
      <h1>Teachers</h1>

      <p>Manage university teachers</p>

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
          placeholder="Enter teacher name"
          value={teacherName}
          onChange={(e) => setTeacherName(e.target.value)}
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
          type="text"
          placeholder="Enter phone number"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
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
              ? "Update Teacher"
              : "Add Teacher"}
          </button>

          {editingId !== null && (
            <button type="button" onClick={resetForm}>
              Cancel
            </button>
          )}
        </div>
      </form>

      {/* =========================
          TEACHER LIST
      ========================== */}
      {loading ? (
        <p>Loading teachers...</p>
      ) : teachers.length === 0 ? (
        <p>No teachers found.</p>
      ) : (
        <table
          border="1"
          cellPadding="10"
          style={{
            borderCollapse: "collapse",
            width: "100%",
            maxWidth: "1000px",
          }}
        >
          <thead>
            <tr>
              <th>ID</th>
              <th>Teacher Name</th>
              <th>Email</th>
              <th>Phone</th>
              <th>Department ID</th>
              <th>Actions</th>
            </tr>
          </thead>

          <tbody>
            {teachers.map((teacher) => (
              <tr key={teacher.teacher_id}>
                <td>{teacher.teacher_id}</td>

                <td>{teacher.teacher_name}</td>

                <td>{teacher.email}</td>

                <td>{teacher.phone}</td>

                <td>{teacher.department_id}</td>

                <td>
                  <button
                    onClick={() => handleEdit(teacher)}
                    style={{ marginRight: "10px" }}
                  >
                    Edit
                  </button>

                  <button
                    onClick={() =>
                      handleDelete(teacher.teacher_id)
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
export default Teachers;

