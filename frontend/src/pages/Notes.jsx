import { useEffect, useState, useMemo } from "react";
import { useAuth } from "../auth/AuthContext";

const API_URL = "http://127.0.0.1:8000";
const MAX_MB = 20;

function checkPdf(file) {
  if (!file) return "Please choose a PDF file.";
  if (!file.name.toLowerCase().endsWith(".pdf")) return "Only PDF files are allowed.";
  if (file.size === 0) return "The selected file is empty.";
  if (file.size > MAX_MB * 1024 * 1024) return `File is larger than ${MAX_MB} MB.`;
  return null;
}

function Notes() {
  const { user } = useAuth();
  const token = user?.access_token;
  const role = user?.role;

  const [notes, setNotes] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [allSubjects, setAllSubjects] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState(null);

  const [subjectId, setSubjectId] = useState("");
  const [teacherId, setTeacherId] = useState(role === "teacher" ? String(user?.teacher_id || "") : "");
  const [batchId, setBatchId] = useState("");
  const [semester, setSemester] = useState("");
  const [unit, setUnit] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState(null);
  const [fileKey, setFileKey] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const [uploadOk, setUploadOk] = useState(null);

  const [filterSubject, setFilterSubject] = useState("");
  const [filterBatch, setFilterBatch] = useState("");

  const authHeaders = { Authorization: `Bearer ${token}` };

  const fetchReferenceData = async () => {
    try {
      const [subjectsRes, teachersRes, batchesRes] = await Promise.all([
        fetch(`${API_URL}/subjects`),
        fetch(`${API_URL}/teachers`),
        fetch(`${API_URL}/batches`),
      ]);
      const allSubs = subjectsRes.ok ? await subjectsRes.json() : [];
      setAllSubjects(allSubs);
      setTeachers(teachersRes.ok ? await teachersRes.json() : []);
      setBatches(batchesRes.ok ? await batchesRes.json() : []);

      if (role === "teacher" && user?.teacher_id) {
        const skillsRes = await fetch(`${API_URL}/teacher-skills?teacher_id=${user.teacher_id}`);
        const skills = skillsRes.ok ? await skillsRes.json() : [];
        const mappedIds = new Set(skills.map((s) => s.subject_id));
        setSubjects(allSubs.filter((s) => mappedIds.has(s.subject_id)));
      } else {
        setSubjects(allSubs);
      }
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

      const res = await fetch(`${API_URL}/notes?${params.toString()}`, { headers: authHeaders });
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (token) fetchNotes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, filterSubject, filterBatch]);

  // Batches that match the chosen subject (same semester / department / batch)
  const selectedSubject = subjects.find((s) => String(s.subject_id) === String(subjectId));
  const uploadBatches = useMemo(() => {
    if (!selectedSubject) return [];
    return batches.filter(
      (b) =>
        (selectedSubject.semester == null || Number(b.semester) === Number(selectedSubject.semester)) &&
        (selectedSubject.department_id == null || b.department_id === selectedSubject.department_id) &&
        (selectedSubject.batch_id == null || b.batch_id === selectedSubject.batch_id)
    );
  }, [batches, selectedSubject]);

  const handleSubjectChange = (id) => {
    setSubjectId(id);
    setBatchId("");
    setSemester("");
  };

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
    setFileKey((k) => k + 1);
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    setUploadError(null);
    setUploadOk(null);

    if (!subjectId || !teacherId || !batchId || !semester || !unit.trim() || !title.trim()) {
      setUploadError("Please fill subject, teacher, batch, unit and title.");
      return;
    }
    const fileProblem = checkPdf(file);
    if (fileProblem) {
      setUploadError(fileProblem);
      return;
    }

    try {
      setUploading(true);
      const params = new URLSearchParams({
        subject_id: subjectId,
        teacher_id: teacherId,
        batch_id: batchId,
        semester,
        unit: unit.trim(),
        title: title.trim(),
      });
      if (description.trim()) params.append("description", description.trim());

      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch(`${API_URL}/notes/upload?${params.toString()}`, {
        method: "POST",
        headers: authHeaders,
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(typeof err.detail === "string" ? err.detail : "Upload failed");
      }

      resetForm();
      setUploadOk("Note uploaded successfully.");
      await fetchNotes();
    } catch (e) {
      setUploadError(e.message || "Could not upload note");
    } finally {
      setUploading(false);
    }
  };

  const handleDownload = async (noteId, fileName) => {
    try {
      const res = await fetch(`${API_URL}/notes/${noteId}/download`, { headers: authHeaders });
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

  const canDelete = (note) => {
    if (role === "admin") return true;
    if (role === "teacher" && note.uploaded_by === user?.user_id) return true;
    return false;
  };

  const handleDelete = async (noteId) => {
    if (!window.confirm("Delete this note? This cannot be undone.")) return;
    try {
      const res = await fetch(`${API_URL}/notes/${noteId}`, { method: "DELETE", headers: authHeaders });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Delete failed");
      }
      await fetchNotes();
    } catch (e) {
      alert(e.message || "Could not delete note");
    }
  };

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
      <p>
        {role === "student"
          ? "Download notes for your batch. Students can only view and download."
          : role === "teacher"
          ? "Upload notes for your own subjects, and manage the notes you uploaded."
          : "Upload, download and manage notes for all batches."}
      </p>

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

          <select value={subjectId} onChange={(e) => handleSubjectChange(e.target.value)} style={{ padding: "10px" }}>
            <option value="">
              {role === "teacher" && subjects.length === 0 ? "No subjects mapped to you yet" : "Select Subject"}
            </option>
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
            <select
              value={batchId}
              onChange={(e) => handleBatchChange(e.target.value)}
              disabled={!subjectId}
              style={{ padding: "10px", flex: 1 }}
            >
              <option value="">{subjectId ? "Select Batch" : "Select a subject first"}</option>
              {uploadBatches.map((b) => (
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
          {subjectId && uploadBatches.length === 0 && (
            <div style={{ fontSize: 13, color: "#92400e" }}>
              No batch matches this subject's semester. Check the subject and batch setup.
            </div>
          )}

          <input
            type="text" value={unit} onChange={(e) => setUnit(e.target.value)}
            placeholder="Unit (e.g. Unit 3)" style={{ padding: "10px" }}
          />
          <input
            type="text" value={title} onChange={(e) => setTitle(e.target.value)}
            placeholder="Title (e.g. Normalization in DBMS)" style={{ padding: "10px" }}
          />
          <textarea
            value={description} onChange={(e) => setDescription(e.target.value)}
            placeholder="Description (optional)" style={{ padding: "10px" }}
          />

          <label>
            PDF File (max {MAX_MB} MB)
            <input
              key={fileKey}
              type="file" accept="application/pdf,.pdf"
              onChange={(e) => {
                const f = e.target.files[0] || null;
                setFile(f);
                setUploadError(f ? checkPdf(f) : null);
              }}
              style={{ display: "block", marginTop: "6px" }}
            />
          </label>
          {file && !checkPdf(file) && (
            <div style={{ fontSize: 13, color: "#166534" }}>
              ✓ {file.name} ({(file.size / (1024 * 1024)).toFixed(2)} MB)
            </div>
          )}

          {uploadError && (
            <div style={{ padding: "10px 14px", borderRadius: 6, background: "#fee2e2", color: "#991b1b", fontSize: 13 }}>
              {uploadError}
            </div>
          )}
          {uploadOk && (
            <div style={{ padding: "10px 14px", borderRadius: 6, background: "#dcfce7", color: "#166534", fontSize: 13 }}>
              {uploadOk}
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
          {(role === "teacher" ? subjects : allSubjects).map((s) => (
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
      ) : notes.length === 0 ? (
        <p>No notes found.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {notes.map((n) => (
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
                {n.unit && <span style={{ color: "#6b7280" }}> — {n.unit}</span>}
                <div style={{ fontSize: "13px", color: "#6b7280", marginTop: "2px" }}>
                  {n.subject_name} ({n.subject_code})
                  {n.semester && ` · Sem ${n.semester}`}
                  {n.batch_name && ` · ${n.batch_name}${n.section ? ` (${n.section})` : ""}`}
                  {n.teacher_name && ` · by ${n.teacher_name}`}
                </div>
                {n.description && (
                  <div style={{ fontSize: "13px", color: "#374151", marginTop: "4px" }}>{n.description}</div>
                )}
              </div>
              <div style={{ display: "flex", gap: "8px" }}>
                <button onClick={() => handleDownload(n.note_id, n.file_name)} style={{ padding: "8px 14px" }}>
                  ⬇️ Download
                </button>
                {canDelete(n) && (
                  <button
                    onClick={() => handleDelete(n.note_id)}
                    style={{ padding: "8px 14px", color: "#991b1b", borderColor: "#fecaca" }}
                  >
                    🗑️ Delete
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default Notes;