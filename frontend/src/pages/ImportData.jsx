import { useState } from "react";
import { useAuth } from "../auth/AuthContext";

const API_URL = "http://127.0.0.1:8000";

const C = {
  surface: "#ffffff",
  border: "#e8eaed",
  text: "#0f172a",
  muted: "#64748b",
  accent: "#1e293b",
  faint: "#f1f5f9",
  ok: "#166534",
  okBg: "#dcfce7",
  bad: "#991b1b",
  badBg: "#fee2e2",
  warn: "#92400e",
  warnBg: "#fef3c7",
};

const S = {
  page: {
    padding: "28px 32px 64px",
    maxWidth: 1200,
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
  btnOff: { background: "#94a3b8", cursor: "not-allowed" },
  th: {
    padding: "9px 12px",
    textAlign: "left",
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    color: C.muted,
    background: C.faint,
    borderBottom: `1px solid ${C.border}`,
    whiteSpace: "nowrap",
    position: "sticky",
    top: 0,
  },
  td: { padding: "9px 12px", fontSize: 13, borderBottom: `1px solid ${C.faint}`, verticalAlign: "top" },
};

const TABS = [
  { id: "students", label: "👨‍🎓 Students", title: "Import students" },
  { id: "syllabus", label: "📚 Syllabus (subjects)", title: "Import syllabus" },
  { id: "calendar", label: "📅 Holidays & Events", title: "Import holidays and events" },
];

const HELP = {
  students: [
    "One row per student. One file can contain many batches of the department.",
    "Batches that do not exist yet are created automatically.",
    "Students sign up later using the roll number and email from this file.",
  ],
  syllabus: [
    "One row per subject: semester, subject name, classes per week, Theory or Lab.",
    "Leave batch_name blank to give the subject to every batch of that semester.",
    "Add teacher emails (optional) so the timetable knows who can teach it.",
  ],
  calendar: [
    "One file can have both holidays and events — the 'type' column says which is which.",
    "Holidays can have an end date (for a break of several days). Events can have a time and a place.",
    "After importing, students and teachers get a notification automatically.",
  ],
};

// "14:30:00" -> "2:30 PM"
function fmtTime(t) {
  if (!t) return "—";
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

function Stat({ label, value, tone }) {
  const color = tone === "bad" ? C.bad : tone === "ok" ? C.ok : tone === "warn" ? C.warn : C.text;
  return (
    <div
      style={{
        flex: "1 1 140px",
        background: C.surface,
        border: `1px solid ${C.border}`,
        borderRadius: 10,
        padding: "14px 18px",
      }}
    >
      <div style={{ fontSize: 24, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{label}</div>
    </div>
  );
}

function Pill({ children, bg, color }) {
  return (
    <span
      style={{
        display: "inline-block",
        padding: "1px 8px",
        borderRadius: 20,
        fontSize: 11,
        fontWeight: 600,
        background: bg,
        color,
        marginLeft: 6,
      }}
    >
      {children}
    </span>
  );
}

export default function ImportData() {
  const { user } = useAuth();

  const [kind, setKind] = useState("students");
  const [file, setFile] = useState(null);
  const [fileKey, setFileKey] = useState(0); // used to clear the <input type="file">
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [onlyProblems, setOnlyProblems] = useState(false);

  const authHeaders = { Authorization: `Bearer ${user?.access_token}` };

  const readError = async (response) => {
    if (response.status === 401) return "Your session has expired. Please log in again.";
    if (response.status === 403) return "Only an admin can import data.";
    try {
      const data = await response.json();
      if (typeof data.detail === "string") return data.detail;
      if (Array.isArray(data.detail)) return data.detail.map((d) => d.msg).join(", ");
    } catch (e) {
      /* ignore */
    }
    return "Something went wrong.";
  };

  const postFile = async (action) => {
    const form = new FormData();
    form.append("file", file);
    const response = await fetch(`${API_URL}/import/${kind}/${action}`, {
      method: "POST",
      headers: authHeaders,
      body: form,
    });
    if (!response.ok) throw new Error(await readError(response));
    return response.json();
  };

  const resetAll = () => {
    setFile(null);
    setFileKey((k) => k + 1);
    setPreview(null);
    setResult(null);
    setError(null);
    setOnlyProblems(false);
  };

  const switchKind = (id) => {
    setKind(id);
    resetAll();
  };

  const handleCheck = async () => {
    if (!file) return setError("Please choose a file first.");
    try {
      setBusy(true);
      setError(null);
      setResult(null);
      setPreview(await postFile("preview"));
    } catch (e) {
      setPreview(null);
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const handleImport = async () => {
    if (!preview || preview.valid_rows === 0) return;

    const skipText =
      preview.invalid_rows > 0
        ? `\n\n${preview.invalid_rows} row(s) with problems will be skipped.`
        : "";
    if (!window.confirm(`Import ${preview.valid_rows} valid row(s) into the database?${skipText}`)) return;

    try {
      setBusy(true);
      setError(null);
      const data = await postFile("commit");
      setResult(data);
      setPreview(null);
      setFile(null);
      setFileKey((k) => k + 1);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const downloadTemplate = async () => {
    try {
      const response = await fetch(`${API_URL}/import/template/${kind}`, { headers: authHeaders });
      if (!response.ok) throw new Error(await readError(response));
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `schedai_${kind}_template.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e.message);
    }
  };

  const tab = TABS.find((t) => t.id === kind);
  const shownRows = preview
    ? (onlyProblems ? preview.rows.filter((r) => !r.valid) : preview.rows).slice(0, 400)
    : [];

  return (
    <div style={S.page}>
      <h1 style={S.h1}>Import Data</h1>
      <p style={S.sub}>
        Upload an Excel file once instead of typing records one by one. You always see a preview first —
        nothing is saved until you confirm.
      </p>

      {/* tabs */}
      <div
        style={{
          display: "inline-flex",
          background: C.faint,
          borderRadius: 10,
          padding: 3,
          gap: 2,
          marginBottom: 20,
        }}
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => switchKind(t.id)}
            style={{
              padding: "8px 16px",
              border: "none",
              borderRadius: 8,
              fontWeight: 600,
              fontSize: 14,
              cursor: "pointer",
              background: kind === t.id ? C.surface : "transparent",
              color: kind === t.id ? C.accent : C.muted,
              boxShadow: kind === t.id ? "0 1px 2px rgba(15,23,42,0.12)" : "none",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* step 1 + 2 */}
      <div style={S.card}>
        <h2 style={S.cardTitle}>{tab.title}</h2>
        <ul style={{ margin: "10px 0 16px", paddingLeft: 20, color: C.muted, fontSize: 13, lineHeight: 1.7 }}>
          {HELP[kind].map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <button onClick={downloadTemplate} style={S.btnGhost}>
            ⬇️ Download Excel template
          </button>

          <input
            key={fileKey}
            type="file"
            accept=".xlsx,.csv"
            onChange={(e) => {
              setFile(e.target.files[0] || null);
              setPreview(null);
              setResult(null);
              setError(null);
            }}
            style={{ fontSize: 14 }}
          />

          <button
            onClick={handleCheck}
            disabled={busy || !file}
            style={{ ...S.btnPrimary, ...(busy || !file ? S.btnOff : {}) }}
          >
            {busy && !preview ? "Checking…" : "🔍 Check file"}
          </button>
        </div>

        <p style={{ margin: "12px 0 0", fontSize: 12, color: C.muted }}>
          Accepted: Excel (.xlsx) or CSV. If your data is in a PDF, copy it into the template first —
          PDFs cannot be read reliably.
        </p>
      </div>

      {error && (
        <div
          style={{
            padding: "12px 16px",
            marginBottom: 20,
            borderRadius: 10,
            background: C.badBg,
            color: C.bad,
            fontSize: 14,
            whiteSpace: "pre-line",
          }}
        >
          {error}
        </div>
      )}

      {/* result after import */}
      {result && (
        <div style={S.card}>
          <div
            style={{
              padding: "12px 16px",
              borderRadius: 10,
              background: result.success ? C.okBg : C.warnBg,
              color: result.success ? C.ok : C.warn,
              fontWeight: 600,
              fontSize: 15,
            }}
          >
            {result.success ? "✓ " : "⚠️ "}
            {result.message}
            {result.new_batches_created > 0 && ` ${result.new_batches_created} new batch(es) created.`}
            {result.skipped > 0 && ` ${result.skipped} row(s) skipped.`}
          </div>

          {result.errors?.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 6 }}>Skipped rows</div>
              <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13, color: C.bad, lineHeight: 1.7 }}>
                {result.errors.slice(0, 50).map((r) => (
                  <li key={r.row}>
                    Row {r.row}: {r.errors.join("; ")}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <button onClick={resetAll} style={{ ...S.btnGhost, marginTop: 16 }}>
            Import another file
          </button>
        </div>
      )}

      {/* preview */}
      {preview && (
        <div style={S.card}>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
            <Stat label="Rows in file" value={preview.total_rows} />
            <Stat label="Ready to import" value={preview.valid_rows} tone="ok" />
            <Stat
              label="Need fixing (will be skipped)"
              value={preview.invalid_rows}
              tone={preview.invalid_rows > 0 ? "bad" : undefined}
            />
            {kind === "students" && (
              <Stat label="New batches to create" value={preview.new_batches.length} tone="warn" />
            )}
            {kind === "syllabus" && (
              <>
                <Stat label="New subjects" value={preview.to_create} />
                <Stat label="Existing subjects updated" value={preview.to_update} />
              </>
            )}
            {kind === "calendar" && (
              <>
                <Stat label="Holidays" value={preview.holidays} />
                <Stat label="Events" value={preview.events} />
              </>
            )}
          </div>

          {kind === "students" && preview.new_batches.length > 0 && (
            <p style={{ margin: "0 0 14px", fontSize: 13, color: C.warn }}>
              New batches that will be created: <b>{preview.new_batches.join(", ")}</b>
            </p>
          )}

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: 10,
              marginBottom: 12,
            }}
          >
            <label style={{ fontSize: 13, color: C.muted, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={onlyProblems}
                onChange={(e) => setOnlyProblems(e.target.checked)}
                style={{ marginRight: 6 }}
              />
              Show only rows with problems
            </label>

            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={resetAll} style={S.btnGhost}>
                Cancel
              </button>
              <button
                onClick={handleImport}
                disabled={busy || preview.valid_rows === 0}
                style={{ ...S.btnPrimary, ...(busy || preview.valid_rows === 0 ? S.btnOff : {}) }}
              >
                {busy ? "Importing…" : `✅ Import ${preview.valid_rows} valid row(s)`}
              </button>
            </div>
          </div>

          <div style={{ overflow: "auto", maxHeight: 460, border: `1px solid ${C.border}`, borderRadius: 8 }}>
            <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 800 }}>
              <thead>
                {kind === "students" ? (
                  <tr>
                    <th style={S.th}>Row</th>
                    <th style={S.th}>Student</th>
                    <th style={S.th}>Roll no.</th>
                    <th style={S.th}>Email</th>
                    <th style={S.th}>Batch</th>
                    <th style={S.th}>Sem</th>
                    <th style={S.th}>Status</th>
                  </tr>
                ) : kind === "calendar" ? (
                  <tr>
                    <th style={S.th}>Row</th>
                    <th style={S.th}>Type</th>
                    <th style={S.th}>Name</th>
                    <th style={S.th}>Date</th>
                    <th style={S.th}>Time</th>
                    <th style={S.th}>Location</th>
                    <th style={S.th}>Status</th>
                  </tr>
                ) : (
                  <tr>
                    <th style={S.th}>Row</th>
                    <th style={S.th}>Subject</th>
                    <th style={S.th}>Batch</th>
                    <th style={S.th}>Sem</th>
                    <th style={S.th}>Classes/wk</th>
                    <th style={S.th}>Type</th>
                    <th style={S.th}>Teachers</th>
                    <th style={S.th}>Status</th>
                  </tr>
                )}
              </thead>
              <tbody>
                {shownRows.map((r) => (
                  <tr key={r.row} style={{ background: r.valid ? "transparent" : "#fef2f2" }}>
                    <td style={S.td}>{r.row}</td>

                    {kind === "students" ? (
                      <>
                        <td style={S.td}>{r.student_name}</td>
                        <td style={S.td}>{r.roll_number}</td>
                        <td style={S.td}>{r.email}</td>
                        <td style={S.td}>
                          {r.batch_name}
                          {r.new_batch && r.valid && <Pill bg={C.warnBg} color={C.warn}>new</Pill>}
                        </td>
                        <td style={S.td}>{r.semester ?? "—"}</td>
                      </>
                    ) : kind === "calendar" ? (
                      <>
                        <td style={S.td}>
                          {r.type === "holiday" ? "🎉 Holiday" : r.type === "event" ? "📢 Event" : "—"}
                        </td>
                        <td style={{ ...S.td, fontWeight: 600 }}>{r.name}</td>
                        <td style={{ ...S.td, whiteSpace: "nowrap" }}>
                          {r.date || "—"}
                          {r.end_date ? ` → ${r.end_date}` : ""}
                        </td>
                        <td style={S.td}>{r.type === "event" ? fmtTime(r.time) : "—"}</td>
                        <td style={S.td}>{r.location || "—"}</td>
                      </>
                    ) : (
                      <>
                        <td style={S.td}>
                          <div style={{ fontWeight: 600 }}>{r.subject_name}</div>
                          <div style={{ fontSize: 12, color: C.muted }}>{r.subject_code || "no code"}</div>
                        </td>
                        <td style={S.td}>{r.batch_name || <span style={{ color: C.muted }}>all batches</span>}</td>
                        <td style={S.td}>{r.semester ?? "—"}</td>
                        <td style={S.td}>{r.sessions_per_week}</td>
                        <td style={S.td}>{r.type}</td>
                        <td style={S.td}>{r.teacher_ids.length || "—"}</td>
                      </>
                    )}

                    <td style={S.td}>
                      {r.valid ? (
                        <span style={{ color: C.ok, fontWeight: 600 }}>
                          ✓ {kind === "syllabus" ? (r.action === "update" ? "Update" : "Create") : "OK"}
                        </span>
                      ) : (
                        <span style={{ color: C.bad }}>✗ {r.errors.join("; ")}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {preview.rows.length > 400 && !onlyProblems && (
            <p style={{ fontSize: 12, color: C.muted, margin: "10px 0 0" }}>
              Showing the first 400 rows. All {preview.valid_rows} valid rows will still be imported.
            </p>
          )}
        </div>
      )}
    </div>
  );
}