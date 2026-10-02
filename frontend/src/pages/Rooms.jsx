import { useEffect, useState } from "react";

function Rooms() {
  const [rooms, setRooms] = useState([]);
  const [roomName, setRoomName] = useState("");
  const [roomType, setRoomType] = useState("");
  const [capacity, setCapacity] = useState("");

  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(true);

  const API_URL = "http://127.0.0.1:8000";

  // =========================
  // FETCH ROOMS
  // =========================
  const fetchRooms = async () => {
    try {
      setLoading(true);

      const response = await fetch(`${API_URL}/rooms`);

      if (!response.ok) {
        throw new Error("Failed to fetch rooms");
      }

      const data = await response.json();
      setRooms(data);
    } catch (error) {
      console.error("Error fetching rooms:", error);
    } finally {
      setLoading(false);
    }
  };

  // =========================
  // LOAD ROOMS
  // =========================
  useEffect(() => {
    fetchRooms();
  }, []);

  // =========================
  // ADD / UPDATE ROOM
  // =========================
  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!roomName.trim()) {
      alert("Please enter room name");
      return;
    }

    if (!roomType.trim()) {
      alert("Please enter room type");
      return;
    }

    if (!capacity) {
      alert("Please enter room capacity");
      return;
    }

    if (Number(capacity) <= 0) {
      alert("Capacity must be greater than 0");
      return;
    }

    try {
      const params = new URLSearchParams();

      params.append("room_name", roomName.trim());
      params.append("room_type", roomType.trim());
      params.append("capacity", capacity);

      // =========================
      // UPDATE ROOM
      // =========================
      if (editingId !== null) {
        const response = await fetch(
          `${API_URL}/rooms/${editingId}?${params.toString()}`,
          {
            method: "PUT",
          }
        );

        if (!response.ok) {
          const errorData = await response.json();
          console.error("Backend error:", errorData);

          throw new Error("Failed to update room");
        }

        alert("Room updated successfully");

        resetForm();
        await fetchRooms();

        return;
      }

      // =========================
      // ADD ROOM
      // =========================
      const response = await fetch(
        `${API_URL}/rooms?${params.toString()}`,
        {
          method: "POST",
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        console.error("Backend error:", errorData);

        throw new Error("Failed to add room");
      }

      alert("Room added successfully");

      resetForm();
      await fetchRooms();
    } catch (error) {
      console.error("Error saving room:", error);
      alert("Could not save room");
    }
  };

  // =========================
  // EDIT ROOM
  // =========================
  const handleEdit = (room) => {
    setEditingId(room.room_id);

    setRoomName(room.room_name || "");
    setRoomType(room.room_type || "");
    setCapacity(
      room.capacity !== null && room.capacity !== undefined
        ? String(room.capacity)
        : ""
    );
  };

  // =========================
  // DELETE ROOM
  // =========================
  const handleDelete = async (id) => {
    const confirmDelete = window.confirm(
      "Are you sure you want to delete this room?"
    );

    if (!confirmDelete) {
      return;
    }

    try {
      const response = await fetch(`${API_URL}/rooms/${id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error("Backend error:", errorData);

        throw new Error("Failed to delete room");
      }

      alert("Room deleted successfully");

      if (editingId === id) {
        resetForm();
      }

      await fetchRooms();
    } catch (error) {
      console.error("Error deleting room:", error);
      alert("Could not delete room");
    }
  };

  // =========================
  // RESET FORM
  // =========================
  const resetForm = () => {
    setRoomName("");
    setRoomType("");
    setCapacity("");
    setEditingId(null);
  };

  return (
    <div style={{ padding: "30px" }}>
      <h1>Rooms</h1>

      <p>Manage university rooms</p>

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
          placeholder="Enter room name"
          value={roomName}
          onChange={(e) => setRoomName(e.target.value)}
          style={{
            padding: "10px",
          }}
        />

        <input
          type="text"
          placeholder="Enter room type"
          value={roomType}
          onChange={(e) => setRoomType(e.target.value)}
          style={{
            padding: "10px",
          }}
        />

        <input
          type="number"
          placeholder="Enter capacity"
          value={capacity}
          onChange={(e) => setCapacity(e.target.value)}
          min="1"
          style={{
            padding: "10px",
          }}
        />

        <div>
          <button type="submit" style={{ marginRight: "10px" }}>
            {editingId !== null
              ? "Update Room"
              : "Add Room"}
          </button>

          {editingId !== null && (
            <button type="button" onClick={resetForm}>
              Cancel
            </button>
          )}
        </div>
      </form>

      {/* =========================
          ROOM LIST
      ========================== */}
      {loading ? (
        <p>Loading rooms...</p>
      ) : rooms.length === 0 ? (
        <p>No rooms found.</p>
      ) : (
        <table
          border="1"
          cellPadding="10"
          style={{
            borderCollapse: "collapse",
            width: "100%",
            maxWidth: "900px",
          }}
        >
          <thead>
            <tr>
              <th>ID</th>
              <th>Room Name</th>
              <th>Room Type</th>
              <th>Capacity</th>
              <th>Actions</th>
            </tr>
          </thead>

          <tbody>
            {rooms.map((room) => (
              <tr key={room.room_id}>
                <td>{room.room_id}</td>

                <td>{room.room_name}</td>

                <td>{room.room_type}</td>

                <td>{room.capacity}</td>

                <td>
                  <button
                    onClick={() => handleEdit(room)}
                    style={{ marginRight: "10px" }}
                  >
                    Edit
                  </button>

                  <button
                    onClick={() =>
                      handleDelete(room.room_id)
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
export default Rooms;

