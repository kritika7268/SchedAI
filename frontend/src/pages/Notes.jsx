import { useEffect, useState, useMemo } from "react";
import { useAuth } from "../auth/AuthContext";

const API_URL = "http://127.0.0.1:8000";

function Notes() {
  const { user } = useAuth(); // { access_token, role, name, user_id, teacher_id, student_id }
  const token = user?.access_token;
  const role = user?.role;

  const [notes, setNotes] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState(null);

  // Upload form
  const [subjectId, setSubjectId] = useState("");
  const [teacherId, setTeacherId] = useState(role === "teacher" ? String(user?.teacher_id || "") : "");
  const [batchId, setBatchId] = useState("");
  const [semester, setSemester] = useState(""); // auto-filled from the chosen batch
  const [unit, setUnit] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);

  // Filters
  const [filterSubject, setFilterSubject] = useState("");
  const [filterBatch, setFilterBatch] = useState("");

  const authHeaders = { Authorization: `Bearer ${token}` };

  // ── fetch reference data (no auth needed) + notes (auth needed) ──────────
  const fetchReferenceData = async () => {
    try {
      const [subjectsRes, teachersRes, batchesRes] = await Promise.all([
        fetch(`${API_URL}/subjects`),
        fetch(`${API_URL}/teachers`),
        fetch(`${API_URL}/batches`),
      ]);
      setSubjects(subjectsRes.ok ? await subjectsRes.json() : []);
      setTeachers(teachersRes.ok ? await teachersRes.json() : []);
      setBatches(batchesRes.ok ? await batchesRes.json() : []);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchNotes = async () => {
    try {
      setLoading(true);
      setListError(null);
      const params = new URLSearchParams();
      if (filterSubject) params.append("subject_id", filterSubject);
      if (filterBatch) params.append("batch_id", filterBatch);

      const res = await fetch(`${API_URL}/notes?${params.toString()}`, {
        headers: authHeaders,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Failed to load notes");
      }
      setNotes(await res.json());
    } catch (e) {
      setListError(e.message);
      setNotes([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReferenceData();
  }, []);

  useEffect(() => {
    if (token) fetchNotes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, filterSubject, filterBatch]);

  // ── when a batch is picked, auto-fill its semester (backend requires a match) ──
  const handleBatchChange = (id) => {
    setBatchId(id);
    const match = batches.find((b) => String(b.batch_id) === String(id));
    setSemester(match ? String(match.semester) : "");
  };

  const resetForm = () => {
    setSubjectId("");
    if (role !== "teacher") setTeacherId("");
    setBatchId("");
    setSemester("");
    setUnit("");
    setTitle("");
    setDescription("");
    setFile(null);
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    setUploadError(null);

    if (!subjectId || !teacherId || !batchId || !semester || !unit.trim() || !title.trim() || !file) {
      setUploadError("Please fill subject, teacher, batch, unit, title and choose a PDF file.");
      return;
    }
    if (file.type !== "application/pdf") {
      setUploadError("Only PDF files are allowed.");
      return;
    }

    try {
      setUploading(true);

      const params = new URLSearchParams({
        subject_id: subjectId,
        teacher_id: teacherId,
        batch_id: batchId,
        semester: semester,
        unit: unit.trim(),
        title: title.trim(),
      });
      if (description.trim()) params.append("description", description.trim());

      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch(`${API_URL}/notes/upload?${params.toString()}`, {
        method: "POST",
        headers: authHeaders, // do NOT set Content-Type — browser sets the multipart boundary
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Upload failed");
      }

      resetForm();
      await fetchNotes();
    } catch (e) {
      setUploadError(e.message || "Could not upload note");
    } finally {
      setUploading(false);
    }
  };

  // Download requires the Bearer token, so a plain <a href> won't work —
  // fetch the PDF as a blob and trigger the save from memory.
  const handleDownload = async (noteId, fileName) => {
    try {
      const res = await fetch(`${API_URL}/notes/${noteId}/download`, {
        headers: authHeaders,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Download failed");
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName || "note.pdf";
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      alert(e.message || "Could not download note");
    }
  };

  const visibleNotes = useMemo(() => notes, [notes]); // filtering already done server-side

  if (!token) {
    return (
      <div style={{ padding: 30 }}>
        <p>You need to be signed in to view notes.</p>
      </div>
    );
  }

  return (
    <div style={{ padding: "30px", maxWidth: "1100px", margin: "0 auto" }}>
      <h1>Notes</h1>
      <p>Upload and browse academic notes by subject, batch, and unit.</p>

      {/* UPLOAD FORM — admin/teacher only; backend also enforces this */}
      {(role === "admin" || role === "teacher") && (
        <form
          onSubmit={handleUpload}
          style={{
            marginBottom: "40px", padding: "20px", border: "1px solid #ddd",
            borderRadius: "8px", maxWidth: "560px", display: "flex",
            flexDirection: "column", gap: "14px",
          }}
        >
          <h2 style={{ margin: 0 }}>Upload Note</h2>

          <select value={subjectId} onChange={(e) => setSubjectId(e.target.value)} style={{ padding: "10px" }}>
            <option value="">Select Subject</option>
            {subjects.map((s) => (
              <option key={s.subject_id} value={s.subject_id}>
                {s.subject_name} ({s.subject_code})
              </option>
            ))}
          </select>

          {role === "admin" ? (
            <select value={teacherId} onChange={(e) => setTeacherId(e.target.value)} style={{ padding: "10px" }}>
              <option value="">Select Teacher (uploader)</option>
              {teachers.map((t) => (
                <option key={t.teacher_id} value={t.teacher_id}>{t.teacher_name}</option>
              ))}
            </select>
          ) : (
            <div style={{ fontSize: 13, color: "#6b7280" }}>
              Uploading as: <strong>{user?.name}</strong> (your account)
            </div>
          )}

          <div style={{ display: "flex", gap: "12px" }}>
            <select value={batchId} onChange={(e) => handleBatchChange(e.target.value)} style={{ padding: "10px", flex: 1 }}>
              <option value="">Select Batch</option>
              {batches.map((b) => (
                <option key={b.batch_id} value={b.batch_id}>
                  {b.batch_name}{b.section ? ` (${b.section})` : ""} — Sem {b.semester}
                </option>
              ))}
            </select>

            <input
              type="text" value={semester ? `Semester ${semester}` : ""} readOnly
              placeholder="Semester (auto)"
              style={{ padding: "10px", flex: 1, background: "#f3f4f6", color: "#6b7280" }}
            />
          </div>

          <input
            type="text" value={unit} onChange={(e) => setUnit(e.target.value)}
            placeholder="Unit (e.g. Unit 3)"
            style={{ padding: "10px" }}
          />

          <input
            type="text" value={title} onChange={(e) => setTitle(e.target.value)}
            placeholder="Title (e.g. Normalization in DBMS)"
            style={{ padding: "10px" }}
          />

          <textarea
            value={description} onChange={(e) => setDescription(e.target.value)}
            placeholder="Description (optional)"
            style={{ padding: "10px" }}
          />

          <label>
            PDF File
            <input
              type="file" accept="application/pdf"
              onChange={(e) => setFile(e.target.files[0] || null)}
              style={{ display: "block", marginTop: "6px" }}
            />
          </label>

          {uploadError && (
            <div style={{ padding: "10px 14px", borderRadius: 6, background: "#fee2e2", color: "#991b1b", fontSize: 13 }}>
              {uploadError}
            </div>
          )}

          <button
            type="submit" disabled={uploading}
            style={{
              padding: "10px 18px", background: uploading ? "#94a3b8" : "#1e293b",
              color: "white", fontWeight: "600", cursor: uploading ? "not-allowed" : "pointer",
            }}
          >
            {uploading ? "Uploading..." : "📤 Upload Note"}
          </button>
        </form>
      )}

      {/* FILTERS */}
      <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginBottom: "16px" }}>
        <select value={filterSubject} onChange={(e) => setFilterSubject(e.target.value)} style={{ padding: "8px" }}>
          <option value="">All Subjects</option>
          {subjects.map((s) => (
            <option key={s.subject_id} value={s.subject_id}>{s.subject_name}</option>
          ))}
        </select>
        {role !== "student" && (
          <select value={filterBatch} onChange={(e) => setFilterBatch(e.target.value)} style={{ padding: "8px" }}>
            <option value="">All Batches</option>
            {batches.map((b) => (
              <option key={b.batch_id} value={b.batch_id}>
                {b.batch_name}{b.section ? ` (${b.section})` : ""}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* LIST */}
      {loading ? (
        <p>Loading notes...</p>
      ) : listError ? (
        <p style={{ color: "#991b1b" }}>{listError}</p>
      ) : visibleNotes.length === 0 ? (
        <p>No notes found.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {visibleNotes.map((n) => (
            <div
              key={n.note_id}
              style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                flexWrap: "wrap", gap: "10px", padding: "14px 18px",
                background: "#f8fafc", border: "1px solid #e5e7eb", borderRadius: "8px",
              }}
            >
              <div>
                <strong>{n.title}</strong>
                <div style={{ fontSize: "13px", color: "#6b7280", marginTop: "2px" }}>
                  {n.subject_name} ({n.subject_code})
                  {n.batch_name && ` · ${n.batch_name}${n.section ? ` (${n.section})` : ""}`}
                </div>
                {n.description && (
                  <div style={{ fontSize: "13px", color: "#374151", marginTop: "4px" }}>{n.description}</div>
                )}
              </div>
              <button onClick={() => handleDownload(n.note_id, n.file_name)} style={{ padding: "8px 14px" }}>
                ⬇️ Download
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default Notes;