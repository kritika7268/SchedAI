import { useEffect, useState } from "react";

function Batches() {
  const API_URL = "http://127.0.0.1:8000";

  const [batches, setBatches] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);

  const [batchName, setBatchName] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [semester, setSemester] = useState("");
  const [section, setSection] = useState("");

  const [editingId, setEditingId] = useState(null);

  // ==================== FETCH BATCHES ====================

  const fetchBatches = async () => {
    try {
      setLoading(true);

      const response = await fetch(`${API_URL}/batches`);

      if (!response.ok) {
        throw new Error("Failed to fetch batches");
      }

      const data = await response.json();
      setBatches(data);
    } catch (error) {
      console.error("Error fetching batches:", error);
    } finally {
      setLoading(false);
    }
  };

  // ==================== FETCH DEPARTMENTS ====================

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

  useEffect(() => {
    fetchBatches();
    fetchDepartments();
  }, []);

  // ==================== ADD / UPDATE ====================

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!batchName.trim()) {
      alert("Please enter a batch name");
      return;
    }

    if (!departmentId) {
      alert("Please select a department");
      return;
    }

    if (!semester) {
      alert("Please select a semester");
      return;
    }

    try {
      const params = new URLSearchParams();
      params.append("batch_name", batchName.trim());
      params.append("department_id", departmentId);
      params.append("semester", semester);
      if (section.trim()) {
        params.append("section", section.trim());
      }

      // UPDATE
      if (editingId !== null) {
        const response = await fetch(
          `${API_URL}/batches/${editingId}?${params.toString()}`,
          { method: "PUT" }
        );

        if (!response.ok) {
          const errorData = await response.json();
          console.error("Backend error:", errorData);
          throw new Error("Failed to update batch");
        }

        alert("Batch updated successfully");
        resetForm();
        await fetchBatches();
        return;
      }

      // ADD
      const response = await fetch(
        `${API_URL}/batches?${params.toString()}`,
        { method: "POST" }
      );

      if (!response.ok) {
        const errorData = await response.json();
        console.error("Backend error:", errorData);
        throw new Error("Failed to create batch");
      }

      alert("Batch created successfully");
      resetForm();
      await fetchBatches();
    } catch (error) {
      console.error("Error saving batch:", error);
      alert("Could not save batch");
    }
  };

  // ==================== EDIT ====================

  const handleEdit = (batch) => {
    setEditingId(batch.batch_id);
    setBatchName(batch.batch_name || "");
    setDepartmentId(String(batch.department_id));
    setSemester(String(batch.semester));
    setSection(batch.section || "");

    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // ==================== DELETE ====================

  const handleDelete = async (id) => {
    const confirmDelete = window.confirm(
      "Are you sure you want to delete this batch? Its timetable entries will lose their batch link (but won't be deleted)."
    );

    if (!confirmDelete) {
      return;
    }

    try {
      const response = await fetch(`${API_URL}/batches/${id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error("Backend error:", errorData);
        throw new Error("Failed to delete batch");
      }

      alert("Batch deleted successfully");

      if (editingId === id) {
        resetForm();
      }

      await fetchBatches();
    } catch (error) {
      console.error("Error deleting batch:", error);
      alert("Could not delete batch");
    }
  };

  // ==================== RESET ====================

  const resetForm = () => {
    setBatchName("");
    setDepartmentId("");
    setSemester("");
    setSection("");
    setEditingId(null);
  };

  return (
    <div style={{ padding: "30px", maxWidth: "1200px", margin: "0 auto" }}>
      <h1>Batches</h1>
      <p>
        Manage department batches/sections — each batch gets its own
        AI-generated, conflict-free timetable (see the Timetable page).
      </p>

      {/* ==================== FORM ==================== */}

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
        <h2>{editingId !== null ? "Edit Batch" : "Add Batch"}</h2>

        <label>
          Batch Name
          <input
            type="text"
            value={batchName}
            onChange={(e) => setBatchName(e.target.value)}
            placeholder="e.g. BCA 5A"
            style={{
              padding: "10px",
              width: "100%",
              boxSizing: "border-box",
              marginTop: "5px",
            }}
          />
        </label>

        <select
          value={departmentId}
          onChange={(e) => setDepartmentId(e.target.value)}
          style={{ padding: "10px" }}
        >
          <option value="">Select Department</option>
          {departments.map((dept) => (
            <option key={dept.department_id} value={dept.department_id}>
              {dept.department_name}
            </option>
          ))}
        </select>

        <select
          value={semester}
          onChange={(e) => setSemester(e.target.value)}
          style={{ padding: "10px" }}
        >
          <option value="">Select Semester</option>
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((s) => (
            <option key={s} value={s}>
              Semester {s}
            </option>
          ))}
        </select>

        <label>
          Section (optional)
          <input
            type="text"
            value={section}
            onChange={(e) => setSection(e.target.value)}
            placeholder="e.g. A"
            style={{
              padding: "10px",
              width: "100%",
              boxSizing: "border-box",
              marginTop: "5px",
            }}
          />
        </label>

        <div>
          <button
            type="submit"
            style={{ marginRight: "10px", padding: "10px 16px" }}
          >
            {editingId !== null ? "Update Batch" : "Add Batch"}
          </button>

          {editingId !== null && (
            <button
              type="button"
              onClick={resetForm}
              style={{ padding: "10px 16px" }}
            >
              Cancel
            </button>
          )}
        </div>
      </form>

      {/* ==================== LIST ==================== */}

      <h2>Existing Batches</h2>

      {loading ? (
        <p>Loading batches...</p>
      ) : batches.length === 0 ? (
        <p>No batches found. Add one above.</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table
            border="1"
            cellPadding="10"
            style={{
              borderCollapse: "collapse",
              width: "100%",
              minWidth: "700px",
            }}
          >
            <thead>
              <tr>
                <th>ID</th>
                <th>Batch Name</th>
                <th>Department</th>
                <th>Semester</th>
                <th>Section</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {batches.map((batch) => (
                <tr key={batch.batch_id}>
                  <td>{batch.batch_id}</td>
                  <td>{batch.batch_name}</td>
                  <td>{batch.department_name}</td>
                  <td>Semester {batch.semester}</td>
                  <td>{batch.section || "—"}</td>
                  <td>
                    <button
                      onClick={() => handleEdit(batch)}
                      style={{ marginRight: "8px" }}
                    >
                      Edit
                    </button>
                    <button onClick={() => handleDelete(batch.batch_id)}>
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

export default Batches;