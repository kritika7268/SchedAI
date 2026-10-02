import { Fragment, useEffect, useMemo, useState } from "react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";

function Timetable() {
  const [timetables, setTimetables] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [rooms, setRooms] = useState([]);

  const [dayOfWeek, setDayOfWeek] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [teacherId, setTeacherId] = useState("");
  const [roomId, setRoomId] = useState("");
  const [semester, setSemester] = useState("");

  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(true);

  // =========================
  // GENERATE TIMETABLE (ONE CLICK, ALL BATCHES)
  // =========================
  const [batches, setBatches] = useState([]);
  const [generating, setGenerating] = useState(false);
  const [generateMessage, setGenerateMessage] = useState(null);

  // =========================
  // VIEW MODE + FILTERS
  // =========================
  const [viewMode, setViewMode] = useState("grid"); // "grid" | "table" | "daily"
  const [gridBatchId, setGridBatchId] = useState("");

  const [filterDay, setFilterDay] = useState("");
  const [filterTeacherId, setFilterTeacherId] = useState("");
  const [filterRoomId, setFilterRoomId] = useState("");
  const [dailyDay, setDailyDay] = useState("Monday");

  const API_URL = "http://127.0.0.1:8000";

  // Working days: Monday - Friday
  const GRID_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

  // 50-minute classes. Lunch break is 12:20 PM - 1:20 PM (1 hour).
  // Values are seconds since midnight.
  const STANDARD_SLOTS = [
    { start: 32400, end: 35400 }, //  9:00 -  9:50
    { start: 35400, end: 38400 }, //  9:50 - 10:40
    { start: 38400, end: 41400 }, // 10:40 - 11:30
    { start: 41400, end: 44400 }, // 11:30 - 12:20
    { start: 48000, end: 51000 }, //  1:20 -  2:10
    { start: 51000, end: 54000 }, //  2:10 -  3:00
    { start: 54000, end: 57000 }, //  3:00 -  3:50
  ];
  const LUNCH_AFTER_START = 41400; // lunch row is shown after the 11:30 slot
  const LUNCH_FROM = 44400; // 12:20 PM
  const LUNCH_TO = 48000; //  1:20 PM

  const SUBJECT_COLORS = [
    { bg: "#eef2ff", border: "#6366f1", text: "#3730a3" },
    { bg: "#ecfdf5", border: "#10b981", text: "#065f46" },
    { bg: "#fff7ed", border: "#f97316", text: "#9a3412" },
    { bg: "#fdf2f8", border: "#ec4899", text: "#9d174d" },
    { bg: "#eff6ff", border: "#3b82f6", text: "#1e40af" },
    { bg: "#fefce8", border: "#eab308", text: "#854d0e" },
    { bg: "#f0fdfa", border: "#14b8a6", text: "#115e59" },
    { bg: "#f5f3ff", border: "#8b5cf6", text: "#5b21b6" },
  ];

  const colorForSubject = (subjectCode) => {
    if (!subjectCode) return SUBJECT_COLORS[0];
    let hash = 0;
    for (let i = 0; i < subjectCode.length; i++) {
      hash = subjectCode.charCodeAt(i) + ((hash << 5) - hash);
    }
    return SUBJECT_COLORS[Math.abs(hash) % SUBJECT_COLORS.length];
  };

  // =========================
  // SECONDS -> 12-HOUR TIME  (48000 -> "1:20 PM")
  // =========================
  const formatTime = (seconds) => {
    if (seconds === null || seconds === undefined) return "";
    const total = Number(seconds);
    if (Number.isNaN(total)) return "";

    const h24 = Math.floor(total / 3600) % 24;
    const minutes = Math.floor((total % 3600) / 60);
    const h12 = h24 % 12 || 12;
    const suffix = h24 < 12 ? "AM" : "PM";

    return `${h12}:${String(minutes).padStart(2, "0")} ${suffix}`;
  };

  // "HH:MM" (24h, used by <input type="time">) from seconds
  const toInputTime = (seconds) => {
    const total = Number(seconds);
    if (Number.isNaN(total)) return "";
    const h = Math.floor(total / 3600) % 24;
    const m = Math.floor((total % 3600) / 60);
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  };

  const timeToSeconds = (time) => {
    const [hours, minutes] = time.split(":").map(Number);
    return hours * 3600 + minutes * 60;
  };

  // =========================
  // FETCHERS
  // =========================
  const fetchTimetables = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_URL}/timetables`);
      if (!response.ok) throw new Error("Failed to fetch timetables");
      setTimetables(await response.json());
    } catch (error) {
      console.error("Error fetching timetables:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchSubjects = async () => {
    try {
      const response = await fetch(`${API_URL}/subjects`);
      if (!response.ok) throw new Error("Failed to fetch subjects");
      setSubjects(await response.json());
    } catch (error) {
      console.error("Error fetching subjects:", error);
    }
  };

  const fetchTeachers = async () => {
    try {
      const response = await fetch(`${API_URL}/teachers`);
      if (!response.ok) throw new Error("Failed to fetch teachers");
      setTeachers(await response.json());
    } catch (error) {
      console.error("Error fetching teachers:", error);
    }
  };

  const fetchRooms = async () => {
    try {
      const response = await fetch(`${API_URL}/rooms`);
      if (!response.ok) throw new Error("Failed to fetch rooms");
      setRooms(await response.json());
    } catch (error) {
      console.error("Error fetching rooms:", error);
    }
  };

  const fetchBatches = async () => {
    try {
      const response = await fetch(`${API_URL}/batches`);
      if (!response.ok) throw new Error("Failed to fetch batches");
      setBatches(await response.json());
    } catch (error) {
      console.error("Error fetching batches:", error);
    }
  };

  useEffect(() => {
    fetchTimetables();
    fetchSubjects();
    fetchTeachers();
    fetchRooms();
    fetchBatches();
  }, []);

  // =========================
  // ONE CLICK: GENERATE FOR ALL BATCHES
  // =========================
  const handleGenerate = async () => {
    const confirmGenerate = window.confirm(
      "This will replace the timetable of ALL batches with a new AI-generated, conflict-free one (50-minute classes, 1-hour lunch). Existing substitution records will also be cleared. Continue?"
    );

    if (!confirmGenerate) return;

    try {
      setGenerating(true);
      setGenerateMessage(null);

      const response = await fetch(`${API_URL}/generate-timetable`, {
        method: "POST",
      });

      const data = await response.json();

      if (!response.ok) {
        const detail =
          typeof data.detail === "string"
            ? data.detail
            : JSON.stringify(data.detail);
        throw new Error(detail || "Failed to generate timetable");
      }

      const c = data.conflicts || {};
      setGenerateMessage({
        type: "success",
        text: `${data.message} — ${data.sessions_created} classes for ${data.batches} batches. Conflicts → Teacher: ${c.teacher ?? 0}, Room: ${c.room ?? 0}, Batch: ${c.batch ?? 0}.`,
        skipped: data.skipped_batches || [],
      });

      await fetchTimetables();
    } catch (error) {
      console.error("Error generating timetable:", error);
      setGenerateMessage({ type: "error", text: error.message, skipped: [] });
    } finally {
      setGenerating(false);
    }
  };

  // =========================
  // ADD / UPDATE (manual)
  // =========================
  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!dayOfWeek) return alert("Please select day");
    if (!startTime) return alert("Please select start time");
    if (!endTime) return alert("Please select end time");
    if (startTime >= endTime) return alert("End time must be after start time");
    if (!subjectId) return alert("Please select subject");
    if (!teacherId) return alert("Please select teacher");
    if (!roomId) return alert("Please select room");
    if (!semester) return alert("Please select semester");

    try {
      const params = new URLSearchParams();
      params.append("day_of_week", dayOfWeek);
      params.append("start_time", timeToSeconds(startTime));
      params.append("end_time", timeToSeconds(endTime));
      params.append("subject_id", subjectId);
      params.append("teacher_id", teacherId);
      params.append("room_id", roomId);
      params.append("semester", semester);

      if (editingId !== null) {
        const response = await fetch(
          `${API_URL}/timetables/${editingId}?${params.toString()}`,
          { method: "PUT" }
        );
        if (!response.ok) {
          console.error("Backend error:", await response.json());
          throw new Error("Failed to update timetable");
        }
        alert("Timetable updated successfully");
        resetForm();
        await fetchTimetables();
        return;
      }

      const response = await fetch(
        `${API_URL}/timetables?${params.toString()}`,
        { method: "POST" }
      );
      if (!response.ok) {
        console.error("Backend error:", await response.json());
        throw new Error("Failed to add timetable");
      }
      alert("Timetable added successfully");
      resetForm();
      await fetchTimetables();
    } catch (error) {
      console.error("Error saving timetable:", error);
      alert("Could not save timetable");
    }
  };

  const handleEdit = (timetable) => {
    setEditingId(timetable.timetable_id);
    setDayOfWeek(timetable.day_of_week || "");
    setStartTime(toInputTime(timetable.start_time));
    setEndTime(toInputTime(timetable.end_time));

    const selectedSubject = subjects.find(
      (s) =>
        s.subject_name === timetable.subject_name &&
        s.subject_code === timetable.subject_code
    );
    const selectedTeacher = teachers.find(
      (t) => t.teacher_name === timetable.teacher_name
    );
    const selectedRoom = rooms.find(
      (r) =>
        r.room_name === timetable.room_name &&
        r.room_type?.toLowerCase() === timetable.room_type?.toLowerCase()
    );

    setSubjectId(selectedSubject ? String(selectedSubject.subject_id) : "");
    setTeacherId(selectedTeacher ? String(selectedTeacher.teacher_id) : "");
    setRoomId(selectedRoom ? String(selectedRoom.room_id) : "");
    setSemester(
      timetable.semester !== null && timetable.semester !== undefined
        ? String(timetable.semester)
        : ""
    );

    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete this timetable entry?"))
      return;

    try {
      const response = await fetch(`${API_URL}/timetables/${id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        console.error("Backend error:", await response.json());
        throw new Error("Failed to delete timetable");
      }
      alert("Timetable deleted successfully");
      if (editingId === id) resetForm();
      await fetchTimetables();
    } catch (error) {
      console.error("Error deleting timetable:", error);
      alert("Could not delete timetable");
    }
  };

  const resetForm = () => {
    setDayOfWeek("");
    setStartTime("");
    setEndTime("");
    setSubjectId("");
    setTeacherId("");
    setRoomId("");
    setSemester("");
    setEditingId(null);
  };

  // =========================
  // GLOBAL FILTERS
  // =========================
  const filteredTimetables = useMemo(() => {
    return timetables.filter((t) => {
      if (filterDay && t.day_of_week !== filterDay) return false;
      if (filterTeacherId && String(t.teacher_id) !== String(filterTeacherId))
        return false;
      if (filterRoomId && String(t.room_id) !== String(filterRoomId))
        return false;
      return true;
    });
  }, [timetables, filterDay, filterTeacherId, filterRoomId]);

  const hasActiveFilters = filterDay || filterTeacherId || filterRoomId;

  const clearFilters = () => {
    setFilterDay("");
    setFilterTeacherId("");
    setFilterRoomId("");
  };

  // =========================
  // EXPORTS
  // =========================
  const handlePrint = () => window.print();

  const handleExportExcel = () => {
    const rows = filteredTimetables.map((t) => ({
      Day: t.day_of_week,
      "Start Time": formatTime(t.start_time),
      "End Time": formatTime(t.end_time),
      Subject: t.subject_name,
      Code: t.subject_code,
      Teacher: t.teacher_name,
      Room: t.room_name,
      Batch: t.batch_name || "—",
      Section: t.section || "—",
      Semester: t.semester,
    }));

    if (rows.length === 0) {
      alert("No timetable entries to export with the current filters.");
      return;
    }

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Timetable");
    XLSX.writeFile(workbook, "SchedAI_Timetable.xlsx");
  };

  const handleExportPDF = () => {
    if (filteredTimetables.length === 0) {
      alert("No timetable entries to export with the current filters.");
      return;
    }

    const doc = new jsPDF({ orientation: "landscape" });
    doc.setFontSize(16);
    doc.text("SchedAI — Timetable", 14, 16);

    const rows = filteredTimetables
      .slice()
      .sort((a, b) => Number(a.start_time) - Number(b.start_time))
      .map((t) => [
        t.day_of_week,
        `${formatTime(t.start_time)} - ${formatTime(t.end_time)}`,
        `${t.subject_name} (${t.subject_code})`,
        t.teacher_name,
        t.room_name,
        t.batch_name ? `${t.batch_name}${t.section ? " " + t.section : ""}` : "—",
        `Sem ${t.semester}`,
      ]);

    autoTable(doc, {
      startY: 22,
      head: [["Day", "Time", "Subject", "Teacher", "Room", "Batch", "Semester"]],
      body: rows,
      styles: { fontSize: 9 },
      headStyles: { fillColor: [30, 41, 59] },
    });

    doc.save("SchedAI_Timetable.pdf");
  };

  // =========================
  // DAILY VIEW
  // =========================
  const dailyEntries = useMemo(() => {
    return filteredTimetables
      .filter((t) => t.day_of_week === dailyDay)
      .sort((a, b) => Number(a.start_time) - Number(b.start_time));
  }, [filteredTimetables, dailyDay]);

  return (
    <div style={{ padding: "30px", maxWidth: "1400px", margin: "0 auto" }}>
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #printable-timetable, #printable-timetable * { visibility: visible; }
          #printable-timetable { position: absolute; left: 0; top: 0; width: 100%; }
          .no-print { display: none !important; }
        }
      `}</style>

      <h1>Timetable Management</h1>
      <p>Generate and manage the department timetable.</p>

      {/* =========================
          ONE-CLICK AI GENERATE PANEL
      ========================== */}
      <div
        className="no-print"
        style={{
          marginBottom: "30px",
          padding: "20px",
          border: "2px solid #1e293b",
          borderRadius: "8px",
          maxWidth: "700px",
          background: "#f8fafc",
        }}
      >
        <h2 style={{ marginTop: 0 }}>⚡ AI Timetable Generator</h2>
        <p style={{ color: "#6b7280", marginTop: "-8px" }}>
          One click generates a conflict-free timetable for <b>all batches</b>{" "}
          using the OR-Tools solver — 50-minute classes, 1-hour lunch break
          (12:20 PM – 1:20 PM), balanced classes across the week. Batches
          without subjects or teacher skills are skipped automatically.
        </p>

        <button
          onClick={handleGenerate}
          disabled={generating}
          style={{
            padding: "12px 22px",
            background: generating ? "#94a3b8" : "#1e293b",
            color: "white",
            fontWeight: "600",
            fontSize: "15px",
            cursor: generating ? "not-allowed" : "pointer",
          }}
        >
          {generating
            ? "Generating… (can take up to a minute)"
            : "🚀 Generate AI Timetable"}
        </button>

        {generateMessage && (
          <div
            style={{
              marginTop: "14px",
              padding: "10px 14px",
              borderRadius: "6px",
              whiteSpace: "pre-line",
              background:
                generateMessage.type === "success" ? "#dcfce7" : "#fee2e2",
              color:
                generateMessage.type === "success" ? "#166534" : "#991b1b",
            }}
          >
            {generateMessage.type === "success" ? "✓ " : ""}
            {generateMessage.text}

            {generateMessage.skipped?.length > 0 && (
              <div style={{ marginTop: "8px", color: "#92400e" }}>
                <b>Skipped batches:</b>
                <ul style={{ margin: "4px 0 0", paddingLeft: "20px" }}>
                  {generateMessage.skipped.map((s) => (
                    <li key={s.batch_name}>
                      {s.batch_name} — {s.reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>

      {/* =========================
          MANUAL ADD / EDIT FORM
      ========================== */}
      <form
        className="no-print"
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
        <h2>
          {editingId !== null ? "Edit Timetable" : "Add Timetable (manual)"}
        </h2>

        <select
          value={dayOfWeek}
          onChange={(e) => setDayOfWeek(e.target.value)}
          style={{ padding: "10px" }}
        >
          <option value="">Select Day</option>
          {GRID_DAYS.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>

        <label>
          Start Time
          <input
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            style={{
              padding: "10px",
              width: "100%",
              boxSizing: "border-box",
              marginTop: "5px",
            }}
          />
        </label>

        <label>
          End Time
          <input
            type="time"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            style={{
              padding: "10px",
              width: "100%",
              boxSizing: "border-box",
              marginTop: "5px",
            }}
          />
        </label>

        <select
          value={subjectId}
          onChange={(e) => setSubjectId(e.target.value)}
          style={{ padding: "10px" }}
        >
          <option value="">Select Subject</option>
          {subjects.map((subject) => (
            <option key={subject.subject_id} value={subject.subject_id}>
              {subject.subject_name} ({subject.subject_code})
            </option>
          ))}
        </select>

        <select
          value={teacherId}
          onChange={(e) => setTeacherId(e.target.value)}
          style={{ padding: "10px" }}
        >
          <option value="">Select Teacher</option>
          {teachers.map((teacher) => (
            <option key={teacher.teacher_id} value={teacher.teacher_id}>
              {teacher.teacher_name}
            </option>
          ))}
        </select>

        <select
          value={roomId}
          onChange={(e) => setRoomId(e.target.value)}
          style={{ padding: "10px" }}
        >
          <option value="">Select Room</option>
          {rooms.map((room) => (
            <option key={room.room_id} value={room.room_id}>
              {room.room_name} ({room.room_type})
            </option>
          ))}
        </select>

        <select
          value={semester}
          onChange={(e) => setSemester(e.target.value)}
          style={{ padding: "10px" }}
        >
          <option value="">Select Semester</option>
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
            <option key={n} value={n}>
              Semester {n}
            </option>
          ))}
        </select>

        <div>
          <button
            type="submit"
            style={{ marginRight: "10px", padding: "10px 16px" }}
          >
            {editingId !== null ? "Update Timetable" : "Add Timetable"}
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

      {/* =========================
          VIEW SWITCH + FILTERS + EXPORT TOOLBAR
      ========================== */}
      <div
        className="no-print"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "12px",
          marginBottom: "16px",
        }}
      >
        <h2 style={{ margin: 0 }}>Existing Timetable</h2>

        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          {[
            ["grid", "🗓️ Grid View"],
            ["table", "📋 Table View"],
            ["daily", "📆 Daily View"],
          ].map(([mode, label]) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              style={{
                padding: "8px 14px",
                background: viewMode === mode ? "#1e293b" : "white",
                color: viewMode === mode ? "white" : "#1e293b",
                border: "1px solid #1e293b",
                fontWeight: "600",
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div
        className="no-print"
        style={{
          display: "flex",
          gap: "12px",
          flexWrap: "wrap",
          alignItems: "center",
          marginBottom: "16px",
          padding: "14px 16px",
          background: "#f8fafc",
          border: "1px solid #e5e7eb",
          borderRadius: "8px",
        }}
      >
        <strong style={{ fontSize: "13px", color: "#374151" }}>Filters:</strong>

        <select
          value={filterDay}
          onChange={(e) => setFilterDay(e.target.value)}
          style={{ padding: "8px" }}
        >
          <option value="">All Days</option>
          {GRID_DAYS.map((day) => (
            <option key={day} value={day}>
              {day}
            </option>
          ))}
        </select>

        <select
          value={filterTeacherId}
          onChange={(e) => setFilterTeacherId(e.target.value)}
          style={{ padding: "8px", minWidth: "180px" }}
        >
          <option value="">All Teachers</option>
          {teachers.map((t) => (
            <option key={t.teacher_id} value={t.teacher_id}>
              {t.teacher_name}
            </option>
          ))}
        </select>

        <select
          value={filterRoomId}
          onChange={(e) => setFilterRoomId(e.target.value)}
          style={{ padding: "8px", minWidth: "160px" }}
        >
          <option value="">All Rooms</option>
          {rooms.map((r) => (
            <option key={r.room_id} value={r.room_id}>
              {r.room_name}
            </option>
          ))}
        </select>

        {hasActiveFilters && (
          <button
            onClick={clearFilters}
            style={{
              padding: "8px 14px",
              background: "white",
              border: "1px solid #cbd5e1",
              color: "#475569",
            }}
          >
            ✕ Clear filters
          </button>
        )}

        <div style={{ marginLeft: "auto", display: "flex", gap: "8px" }}>
          <button
            onClick={handlePrint}
            style={{ padding: "8px 14px", background: "white", border: "1px solid #1e293b", color: "#1e293b", fontWeight: "600" }}
          >
            🖨️ Print
          </button>
          <button
            onClick={handleExportExcel}
            style={{ padding: "8px 14px", background: "white", border: "1px solid #16a34a", color: "#16a34a", fontWeight: "600" }}
          >
            📊 Export Excel
          </button>
          <button
            onClick={handleExportPDF}
            style={{ padding: "8px 14px", background: "white", border: "1px solid #dc2626", color: "#dc2626", fontWeight: "600" }}
          >
            📄 Export PDF
          </button>
        </div>
      </div>

      {loading ? (
        <p>Loading timetable...</p>
      ) : timetables.length === 0 ? (
        <p>No timetable entries found. Click “Generate AI Timetable” above.</p>
      ) : (
        <div id="printable-timetable">
          {viewMode === "grid" ? (
            (() => {
              const batchIdsWithEntries = [
                ...new Set(
                  filteredTimetables.map((t) => t.batch_id ?? "unassigned")
                ),
              ];

              const batchOptions = batchIdsWithEntries.map((id) => {
                if (id === "unassigned") {
                  return { id: "unassigned", label: "Unassigned (no batch set)" };
                }
                const match = batches.find(
                  (b) => String(b.batch_id) === String(id)
                );
                return {
                  id: String(id),
                  label: match
                    ? `${match.batch_name} — Sem ${match.semester}${
                        match.section ? ` — Sec ${match.section}` : ""
                      }`
                    : `Batch #${id}`,
                };
              });

              const activeBatch =
                gridBatchId ||
                (batchOptions.length > 0 ? batchOptions[0].id : "");

              const filtered = filteredTimetables.filter((t) =>
                activeBatch === "unassigned"
                  ? t.batch_id === null || t.batch_id === undefined
                  : String(t.batch_id) === String(activeBatch)
              );

              // Standard 7 slots always shown (even if empty), plus any
              // old manual entries that don't match the standard slots.
              const standardStarts = new Set(STANDARD_SLOTS.map((s) => s.start));
              const extras = [
                ...new Map(
                  filtered
                    .filter((t) => !standardStarts.has(Number(t.start_time)))
                    .map((t) => [
                      `${t.start_time}-${t.end_time}`,
                      { start: Number(t.start_time), end: Number(t.end_time) },
                    ])
                ).values(),
              ];
              const slots = [...STANDARD_SLOTS, ...extras].sort(
                (a, b) => a.start - b.start
              );

              const cellLookup = new Map();
              filtered.forEach((t) => {
                cellLookup.set(`${t.day_of_week}|${Number(t.start_time)}`, t);
              });

              const cellStyle = {
                padding: "10px",
                border: "1px solid #e5e7eb",
              };

              return (
                <div>
                  <div
                    className="no-print"
                    style={{
                      marginBottom: "16px",
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                    }}
                  >
                    <label style={{ fontWeight: "600" }}>Batch:</label>
                    <select
                      value={activeBatch}
                      onChange={(e) => setGridBatchId(e.target.value)}
                      style={{ padding: "8px", minWidth: "260px" }}
                    >
                      {batchOptions.map((opt) => (
                        <option key={opt.id} value={opt.id}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {filtered.length === 0 ? (
                    <p>No timetable entries match the current filters.</p>
                  ) : (
                    <div style={{ overflowX: "auto" }}>
                      <table
                        style={{
                          borderCollapse: "collapse",
                          width: "100%",
                          minWidth: "900px",
                          background: "white",
                        }}
                      >
                        <thead>
                          <tr>
                            <th
                              style={{
                                ...cellStyle,
                                background: "#f1f5f9",
                                width: "120px",
                                textAlign: "left",
                              }}
                            >
                              Time
                            </th>
                            {GRID_DAYS.map((day) => (
                              <th
                                key={day}
                                style={{
                                  ...cellStyle,
                                  background: "#f1f5f9",
                                  textAlign: "left",
                                }}
                              >
                                {day}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {slots.map((slot) => (
                            <Fragment key={`${slot.start}-${slot.end}`}>
                              <tr>
                                <td
                                  style={{
                                    ...cellStyle,
                                    fontSize: "13px",
                                    color: "#475569",
                                    whiteSpace: "nowrap",
                                    verticalAlign: "top",
                                  }}
                                >
                                  {formatTime(slot.start)}
                                  <br />
                                  {formatTime(slot.end)}
                                </td>

                                {GRID_DAYS.map((day) => {
                                  const entry = cellLookup.get(
                                    `${day}|${slot.start}`
                                  );

                                  if (!entry) {
                                    return <td key={day} style={cellStyle} />;
                                  }

                                  const color = colorForSubject(entry.subject_code);

                                  return (
                                    <td
                                      key={day}
                                      style={{
                                        padding: "8px",
                                        border: "1px solid #e5e7eb",
                                        verticalAlign: "top",
                                      }}
                                    >
                                      <div
                                        style={{
                                          background: color.bg,
                                          borderLeft: `3px solid ${color.border}`,
                                          borderRadius: "4px",
                                          padding: "8px 10px",
                                        }}
                                      >
                                        <div
                                          style={{
                                            fontWeight: "700",
                                            fontSize: "13px",
                                            color: color.text,
                                          }}
                                        >
                                          {entry.subject_code}
                                        </div>
                                        <div style={{ fontSize: "12px", color: "#374151" }}>
                                          {entry.teacher_name}
                                        </div>
                                        <div style={{ fontSize: "11px", color: "#6b7280" }}>
                                          {entry.room_name}
                                        </div>
                                      </div>
                                    </td>
                                  );
                                })}
                              </tr>

                              {/* LUNCH BREAK ROW (after the 11:30 slot) */}
                              {slot.start === LUNCH_AFTER_START && (
                                <tr key="lunch-row">
                                  <td
                                    style={{
                                      ...cellStyle,
                                      fontSize: "13px",
                                      color: "#92400e",
                                      whiteSpace: "nowrap",
                                      background: "#fffbeb",
                                    }}
                                  >
                                    {formatTime(LUNCH_FROM)}
                                    <br />
                                    {formatTime(LUNCH_TO)}
                                  </td>
                                  <td
                                    colSpan={GRID_DAYS.length}
                                    style={{
                                      ...cellStyle,
                                      textAlign: "center",
                                      fontWeight: "700",
                                      letterSpacing: "2px",
                                      color: "#92400e",
                                      background: "#fffbeb",
                                    }}
                                  >
                                    🍽️ LUNCH BREAK
                                  </td>
                                </tr>
                              )}
                            </Fragment>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })()
          ) : viewMode === "daily" ? (
            <div>
              <div
                className="no-print"
                style={{
                  marginBottom: "16px",
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                }}
              >
                <label style={{ fontWeight: "600" }}>Day:</label>
                <select
                  value={dailyDay}
                  onChange={(e) => setDailyDay(e.target.value)}
                  style={{ padding: "8px", minWidth: "180px" }}
                >
                  {GRID_DAYS.map((day) => (
                    <option key={day} value={day}>
                      {day}
                    </option>
                  ))}
                </select>
              </div>

              {dailyEntries.length === 0 ? (
                <p>No classes scheduled for {dailyDay} (with current filters).</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  {dailyEntries.map((t) => {
                    const color = colorForSubject(t.subject_code);
                    return (
                      <div
                        key={t.timetable_id}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          flexWrap: "wrap",
                          gap: "8px",
                          padding: "14px 18px",
                          background: color.bg,
                          borderLeft: `4px solid ${color.border}`,
                          borderRadius: "6px",
                        }}
                      >
                        <div>
                          <strong style={{ color: color.text }}>
                            {t.subject_name} ({t.subject_code})
                          </strong>
                          <div style={{ fontSize: "13px", color: "#374151", marginTop: "2px" }}>
                            {t.teacher_name} · {t.room_name}
                            {t.batch_name && ` · ${t.batch_name}${t.section ? ` (${t.section})` : ""}`}
                          </div>
                        </div>
                        <div style={{ fontSize: "13px", fontWeight: "600", color: "#1e293b" }}>
                          {formatTime(t.start_time)} – {formatTime(t.end_time)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table
                border="1"
                cellPadding="10"
                style={{
                  borderCollapse: "collapse",
                  width: "100%",
                  minWidth: "1000px",
                }}
              >
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Day</th>
                    <th>Start Time</th>
                    <th>End Time</th>
                    <th>Subject</th>
                    <th>Teacher</th>
                    <th>Room</th>
                    <th>Batch</th>
                    <th className="no-print">Actions</th>
                  </tr>
                </thead>

                <tbody>
                  {filteredTimetables.length === 0 ? (
                    <tr>
                      <td colSpan="9">No timetable entries match the current filters.</td>
                    </tr>
                  ) : (
                    filteredTimetables.map((timetable) => (
                      <tr key={timetable.timetable_id}>
                        <td>{timetable.timetable_id}</td>
                        <td>{timetable.day_of_week}</td>
                        <td>{formatTime(timetable.start_time)}</td>
                        <td>{formatTime(timetable.end_time)}</td>
                        <td>
                          {timetable.subject_name}
                          <br />
                          <small>{timetable.subject_code}</small>
                        </td>
                        <td>{timetable.teacher_name}</td>
                        <td>
                          {timetable.room_name}
                          <br />
                          <small>{timetable.room_type}</small>
                        </td>
                        <td>
                          {timetable.batch_name || "—"}
                          <br />
                          <small>Semester {timetable.semester}</small>
                        </td>
                        <td className="no-print">
                          <button
                            onClick={() => handleEdit(timetable)}
                            style={{ marginRight: "8px" }}
                          >
                            Edit
                          </button>
                          <button onClick={() => handleDelete(timetable.timetable_id)}>
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default Timetable;