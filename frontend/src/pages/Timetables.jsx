import { Fragment, useEffect, useMemo, useState } from "react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";

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
const LUNCH_AFTER_START = 41400;
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

// seconds -> "1:20 PM"
const formatTime = (seconds) => {
  if (seconds === null || seconds === undefined) return "";
  const total = Number(seconds);
  if (Number.isNaN(total)) return "";
  const h24 = Math.floor(total / 3600) % 24;
  const minutes = Math.floor((total % 3600) / 60);
  return `${h24 % 12 || 12}:${String(minutes).padStart(2, "0")} ${h24 < 12 ? "AM" : "PM"}`;
};

// seconds -> "HH:MM" for <input type="time">
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

// ── design tokens ─────────────────────────────────────────────────────────────
const C = {
  bg: "#f8f9fb",
  surface: "#ffffff",
  border: "#e8eaed",
  text: "#0f172a",
  muted: "#64748b",
  accent: "#1e293b",
  faint: "#f1f5f9",
  success: "#166534",
  successBg: "#dcfce7",
  danger: "#991b1b",
  dangerBg: "#fee2e2",
  lunch: "#92400e",
  lunchBg: "#fffbeb",
};

const S = {
  page: {
    padding: "28px 32px 64px",
    maxWidth: 1400,
    margin: "0 auto",
    color: C.text,
    fontFamily: "'Inter',system-ui,sans-serif",
  },
  h1: { margin: 0, fontSize: 26, fontWeight: 700, letterSpacing: "-0.4px" },
  sub: { margin: "4px 0 24px", fontSize: 14, color: C.muted },

  card: {
    background: C.surface,
    border: `1px solid ${C.border}`,
    borderRadius: 12,
    padding: "20px 24px",
    marginBottom: 20,
  },
  cardTitle: { margin: 0, fontSize: 16, fontWeight: 700 },
  cardSub: { margin: "4px 0 14px", fontSize: 13, color: C.muted },

  input: {
    padding: "9px 12px",
    fontSize: 14,
    border: `1px solid ${C.border}`,
    borderRadius: 8,
    background: C.surface,
    color: C.text,
    outline: "none",
    boxSizing: "border-box",
  },
  btnPrimary: {
    padding: "10px 18px",
    background: C.accent,
    color: "#fff",
    border: "none",
    borderRadius: 8,
    fontWeight: 600,
    fontSize: 14,
    cursor: "pointer",
  },
  btnGhost: {
    padding: "8px 14px",
    background: C.surface,
    color: C.accent,
    border: `1px solid ${C.border}`,
    borderRadius: 8,
    fontWeight: 600,
    fontSize: 13,
    cursor: "pointer",
  },
  btnDisabled: { background: "#94a3b8", cursor: "not-allowed" },

  seg: {
    display: "inline-flex",
    background: C.faint,
    borderRadius: 10,
    padding: 3,
    gap: 2,
  },
  segBtn: {
    padding: "7px 14px",
    border: "none",
    borderRadius: 8,
    background: "transparent",
    color: C.muted,
    fontWeight: 600,
    fontSize: 13,
    cursor: "pointer",
  },
  segBtnOn: { background: C.surface, color: C.accent, boxShadow: "0 1px 2px rgba(15,23,42,0.12)" },

  th: {
    padding: "10px 12px",
    textAlign: "left",
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    color: C.muted,
    background: C.faint,
    borderBottom: `1px solid ${C.border}`,
    whiteSpace: "nowrap",
  },
  td: {
    padding: "11px 12px",
    fontSize: 14,
    borderBottom: `1px solid ${C.faint}`,
    verticalAlign: "top",
  },
  gridCell: { padding: 8, border: `1px solid ${C.border}`, verticalAlign: "top" },
};

