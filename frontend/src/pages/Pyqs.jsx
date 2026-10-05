import { useEffect, useState, useMemo } from "react";
import { useAuth } from "../auth/AuthContext";

const API_URL = "http://127.0.0.1:8000";
const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 8 }, (_, i) => CURRENT_YEAR - i);

function PYQs() {
  const { user } = useAuth();
  const token = user?.access_token;
  const role = user?.role;

  const [pyqs, setPyqs] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState(null);

  // Upload form
  const [subjectId, setSubjectId] = useState("");
  const [batchId, setBatchId] = useState("");
  const [title, setTitle] = useState("");
  const [examYear, setExamYear] = useState(String(CURRENT_YEAR));
  const [description, setDescription] = useState("");
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);

  // Filters
  const [filterSubject, setFilterSubject] = useState("");
  const [filterBatch, setFilterBatch] = useState("");
  const [filterYear, setFilterYear] = useState("");

  const authHeaders = { Authorization: `Bearer ${token}` };

  const fetchReferenceData = async () => {
    try {
      const [subjectsRes, batchesRes] = await Promise.all([
        fetch(`${API_URL}/subjects`),
        fetch(`${API_URL}/batches`),
      ]);
      setSubjects(subjectsRes.ok ? await subjectsRes.json() : []);
      setBatches(batchesRes.ok ? await batchesRes.json() : []);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchPyqs = async () => {
    try {
      setLoading(true);
      setListError(null);
      const params = new URLSearchParams();
      if (filterSubject) params.append("subject_id", filterSubject);
      if (filterBatch) params.append("batch_id", filterBatch);
      if (filterYear) params.append("exam_year", filterYear);

      const res = await fetch(`${API_URL}/pyqs?${params.toString()}`, {
        headers: authHeaders,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Failed to load PYQs");
      }
      setPyqs(await res.json());
    } catch (e) {
      setListError(e.message);
      setPyqs([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReferenceData();
  }, []);

  useEffect(() => {
    if (token) fetchPyqs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, filterSubject, filterBatch, filterYear]);

  const resetForm = () => {
    setSubjectId("");
    setBatchId("");
    setTitle("");
    setExamYear(String(CURRENT_YEAR));
    setDescription("");
    setFile(null);
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    setUploadError(null);

    if (!subjectId || !batchId || !title.trim() || !examYear || !file) {
      setUploadError("Please fill subject, batch, title, year and choose a PDF file.");
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
        batch_id: batchId,
        title: title.trim(),
        exam_year: examYear,
      });
      if (description.trim()) params.append("description", description.trim());

      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch(`${API_URL}/pyqs/upload?${params.toString()}`, {
        method: "POST",
        headers: authHeaders,
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Upload failed");
      }

      resetForm();
      await fetchPyqs();
    } catch (e) {
      setUploadError(e.message || "Could not upload PYQ");
    } finally {
      setUploading(false);
    }
  };

  const handleDownload = async (pyqId, fileName) => {
    try {
      const res = await fetch(`${API_URL}/pyqs/${pyqId}/download`, {
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
      a.download = fileName || "pyq.pdf";
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      alert(e.message || "Could not download PYQ");
    }
  };

  const visiblePyqs = useMemo(() => pyqs, [pyqs]); // filtering already done server-side

  if (!token) {
    return (
      <div style={{ padding: 30 }}>
        <p>You need to be signed in to view PYQs.</p>
      </div>
    );
  }

  return (
    <div style={{ padding: "30px", maxWidth: "1100px", margin: "0 auto" }}>
      <h1>Previous Year Questions</h1>
      <p>Upload and browse PYQs by subject, batch, and year.</p>

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
          <h2 style={{ margin: 0 }}>Upload PYQ</h2>

          <select value={subjectId} onChange={(e) => setSubjectId(e.target.value)} style={{ padding: "10px" }}>
            <option value="">Select Subject</option>
            {subjects.map((s) => (
              <option key={s.subject_id} value={s.subject_id}>
                {s.subject_name} ({s.subject_code})
              </option>
            ))}
          </select>

          <div style={{ display: "flex", gap: "12px" }}>
            <select value={batchId} onChange={(e) => setBatchId(e.target.value)} style={{ padding: "10px", flex: 1 }}>
              <option value="">Select Batch</option>
              {batches.map((b) => (
                <option key={b.batch_id} value={b.batch_id}>
                  {b.batch_name}{b.section ? ` (${b.section})` : ""} — Sem {b.semester}
                </option>
              ))}
            </select>

            <select value={examYear} onChange={(e) => setExamYear(e.target.value)} style={{ padding: "10px", flex: 1 }}>
              {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>

          <input
            type="text" value={title} onChange={(e) => setTitle(e.target.value)}
            placeholder="Title (e.g. End-Sem Exam Paper)"
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
            {uploading ? "Uploading..." : "📤 Upload PYQ"}
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
        <select value={filterYear} onChange={(e) => setFilterYear(e.target.value)} style={{ padding: "8px" }}>
          <option value="">All Years</option>
          {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      {/* LIST */}
      {loading ? (
        <p>Loading PYQs...</p>
      ) : listError ? (
        <p style={{ color: "#991b1b" }}>{listError}</p>
      ) : visiblePyqs.length === 0 ? (
        <p>No PYQs found.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {visiblePyqs.map((p) => (
            <div
              key={p.pyq_id}
              style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                flexWrap: "wrap", gap: "10px", padding: "14px 18px",
                background: "#f8fafc", border: "1px solid #e5e7eb", borderRadius: "8px",
              }}
            >
              <div>
                <strong>{p.title}</strong>
                <span
                  style={{
                    marginLeft: "10px", padding: "2px 10px", borderRadius: "12px",
                    fontSize: "12px", fontWeight: 600,
                    background: "#e0e7ff", color: "#3730a3",
                  }}
                >
                  {p.exam_year}
                </span>
                <div style={{ fontSize: "13px", color: "#6b7280", marginTop: "2px" }}>
                  {p.subject_name} ({p.subject_code})
                  {p.batch_name && ` · ${p.batch_name}${p.section ? ` (${p.section})` : ""}`}
                </div>
                {p.description && (
                  <div style={{ fontSize: "13px", color: "#374151", marginTop: "4px" }}>{p.description}</div>
                )}
              </div>
              <button onClick={() => handleDownload(p.pyq_id, p.file_name)} style={{ padding: "8px 14px" }}>
                ⬇️ Download
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default PYQs;