import { useEffect, useState } from "react";

function Departments() {
  const [departments, setDepartments] = useState([]);
  const [departmentName, setDepartmentName] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(true);

  const API_URL = "http://127.0.0.1:8000";

  // Fetch departments
  const fetchDepartments = async () => {
    try {
      setLoading(true);

      const response = await fetch(`${API_URL}/departments`);

      if (!response.ok) {
        throw new Error("Failed to fetch departments");
      }

      const data = await response.json();
      setDepartments(data);
    } catch (error) {
      console.error("Error fetching departments:", error);
    } finally {
      setLoading(false);
    }
  };

  // Load departments when page opens
  useEffect(() => {
    fetchDepartments();
  }, []);

  // Add / Update Department
  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!departmentName.trim()) {
      alert("Please enter department name");
      return;
    }

    try {
      const cleanName = departmentName.trim();

      // UPDATE
      if (editingId !== null) {
        const url = `${API_URL}/departments/${editingId}?department_name=${encodeURIComponent(
          cleanName
        )}`;

        console.log("PUT URL:", url);

        const response = await fetch(url, {
          method: "PUT",
        });

        if (!response.ok) {
          const errorData = await response.json();
          console.error("Backend error:", errorData);
          throw new Error("Failed to update department");
        }

        alert("Department updated successfully");

        setDepartmentName("");
        setEditingId(null);

        await fetchDepartments();
        return;
      }

      // ADD
      const url = `${API_URL}/departments?department_name=${encodeURIComponent(
        cleanName
      )}`;

      console.log("POST URL:", url);

      const response = await fetch(url, {
        method: "POST",
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error("Backend error:", errorData);
        throw new Error("Failed to add department");
      }

      alert("Department added successfully");

      setDepartmentName("");

      await fetchDepartments();
    } catch (error) {
      console.error("Error saving department:", error);
      alert("Could not save department");
    }
  };

  // Start editing
  const handleEdit = (department) => {
    setEditingId(department.department_id);
    setDepartmentName(department.department_name);
  };

  // Cancel editing
  const handleCancelEdit = () => {
    setEditingId(null);
    setDepartmentName("");
  };

  // Delete department
  const handleDelete = async (id) => {
    const confirmDelete = window.confirm(
      "Are you sure you want to delete this department?"
    );

    if (!confirmDelete) {
      return;
    }

    try {
      const response = await fetch(`${API_URL}/departments/${id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error("Backend error:", errorData);
        throw new Error("Failed to delete department");
      }

      alert("Department deleted successfully");

      // If deleted department was being edited
      if (editingId === id) {
        setEditingId(null);
        setDepartmentName("");
      }

      await fetchDepartments();
    } catch (error) {
      console.error("Error deleting department:", error);
      alert("Could not delete department");
    }
  };

  return (
    <div style={{ padding: "30px" }}>
      <h1>Departments</h1>

      <p>Manage university departments</p>

      {/* Add / Edit Department */}
      <form
        onSubmit={handleSubmit}
        style={{
          marginBottom: "30px",
          display: "flex",
          alignItems: "center",
          gap: "10px",
        }}
      >
        <input
          type="text"
          placeholder="Enter department name"
          value={departmentName}
          onChange={(e) => setDepartmentName(e.target.value)}
          style={{
            padding: "10px",
            width: "300px",
          }}
        />

        <button type="submit">
          {editingId !== null ? "Update Department" : "Add Department"}
        </button>

        {editingId !== null && (
          <button type="button" onClick={handleCancelEdit}>
            Cancel
          </button>
        )}
      </form>

      {/* Department List */}
      {loading ? (
        <p>Loading departments...</p>
      ) : departments.length === 0 ? (
        <p>No departments found.</p>
      ) : (
        <table
          border="1"
          cellPadding="10"
          style={{
            borderCollapse: "collapse",
            width: "100%",
            maxWidth: "800px",
          }}
        >
          <thead>
            <tr>
              <th>ID</th>
              <th>Department Name</th>
              <th>Actions</th>
            </tr>
          </thead>

          <tbody>
            {departments.map((department) => (
              <tr key={department.department_id}>
                <td>{department.department_id}</td>

                <td>{department.department_name}</td>

                <td>
                  <button
                    onClick={() => handleEdit(department)}
                    style={{ marginRight: "10px" }}
                  >
                    Edit
                  </button>

                  <button
                    onClick={() =>
                      handleDelete(department.department_id)
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

export default Departments;