function Timetable() {
  const [timetables, setTimetables] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [batches, setBatches] = useState([]);

  // manual form
  const [showManual, setShowManual] = useState(false);
  const [dayOfWeek, setDayOfWeek] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [teacherId, setTeacherId] = useState("");
  const [roomId, setRoomId] = useState("");
  const [semester, setSemester] = useState("");
  const [editingId, setEditingId] = useState(null);

  const [loading, setLoading] = useState(true);

  // generate (one batch at a time)
  const [genBatchId, setGenBatchId] = useState("");
  const [generating, setGenerating] = useState(false);
  const [generateMessage, setGenerateMessage] = useState(null);

  // views + filters
  const [viewMode, setViewMode] = useState("grid"); // "grid" | "table" | "daily"
  const [gridBatchId, setGridBatchId] = useState("");
  const [filterDay, setFilterDay] = useState("");
  const [filterTeacherId, setFilterTeacherId] = useState("");
  const [filterRoomId, setFilterRoomId] = useState("");
  const [dailyDay, setDailyDay] = useState("Monday");

  // ── fetchers ────────────────────────────────────────────────────────────────
  const fetchJson = async (path) => {
    const response = await fetch(`${API_URL}${path}`);
    if (!response.ok) throw new Error(`Failed to fetch ${path}`);
    return response.json();
  };

  const fetchTimetables = async () => {
    try {
      setLoading(true);
      setTimetables(await fetchJson("/timetables"));
    } catch (error) {
      console.error("Error fetching timetables:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTimetables();
    fetchJson("/subjects").then(setSubjects).catch(console.error);
    fetchJson("/teachers").then(setTeachers).catch(console.error);
    fetchJson("/rooms").then(setRooms).catch(console.error);
    fetchJson("/batches").then(setBatches).catch(console.error);
  }, []);

  // ── generate one batch ──────────────────────────────────────────────────────
  const handleGenerate = async () => {
    if (!genBatchId) {
      alert("Please select a batch first");
      return;
    }

    const chosen = batches.find((b) => String(b.batch_id) === String(genBatchId));

    const ok = window.confirm(
      `This will replace the timetable of ${chosen ? chosen.batch_name : "this batch"} with a new AI-generated, conflict-free one. Other batches are not changed, and the new timetable will not clash with them. Continue?`
    );
    if (!ok) return;

    try {
      setGenerating(true);
      setGenerateMessage(null);

      const params = new URLSearchParams();
      params.append("batch_id", genBatchId);

      const response = await fetch(
        `${API_URL}/generate-timetable?${params.toString()}`,
        { method: "POST" }
      );
      const data = await response.json();

      if (!response.ok) {
        const detail =
          typeof data.detail === "string" ? data.detail : JSON.stringify(data.detail);
        throw new Error(detail || "Failed to generate timetable");
      }

      const c = data.conflicts || {};
      setGenerateMessage({
        type: "success",
        text: `${data.message} — ${data.sessions_created} classes. Conflicts → Teacher: ${c.teacher ?? 0}, Room: ${c.room ?? 0}, Batch: ${c.batch ?? 0}.`,
      });

      await fetchTimetables();
      setGridBatchId(String(genBatchId));
      setViewMode("grid");
    } catch (error) {
      console.error("Error generating timetable:", error);
      setGenerateMessage({ type: "error", text: error.message });
    } finally {
      setGenerating(false);
    }
  };

  // ── manual add / edit / delete ──────────────────────────────────────────────
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

      const isEdit = editingId !== null;
      const url = isEdit
        ? `${API_URL}/timetables/${editingId}?${params.toString()}`
        : `${API_URL}/timetables?${params.toString()}`;

      const response = await fetch(url, { method: isEdit ? "PUT" : "POST" });
      if (!response.ok) {
        console.error("Backend error:", await response.json());
        throw new Error(isEdit ? "Failed to update timetable" : "Failed to add timetable");
      }

      alert(isEdit ? "Timetable updated successfully" : "Timetable added successfully");
      resetForm();
      setShowManual(false);
      await fetchTimetables();
    } catch (error) {
      console.error("Error saving timetable:", error);
      alert("Could not save timetable");
    }
  };

  const handleEdit = (t) => {
    setEditingId(t.timetable_id);
    setShowManual(true);
    setDayOfWeek(t.day_of_week || "");
    setStartTime(toInputTime(t.start_time));
    setEndTime(toInputTime(t.end_time));

    const s = subjects.find(
      (x) => x.subject_name === t.subject_name && x.subject_code === t.subject_code
    );
    const te = teachers.find((x) => x.teacher_name === t.teacher_name);
    const r = rooms.find(
      (x) =>
        x.room_name === t.room_name &&
        x.room_type?.toLowerCase() === t.room_type?.toLowerCase()
    );

    setSubjectId(s ? String(s.subject_id) : "");
    setTeacherId(te ? String(te.teacher_id) : "");
    setRoomId(r ? String(r.room_id) : "");
    setSemester(t.semester !== null && t.semester !== undefined ? String(t.semester) : "");

    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete this timetable entry?")) return;

    try {
      const response = await fetch(`${API_URL}/timetables/${id}`, { method: "DELETE" });
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

  // ── filters ─────────────────────────────────────────────────────────────────
  const filteredTimetables = useMemo(() => {
    return timetables.filter((t) => {
      if (filterDay && t.day_of_week !== filterDay) return false;
      if (filterTeacherId && String(t.teacher_id) !== String(filterTeacherId)) return false;
      if (filterRoomId && String(t.room_id) !== String(filterRoomId)) return false;
      return true;
    });
  }, [timetables, filterDay, filterTeacherId, filterRoomId]);

  const hasActiveFilters = filterDay || filterTeacherId || filterRoomId;

  const clearFilters = () => {
    setFilterDay("");
    setFilterTeacherId("");
    setFilterRoomId("");
  };

  // ── exports ─────────────────────────────────────────────────────────────────
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

  const dailyEntries = useMemo(() => {
    return filteredTimetables
      .filter((t) => t.day_of_week === dailyDay)
      .sort((a, b) => Number(a.start_time) - Number(b.start_time));
  }, [filteredTimetables, dailyDay]);

  // ── GRID VIEW ───────────────────────────────────────────────────────────────
  const renderGrid = () => {
    const batchIdsWithEntries = [
      ...new Set(filteredTimetables.map((t) => t.batch_id ?? "unassigned")),
    ];

    const batchOptions = batchIdsWithEntries.map((id) => {
      if (id === "unassigned") return { id: "unassigned", label: "Unassigned (no batch set)" };
      const match = batches.find((b) => String(b.batch_id) === String(id));
      return {
        id: String(id),
        label: match
          ? `${match.batch_name} — Sem ${match.semester}${match.section ? ` — Sec ${match.section}` : ""}`
          : `Batch #${id}`,
      };
    });

    const activeBatch =
      gridBatchId && batchOptions.some((o) => o.id === String(gridBatchId))
        ? String(gridBatchId)
        : batchOptions.length > 0
        ? batchOptions[0].id
        : "";

    const filtered = filteredTimetables.filter((t) =>
      activeBatch === "unassigned"
        ? t.batch_id === null || t.batch_id === undefined
        : String(t.batch_id) === String(activeBatch)
    );

    // Standard 7 slots always shown, plus any odd manual slots.
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
    const slots = [...STANDARD_SLOTS, ...extras].sort((a, b) => a.start - b.start);

    const cellLookup = new Map();
    filtered.forEach((t) => cellLookup.set(`${t.day_of_week}|${Number(t.start_time)}`, t));

    return (
      <div>
        <div
          className="no-print"
          style={{ marginBottom: 14, display: "flex", alignItems: "center", gap: 10 }}
        >
          <label style={{ fontWeight: 600, fontSize: 14 }}>Batch</label>
          <select
            value={activeBatch}
            onChange={(e) => setGridBatchId(e.target.value)}
            style={{ ...S.input, minWidth: 280 }}
          >
            {batchOptions.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {filtered.length === 0 ? (
          <p style={{ color: C.muted }}>No timetable entries match the current filters.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                borderCollapse: "collapse",
                width: "100%",
                minWidth: 900,
                background: C.surface,
              }}
            >
              <thead>
                <tr>
                  <th style={{ ...S.th, width: 120, border: `1px solid ${C.border}` }}>Time</th>
                  {GRID_DAYS.map((day) => (
                    <th key={day} style={{ ...S.th, border: `1px solid ${C.border}` }}>
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
                          ...S.gridCell,
                          fontSize: 13,
                          color: C.muted,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {formatTime(slot.start)}
                        <br />
                        {formatTime(slot.end)}
                      </td>

                      {GRID_DAYS.map((day) => {
                        const entry = cellLookup.get(`${day}|${slot.start}`);
                        if (!entry) return <td key={day} style={S.gridCell} />;

                        const color = colorForSubject(entry.subject_code);
                        return (
                          <td key={day} style={S.gridCell}>
                            <div
                              style={{
                                background: color.bg,
                                borderLeft: `3px solid ${color.border}`,
                                borderRadius: 6,
                                padding: "8px 10px",
                              }}
                            >
                              <div style={{ fontWeight: 700, fontSize: 13, color: color.text }}>
                                {entry.subject_code}
                              </div>
                              <div style={{ fontSize: 12, color: "#374151" }}>
                                {entry.teacher_name}
                              </div>
                              <div style={{ fontSize: 11, color: C.muted }}>{entry.room_name}</div>
                            </div>
                          </td>
                        );
                      })}
                    </tr>

                    {slot.start === LUNCH_AFTER_START && (
                      <tr>
                        <td
                          style={{
                            ...S.gridCell,
                            fontSize: 13,
                            color: C.lunch,
                            whiteSpace: "nowrap",
                            background: C.lunchBg,
                          }}
                        >
                          {formatTime(LUNCH_FROM)}
                          <br />
                          {formatTime(LUNCH_TO)}
                        </td>
                        <td
                          colSpan={GRID_DAYS.length}
                          style={{
                            ...S.gridCell,
                            textAlign: "center",
                            fontWeight: 700,
                            letterSpacing: 2,
                            color: C.lunch,
                            background: C.lunchBg,
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
  };

  // ── DAILY VIEW ──────────────────────────────────────────────────────────────
  const renderDaily = () => (
    <div>
      <div
        className="no-print"
        style={{ marginBottom: 14, display: "flex", alignItems: "center", gap: 10 }}
      >
        <label style={{ fontWeight: 600, fontSize: 14 }}>Day</label>
        <select
          value={dailyDay}
          onChange={(e) => setDailyDay(e.target.value)}
          style={{ ...S.input, minWidth: 180 }}
        >
          {GRID_DAYS.map((day) => (
            <option key={day} value={day}>
              {day}
            </option>
          ))}
        </select>
      </div>

      {dailyEntries.length === 0 ? (
        <p style={{ color: C.muted }}>No classes scheduled for {dailyDay} (with current filters).</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
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
                  gap: 8,
                  padding: "14px 18px",
                  background: color.bg,
                  borderLeft: `4px solid ${color.border}`,
                  borderRadius: 8,
                }}
              >
                <div>
                  <strong style={{ color: color.text }}>
                    {t.subject_name} ({t.subject_code})
                  </strong>
                  <div style={{ fontSize: 13, color: "#374151", marginTop: 2 }}>
                    {t.teacher_name} · {t.room_name}
                    {t.batch_name && ` · ${t.batch_name}${t.section ? ` (${t.section})` : ""}`}
                  </div>
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.accent }}>
                  {formatTime(t.start_time)} – {formatTime(t.end_time)}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  // ── TABLE VIEW ──────────────────────────────────────────────────────────────
  const renderTable = () => (
    <div style={{ overflowX: "auto" }}>
      <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 900 }}>
        <thead>
          <tr>
            <th style={S.th}>Day</th>
            <th style={S.th}>Time</th>
            <th style={S.th}>Subject</th>
            <th style={S.th}>Teacher</th>
            <th style={S.th}>Room</th>
            <th style={S.th}>Batch</th>
            <th style={S.th} className="no-print">
              Actions
            </th>
          </tr>
        </thead>
        <tbody>
          {filteredTimetables.length === 0 ? (
            <tr>
              <td style={S.td} colSpan={7}>
                No timetable entries match the current filters.
              </td>
            </tr>
          ) : (
            filteredTimetables.map((t, i) => (
              <tr key={t.timetable_id} style={{ background: i % 2 ? "#fcfcfd" : "transparent" }}>
                <td style={S.td}>{t.day_of_week}</td>
                <td style={{ ...S.td, whiteSpace: "nowrap" }}>
                  {formatTime(t.start_time)} – {formatTime(t.end_time)}
                </td>
                <td style={S.td}>
                  <div style={{ fontWeight: 600 }}>{t.subject_name}</div>
                  <div style={{ fontSize: 12, color: C.muted }}>{t.subject_code}</div>
                </td>
                <td style={S.td}>{t.teacher_name}</td>
                <td style={S.td}>
                  <div>{t.room_name}</div>
                  <div style={{ fontSize: 12, color: C.muted }}>{t.room_type}</div>
                </td>
                <td style={S.td}>
                  <div>{t.batch_name || "—"}</div>
                  <div style={{ fontSize: 12, color: C.muted }}>Semester {t.semester}</div>
                </td>
                <td style={{ ...S.td, whiteSpace: "nowrap" }} className="no-print">
                  <button
                    onClick={() => handleEdit(t)}
                    style={{ ...S.btnGhost, padding: "5px 10px", marginRight: 6 }}
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(t.timetable_id)}
                    style={{
                      ...S.btnGhost,
                      padding: "5px 10px",
                      color: "#dc2626",
                      borderColor: "#fecaca",
                    }}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );

  // ── PAGE ────────────────────────────────────────────────────────────────────
  return (
    <div style={S.page}>
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #printable-timetable, #printable-timetable * { visibility: visible; }
          #printable-timetable { position: absolute; left: 0; top: 0; width: 100%; }
          .no-print { display: none !important; }
        }
      `}</style>

      <h1 style={S.h1}>Timetable</h1>
      <p style={S.sub}>Generate, view and manage the department timetable.</p>

      {/* ── AI GENERATOR ── */}
      <div className="no-print" style={S.card}>
        <h2 style={S.cardTitle}>⚡ AI Timetable Generator</h2>
        <p style={S.cardSub}>
          Pick a batch and generate its conflict-free timetable — 50-minute classes, 1-hour lunch
          (12:20 PM – 1:20 PM), balanced across the week. Other batches stay untouched.
        </p>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <select
            value={genBatchId}
            onChange={(e) => setGenBatchId(e.target.value)}
            style={{ ...S.input, minWidth: 280 }}
          >
            <option value="">Select batch</option>
            {batches.map((batch) => (
              <option key={batch.batch_id} value={batch.batch_id}>
                {batch.batch_name} — Sem {batch.semester}
                {batch.section ? ` — Sec ${batch.section}` : ""}
              </option>
            ))}
          </select>

          <button
            onClick={handleGenerate}
            disabled={generating}
            style={{ ...S.btnPrimary, ...(generating ? S.btnDisabled : {}) }}
          >
            {generating ? "Generating… (up to a minute)" : "🚀 Generate AI Timetable"}
          </button>
        </div>

        {batches.length === 0 && (
          <p style={{ color: C.danger, marginTop: 10, marginBottom: 0, fontSize: 13 }}>
            No batches found — add one on the Batches page first.
          </p>
        )}

        {generateMessage && (
          <div
            style={{
              marginTop: 14,
              padding: "10px 14px",
              borderRadius: 8,
              fontSize: 14,
              whiteSpace: "pre-line",
              background: generateMessage.type === "success" ? C.successBg : C.dangerBg,
              color: generateMessage.type === "success" ? C.success : C.danger,
            }}
          >
            {generateMessage.type === "success" ? "✓ " : ""}
            {generateMessage.text}
          </div>
        )}
      </div>

      {/* ── MANUAL ADD / EDIT (collapsed by default) ── */}
      <div className="no-print" style={S.card}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div>
            <h2 style={S.cardTitle}>
              {editingId !== null ? "✏️ Edit class" : "➕ Add a class manually"}
            </h2>
            <p style={{ ...S.cardSub, margin: "4px 0 0" }}>
              Optional — the AI generator already fills the timetable.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              if (showManual && editingId !== null) resetForm();
              setShowManual(!showManual);
            }}
            style={S.btnGhost}
          >
            {showManual ? "Hide form" : "Show form"}
          </button>
        </div>

        {showManual && (
          <form
            onSubmit={handleSubmit}
            style={{
              marginTop: 18,
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
              gap: 14,
            }}
          >
            <select value={dayOfWeek} onChange={(e) => setDayOfWeek(e.target.value)} style={S.input}>
              <option value="">Select day</option>
              {GRID_DAYS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>

            <label style={{ fontSize: 13, color: C.muted }}>
              Start time
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                style={{ ...S.input, width: "100%", marginTop: 4 }}
              />
            </label>

            <label style={{ fontSize: 13, color: C.muted }}>
              End time
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                style={{ ...S.input, width: "100%", marginTop: 4 }}
              />
            </label>

            <select value={subjectId} onChange={(e) => setSubjectId(e.target.value)} style={S.input}>
              <option value="">Select subject</option>
              {subjects.map((subject) => (
                <option key={subject.subject_id} value={subject.subject_id}>
                  {subject.subject_name} ({subject.subject_code})
                </option>
              ))}
            </select>

            <select value={teacherId} onChange={(e) => setTeacherId(e.target.value)} style={S.input}>
              <option value="">Select teacher</option>
              {teachers.map((teacher) => (
                <option key={teacher.teacher_id} value={teacher.teacher_id}>
                  {teacher.teacher_name}
                </option>
              ))}
            </select>

            <select value={roomId} onChange={(e) => setRoomId(e.target.value)} style={S.input}>
              <option value="">Select room</option>
              {rooms.map((room) => (
                <option key={room.room_id} value={room.room_id}>
                  {room.room_name} ({room.room_type})
                </option>
              ))}
            </select>

            <select value={semester} onChange={(e) => setSemester(e.target.value)} style={S.input}>
              <option value="">Select semester</option>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                <option key={n} value={n}>
                  Semester {n}
                </option>
              ))}
            </select>

            <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
              <button type="submit" style={S.btnPrimary}>
                {editingId !== null ? "Update class" : "Add class"}
              </button>
              {editingId !== null && (
                <button
                  type="button"
                  onClick={() => {
                    resetForm();
                    setShowManual(false);
                  }}
                  style={S.btnGhost}
                >
                  Cancel
                </button>
              )}
            </div>
          </form>
        )}
      </div>

      {/* ── VIEW + FILTERS + EXPORT ── */}
      <div className="no-print" style={S.card}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 12,
            marginBottom: 14,
          }}
        >
          <div style={S.seg}>
            {[
              ["grid", "🗓️ Grid"],
              ["daily", "📆 Daily"],
              ["table", "📋 Table"],
            ].map(([mode, label]) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                style={{ ...S.segBtn, ...(viewMode === mode ? S.segBtnOn : {}) }}
              >
                {label}
              </button>
            ))}
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button onClick={() => window.print()} style={S.btnGhost}>
              🖨️ Print
            </button>
            <button onClick={handleExportExcel} style={S.btnGhost}>
              📊 Excel
            </button>
            <button onClick={handleExportPDF} style={S.btnGhost}>
              📄 PDF
            </button>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: C.muted }}>Filters</span>

          <select value={filterDay} onChange={(e) => setFilterDay(e.target.value)} style={S.input}>
            <option value="">All days</option>
            {GRID_DAYS.map((day) => (
              <option key={day} value={day}>
                {day}
              </option>
            ))}
          </select>

          <select
            value={filterTeacherId}
            onChange={(e) => setFilterTeacherId(e.target.value)}
            style={{ ...S.input, minWidth: 180 }}
          >
            <option value="">All teachers</option>
            {teachers.map((t) => (
              <option key={t.teacher_id} value={t.teacher_id}>
                {t.teacher_name}
              </option>
            ))}
          </select>

          <select
            value={filterRoomId}
            onChange={(e) => setFilterRoomId(e.target.value)}
            style={{ ...S.input, minWidth: 150 }}
          >
            <option value="">All rooms</option>
            {rooms.map((r) => (
              <option key={r.room_id} value={r.room_id}>
                {r.room_name}
              </option>
            ))}
          </select>

          {hasActiveFilters && (
            <button onClick={clearFilters} style={S.btnGhost}>
              ✕ Clear
            </button>
          )}
        </div>
      </div>

      {/* ── TIMETABLE ── */}
      <div style={S.card}>
        {loading ? (
          <p style={{ color: C.muted, margin: 0 }}>Loading timetable…</p>
        ) : timetables.length === 0 ? (
          <p style={{ color: C.muted, margin: 0 }}>
            No timetable yet. Select a batch above and click “Generate AI Timetable”.
          </p>
        ) : (
          <div id="printable-timetable">
            {viewMode === "grid" ? renderGrid() : viewMode === "daily" ? renderDaily() : renderTable()}
          </div>
        )}
      </div>
    </div>
  );
}

export default Timetable;