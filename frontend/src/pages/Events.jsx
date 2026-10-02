import { useEffect, useState } from "react";

function Events() {
  const API_URL = "http://127.0.0.1:8000";

  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  const [eventName, setEventName] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [eventTime, setEventTime] = useState("");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");

  const [editingId, setEditingId] = useState(null);

  const fetchEvents = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_URL}/events`);
      if (!response.ok) throw new Error("Failed to fetch events");
      const data = await response.json();
      setEvents(data);
    } catch (error) {
      console.error("Error fetching events:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEvents();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!eventName.trim()) {
      alert("Please enter an event name");
      return;
    }
    if (!eventDate) {
      alert("Please select a date");
      return;
    }

    try {
      const params = new URLSearchParams();
      params.append("event_name", eventName.trim());
      params.append("event_date", eventDate);
      if (eventTime) params.append("event_time", eventTime);
      if (location.trim()) params.append("location", location.trim());
      if (description.trim()) params.append("description", description.trim());

      if (editingId !== null) {
        const response = await fetch(
          `${API_URL}/events/${editingId}?${params.toString()}`,
          { method: "PUT" }
        );
        if (!response.ok) throw new Error("Failed to update event");
        alert("Event updated successfully");
        resetForm();
        await fetchEvents();
        return;
      }

      const response = await fetch(`${API_URL}/events?${params.toString()}`, {
        method: "POST",
      });
      if (!response.ok) throw new Error("Failed to create event");
      alert("Event created successfully");
      resetForm();
      await fetchEvents();
    } catch (error) {
      console.error("Error saving event:", error);
      alert("Could not save event");
    }
  };

  const handleEdit = (event) => {
    setEditingId(event.event_id);
    setEventName(event.event_name || "");
    setEventDate(event.event_date ? event.event_date.split("T")[0] : "");
    setEventTime(event.event_time || "");
    setLocation(event.location || "");
    setDescription(event.description || "");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleDelete = async (id) => {
    const confirmDelete = window.confirm(
      "Are you sure you want to delete this event?"
    );
    if (!confirmDelete) return;

    try {
      const response = await fetch(`${API_URL}/events/${id}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("Failed to delete event");
      alert("Event deleted successfully");
      if (editingId === id) resetForm();
      await fetchEvents();
    } catch (error) {
      console.error("Error deleting event:", error);
      alert("Could not delete event");
    }
  };

  const resetForm = () => {
    setEventName("");
    setEventDate("");
    setEventTime("");
    setLocation("");
    setDescription("");
    setEditingId(null);
  };

  return (
    <div style={{ padding: "30px", maxWidth: "1200px", margin: "0 auto" }}>
      <h1>Events</h1>
      <p>Manage department events — seminars, workshops, guest lectures.</p>

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
        <h2>{editingId !== null ? "Edit Event" : "Add Event"}</h2>

        <label>
          Event Name
          <input
            type="text"
            value={eventName}
            onChange={(e) => setEventName(e.target.value)}
            placeholder="e.g. AI Workshop"
            style={{ padding: "10px", width: "100%", boxSizing: "border-box", marginTop: "5px" }}
          />
        </label>

        <label>
          Date
          <input
            type="date"
            value={eventDate}
            onChange={(e) => setEventDate(e.target.value)}
            style={{ padding: "10px", width: "100%", boxSizing: "border-box", marginTop: "5px" }}
          />
        </label>

        <label>
          Time (optional)
          <input
            type="time"
            value={eventTime}
            onChange={(e) => setEventTime(e.target.value)}
            style={{ padding: "10px", width: "100%", boxSizing: "border-box", marginTop: "5px" }}
          />
        </label>

        <label>
          Location (optional)
          <input
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="e.g. Seminar Hall"
            style={{ padding: "10px", width: "100%", boxSizing: "border-box", marginTop: "5px" }}
          />
        </label>

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
            {editingId !== null ? "Update Event" : "Add Event"}
          </button>
          {editingId !== null && (
            <button type="button" onClick={resetForm} style={{ padding: "10px 16px" }}>
              Cancel
            </button>
          )}
        </div>
      </form>

      <h2>Events</h2>

      {loading ? (
        <p>Loading events...</p>
      ) : events.length === 0 ? (
        <p>No events found. Add one above.</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table border="1" cellPadding="10" style={{ borderCollapse: "collapse", width: "100%", minWidth: "800px" }}>
            <thead>
              <tr>
                <th>ID</th>
                <th>Name</th>
                <th>Date</th>
                <th>Time</th>
                <th>Location</th>
                <th>Description</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {events.map((ev) => (
                <tr key={ev.event_id}>
                  <td>{ev.event_id}</td>
                  <td>{ev.event_name}</td>
                  <td>{ev.event_date ? ev.event_date.split("T")[0] : "—"}</td>
                  <td>{ev.event_time || "—"}</td>
                  <td>{ev.location || "—"}</td>
                  <td>{ev.description || "—"}</td>
                  <td>
                    <button onClick={() => handleEdit(ev)} style={{ marginRight: "8px" }}>
                      Edit
                    </button>
                    <button onClick={() => handleDelete(ev.event_id)}>Delete</button>
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

export default Events;