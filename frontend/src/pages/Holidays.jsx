import { useEffect, useState } from "react";

function Holidays() {
  const API_URL = "http://127.0.0.1:8000";

  const [holidays, setHolidays] = useState([]);
  const [loading, setLoading] = useState(true);

  const [holidayName, setHolidayName] = useState("");
  const [holidayDate, setHolidayDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [description, setDescription] = useState("");

  const [editingId, setEditingId] = useState(null);

  const fetchHolidays = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_URL}/holidays`);
      if (!response.ok) throw new Error("Failed to fetch holidays");
      const data = await response.json();
      setHolidays(data);
    } catch (error) {
      console.error("Error fetching holidays:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHolidays();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!holidayName.trim()) {
      alert("Please enter a holiday name");
      return;
    }
    if (!holidayDate) {
      alert("Please select a date");
      return;
    }
    if (endDate && endDate < holidayDate) {
      alert("End date can't be before the start date");
      return;
    }

    try {
      const params = new URLSearchParams();
      params.append("holiday_name", holidayName.trim());
      params.append("holiday_date", holidayDate);
      if (endDate) params.append("end_date", endDate);
      if (description.trim()) params.append("description", description.trim());

      if (editingId !== null) {
        const response = await fetch(
          `${API_URL}/holidays/${editingId}?${params.toString()}`,
          { method: "PUT" }
        );
        if (!response.ok) throw new Error("Failed to update holiday");
        alert("Holiday updated successfully");
        resetForm();
        await fetchHolidays();
        return;
      }

      const response = await fetch(`${API_URL}/holidays?${params.toString()}`, {
        method: "POST",
      });
      if (!response.ok) throw new Error("Failed to create holiday");
      alert("Holiday created successfully");
      resetForm();
      await fetchHolidays();
    } catch (error) {
      console.error("Error saving holiday:", error);
      alert("Could not save holiday");
    }
  };

  const handleEdit = (holiday) => {
    setEditingId(holiday.holiday_id);
    setHolidayName(holiday.holiday_name || "");
    setHolidayDate(
      holiday.holiday_date ? holiday.holiday_date.split("T")[0] : ""
    );
    setEndDate(
      holiday.end_date ? holiday.end_date.split("T")[0] : ""
    );
    setDescription(holiday.description || "");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleDelete = async (id) => {
    const confirmDelete = window.confirm(
      "Are you sure you want to delete this holiday?"
    );
    if (!confirmDelete) return;

    try {
      const response = await fetch(`${API_URL}/holidays/${id}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("Failed to delete holiday");
      alert("Holiday deleted successfully");
      if (editingId === id) resetForm();
      await fetchHolidays();
    } catch (error) {
      console.error("Error deleting holiday:", error);
      alert("Could not delete holiday");
    }
  };

  const resetForm = () => {
    setHolidayName("");
    setHolidayDate("");
    setEndDate("");
    setDescription("");
    setEditingId(null);
  };

  const isUpcoming = (dateStr, endDateStr) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const effectiveEnd = endDateStr ? new Date(endDateStr) : new Date(dateStr);
    return effectiveEnd >= today;
  };

  const formatRange = (h) => {
    const start = h.holiday_date ? h.holiday_date.split("T")[0] : "—";
    if (!h.end_date) return start;
    const end = h.end_date.split("T")[0];
    return end === start ? start : `${start} → ${end}`;
  };

  return (
    <div style={{ padding: "30px", maxWidth: "1200px", margin: "0 auto" }}>
      <h1>Holiday Calendar</h1>
      <p>Manage department holidays. Teachers and students are notified when a holiday is published.</p>

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
        <h2>{editingId !== null ? "Edit Holiday" : "Add Holiday"}</h2>

        <label>
          Holiday Name
          <input
            type="text"
            value={holidayName}
            onChange={(e) => setHolidayName(e.target.value)}
            placeholder="e.g. Diwali"
            style={{ padding: "10px", width: "100%", boxSizing: "border-box", marginTop: "5px" }}
          />
        </label>

        <div style={{ display: "flex", gap: "12px" }}>
          <label style={{ flex: 1 }}>
            Start Date
            <input
              type="date"
              value={holidayDate}
              onChange={(e) => setHolidayDate(e.target.value)}
              style={{ padding: "10px", width: "100%", boxSizing: "border-box", marginTop: "5px" }}
            />
          </label>
          <label style={{ flex: 1 }}>
            End Date <span style={{ color: "#9ca3af", fontWeight: 400 }}>(optional, for multi-day breaks)</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              style={{ padding: "10px", width: "100%", boxSizing: "border-box", marginTop: "5px" }}
            />
          </label>
        </div>

        <label>
          Description (optional)
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Short note"
            style={{ padding: "10px", width: "100%", boxSizing: "border-box", marginTop: "5px" }}
          />
        </label>

        <div>
          <button type="submit" style={{ marginRight: "10px", padding: "10px 16px" }}>
            {editingId !== null ? "Update Holiday" : "Add Holiday"}
          </button>
          {editingId !== null && (
            <button type="button" onClick={resetForm} style={{ padding: "10px 16px" }}>
              Cancel
            </button>
          )}
        </div>
      </form>

      <h2>Holidays</h2>

      {loading ? (
        <p>Loading holidays...</p>
      ) : holidays.length === 0 ? (
        <p>No holidays found. Add one above.</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table border="1" cellPadding="10" style={{ borderCollapse: "collapse", width: "100%", minWidth: "700px" }}>
            <thead>
              <tr>
                <th>ID</th>
                <th>Name</th>
                <th>Date(s)</th>
                <th>Description</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {holidays.map((h) => (
                <tr key={h.holiday_id}>
                  <td>{h.holiday_id}</td>
                  <td>{h.holiday_name}</td>
                  <td>{formatRange(h)}</td>
                  <td>{h.description || "—"}</td>
                  <td>{isUpcoming(h.holiday_date, h.end_date) ? "Upcoming" : "Past"}</td>
                  <td>
                    <button onClick={() => handleEdit(h)} style={{ marginRight: "8px" }}>
                      Edit
                    </button>
                    <button onClick={() => handleDelete(h.holiday_id)}>Delete</button>
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

export default Holidays;