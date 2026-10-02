import { useEffect, useState } from "react";

function ProjectGuides() {
  const [projects, setProjects] = useState([]);
  const [students, setStudents] = useState([]);
  const [teachers, setTeachers] = useState([]);

  const [studentId, setStudentId] = useState("");
  const [guideTeacherId, setGuideTeacherId] = useState("");
  const [projectTitle, setProjectTitle] = useState("");
  const [projectStatus, setProjectStatus] = useState("");
  const [assignedDate, setAssignedDate] = useState("");

  const [editingId, setEditingId] = useState(null);

  // ==================== FETCH PROJECTS ====================

  const fetchProjects = async () => {
    try {
      const response = await fetch(
        "http://127.0.0.1:8000/project-guides"
      );

      const data = await response.json();

      if (!response.ok) {
        alert(data.detail || "Failed to fetch projects");
        return;
      }

      setProjects(data);
    } catch (error) {
      console.error("Error fetching projects:", error);
    }
  };

  // ==================== FETCH STUDENTS ====================

  const fetchStudents = async () => {
    try {
      const response = await fetch(
        "http://127.0.0.1:8000/students"
      );

      const data = await response.json();

      if (!response.ok) {
        alert(data.detail || "Failed to fetch students");
        return;
      }

      setStudents(data);
    } catch (error) {
      console.error("Error fetching students:", error);
    }
  };

  // ==================== FETCH TEACHERS ====================

  const fetchTeachers = async () => {
    try {
      const response = await fetch(
        "http://127.0.0.1:8000/teachers"
      );

      const data = await response.json();

      if (!response.ok) {
        alert(data.detail || "Failed to fetch teachers");
        return;
      }

      setTeachers(data);
    } catch (error) {
      console.error("Error fetching teachers:", error);
    }
  };

  // ==================== LOAD DATA ====================

  useEffect(() => {
    fetchProjects();
    fetchStudents();
    fetchTeachers();
  }, []);

  // ==================== ADD / UPDATE ====================

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (
      !studentId ||
      !guideTeacherId ||
      !projectTitle ||
      !projectStatus ||
      !assignedDate
    ) {
      alert("Please fill all fields");
      return;
    }

    try {
      const queryParams =
        `student_id=${studentId}` +
        `&guide_teacher_id=${guideTeacherId}` +
        `&project_title=${encodeURIComponent(projectTitle)}` +
        `&project_status=${encodeURIComponent(projectStatus)}` +
        `&assigned_date=${assignedDate}`;

      const url = editingId
        ? `http://127.0.0.1:8000/project-guides/${editingId}?${queryParams}`
        : `http://127.0.0.1:8000/project-guides?${queryParams}`;

      const response = await fetch(url, {
        method: editingId ? "PUT" : "POST",
      });

      const data = await response.json();

      if (!response.ok) {
        alert(data.detail || "Something went wrong");
        return;
      }

      alert(
        editingId
          ? "Project guide updated successfully"
          : "Project guide added successfully"
      );

      clearForm();
      fetchProjects();
    } catch (error) {
      console.error("Error:", error);
      alert("Server error");
    }
  };

  // ==================== EDIT ====================

  const handleEdit = (project) => {
    setEditingId(project.project_id);

    setStudentId(project.student_id);
    setGuideTeacherId(project.guide_teacher_id);
    setProjectTitle(project.project_title);
    setProjectStatus(project.project_status);
    setAssignedDate(project.assigned_date);
  };

  // ==================== DELETE ====================

  const handleDelete = async (id) => {
    const confirmDelete = window.confirm(
      "Are you sure you want to delete this project guide?"
    );

    if (!confirmDelete) {
      return;
    }

    try {
      const response = await fetch(
        `http://127.0.0.1:8000/project-guides/${id}`,
        {
          method: "DELETE",
        }
      );

      const data = await response.json();

      if (!response.ok) {
        alert(data.detail || "Delete failed");
        return;
      }

      alert("Project guide deleted successfully");

      fetchProjects();
    } catch (error) {
      console.error("Error deleting project:", error);
      alert("Server error");
    }
  };

  // ==================== CLEAR FORM ====================

  const clearForm = () => {
    setEditingId(null);
    setStudentId("");
    setGuideTeacherId("");
    setProjectTitle("");
    setProjectStatus("");
    setAssignedDate("");
  };

  // ==================== UI ====================

  return (
    <div style={{ padding: "30px" }}>
      <h1>Project Guides</h1>

      <p>Manage student projects and project guides</p>

      {/* ==================== FORM ==================== */}

      <form onSubmit={handleSubmit} style={{ marginBottom: "30px" }}>
        {/* Student */}

        <div style={{ marginBottom: "10px" }}>
          <label>Student: </label>

          <select
            value={studentId}
            onChange={(e) => setStudentId(e.target.value)}
          >
            <option value="">Select Student</option>

            {students.map((student) => (
              <option
                key={student.student_id}
                value={student.student_id}
              >
                {student.student_name} - {student.roll_number}
              </option>
            ))}
          </select>
        </div>

        {/* Guide Teacher */}

        <div style={{ marginBottom: "10px" }}>
          <label>Guide Teacher: </label>

          <select
            value={guideTeacherId}
            onChange={(e) => setGuideTeacherId(e.target.value)}
          >
            <option value="">Select Guide Teacher</option>

            {teachers.map((teacher) => (
              <option
                key={teacher.teacher_id}
                value={teacher.teacher_id}
              >
                {teacher.teacher_name}
              </option>
            ))}
          </select>
        </div>

        {/* Project Title */}

        <div style={{ marginBottom: "10px" }}>
          <label>Project Title: </label>

          <input
            type="text"
            placeholder="Enter project title"
            value={projectTitle}
            onChange={(e) => setProjectTitle(e.target.value)}
          />
        </div>

        {/* Project Status */}

        <div style={{ marginBottom: "10px" }}>
          <label>Project Status: </label>

          <select
            value={projectStatus}
            onChange={(e) => setProjectStatus(e.target.value)}
          >
            <option value="">Select Status</option>
            <option value="Assigned">Assigned</option>
            <option value="In Progress">In Progress</option>
            <option value="Completed">Completed</option>
          </select>
        </div>

        {/* Assigned Date */}

        <div style={{ marginBottom: "10px" }}>
          <label>Assigned Date: </label>

          <input
            type="date"
            value={assignedDate}
            onChange={(e) => setAssignedDate(e.target.value)}
          />
        </div>

        {/* Buttons */}

        <button type="submit">
          {editingId ? "Update Project" : "Add Project"}
        </button>

        {editingId && (
          <button
            type="button"
            onClick={clearForm}
            style={{ marginLeft: "10px" }}
          >
            Cancel
          </button>
        )}
      </form>

      {/* ==================== TABLE ==================== */}

      <table
        border="1"
        cellPadding="10"
        style={{ borderCollapse: "collapse" }}
      >
        <thead>
          <tr>
            <th>ID</th>
            <th>Student</th>
            <th>Roll Number</th>
            <th>Guide Teacher</th>
            <th>Project Title</th>
            <th>Status</th>
            <th>Assigned Date</th>
            <th>Actions</th>
          </tr>
        </thead>

        <tbody>
          {projects.map((project) => (
            <tr key={project.project_id}>
              <td>{project.project_id}</td>

              <td>{project.student_name}</td>

              <td>{project.roll_number}</td>

              <td>{project.guide_teacher}</td>

              <td>{project.project_title}</td>

              <td>{project.project_status}</td>

              <td>{project.assigned_date}</td>

              <td>
                <button onClick={() => handleEdit(project)}>
                  Edit
                </button>

                <button
                  onClick={() =>
                    handleDelete(project.project_id)
                  }
                  style={{ marginLeft: "8px" }}
                >
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
export default ProjectGuides;