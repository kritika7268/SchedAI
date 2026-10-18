import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth/AuthContext";

const API_URL = "http://127.0.0.1:8000";

const ROUNDS = [
  { id: "class_test_1", label: "Class Test 1" },
  { id: "mid_sem", label: "Mid Sem" },
  { id: "class_test_2", label: "Class Test 2" },
  { id: "external", label: "External Exam" },
];

const C = {
  navy: "#1e3a5f", navy2: "#2c5282", gold: "#c9a227", bg: "#f4f6fa",
  surface: "#ffffff", border: "#e2e8f0", text: "#0f172a", muted: "#64748b",
  ok: "#15803d", okBg: "#dcfce7", bad: "#b91c1c", badBg: "#fee2e2",
  warn: "#b45309", faint: "#f1f5f9", chip: "#e8eef7",
};
const card = { background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: "20px 24px", marginBottom: 18, boxShadow: "0 1px 3px rgba(15,23,42,0.04)" };
const input = { padding: "9px 12px", fontSize: 14, border: `1px solid ${C.border}`, borderRadius: 8, background: "#fff" };
const caption = { fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: C.muted, marginBottom: 8, display: "block" };

function nextMondayISO() {
  const d = new Date();
  d.setDate(d.getDate() + ((1 - d.getDay() + 7) % 7 || 7));
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
function fmt12(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}
const dayOf = (iso) => new Date(iso + "T00:00:00");
const longDate = (iso) => dayOf(iso).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
const shortDate = (iso) => dayOf(iso).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });

function Stat({ label, value }) {
  return (
    <div style={{ flex: "1 1 120px", background: C.faint, borderRadius: 10, padding: "12px 16px" }}>
      <div style={{ fontSize: 24, fontWeight: 700, color: C.navy, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 12, color: C.muted, marginTop: 5 }}>{label}</div>
    </div>
  );
}

const dlBtn = (busy) => ({
  padding: "9px 16px", borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: busy ? "wait" : "pointer",
  background: "rgba(255,255,255,0.12)", color: "#fff", border: "1px solid rgba(255,255,255,0.35)",
});

export default function ExamSchedule() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const token = user?.access_token;

  const [round, setRound] = useState("class_test_1");
  const isExternal = round === "external";
  const roundLabel = ROUNDS.find((r) => r.id === round)?.label;

  const [weekStart, setWeekStart] = useState(nextMondayISO());
  const [ignoreHolidays, setIgnoreHolidays] = useState(false);
  const [file, setFile] = useState(null);
  const [fileKey, setFileKey] = useState(0);
  const [view, setView] = useState("date");

  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [check, setCheck] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [downloading, setDownloading] = useState(null);
  const [msg, setMsg] = useState(null);

  const api = async (path, options = {}) => {
    const res = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    });
    let data = null;
    try { data = await res.json(); } catch (e) { /* no body */ }
    if (!res.ok) throw new Error(typeof data?.detail === "string" ? data.detail : "Something went wrong.");
    return data;
  };

  const runCheck = async () => {
    if (!isAdmin) return;
    try { setCheck(await api(`/exams/conflicts?exam_round=${round}`)); } catch (e) { setCheck(null); }
  };

  const load = async () => {
    try {
      setLoading(true);
      const data = await api(`/exams/schedule?exam_round=${round}`);
      setRows(data);
      if (isAdmin) {
        setSummary(await api(`/exams/duty-summary?exam_round=${round}`));
        if (data.length > 0) await runCheck(); else setCheck(null);
      }
    } catch (e) {
      setMsg({ type: "error", text: e.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAdmin) fetch(`${API_URL}/teachers`).then((r) => (r.ok ? r.json() : [])).then(setTeachers).catch(() => {});
  }, [isAdmin]);

  useEffect(() => { setMsg(null); load(); /* eslint-disable-next-line */ }, [round]);

  const generate = async () => {
    if (dayOf(weekStart).getDay() !== 1) {
      setMsg({ type: "error", text: "Please choose a Monday as the first day of the exam week." });
      return;
    }
    if (rows.length > 0 && !window.confirm(`${roundLabel} timetable already exists. Generating again will replace it. Continue?`)) return;
    try {
      setBusy(true); setMsg(null);
      const r = await api("/exams/generate", {
        method: "POST",
        body: JSON.stringify({ exam_round: round, week_start: weekStart, ignore_holidays: ignoreHolidays }),
      });
      setMsg({ type: "ok", text: `${r.message} Conflicts found: ${r.conflicts.length}.` });
      await load();
    } catch (e) {
      setMsg({ type: "error", text: e.message });
    } finally { setBusy(false); }
  };

  const fetchBlob = async (url, filename) => {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(typeof err.detail === "string" ? err.detail : "Download failed");
    }
    const blob = await res.blob();
    const href = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = href; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    window.URL.revokeObjectURL(href);
  };

  const download = async (fmt) => {
    try {
      setDownloading(fmt); setMsg(null);
      await fetchBlob(`${API_URL}/exams/export?exam_round=${round}&format=${fmt}`, `exam_timetable_${round}.${fmt}`);
    } catch (e) {
      setMsg({ type: "error", text: e.message });
    } finally { setDownloading(null); }
  };

  const downloadTemplate = async () => {
    try { await fetchBlob(`${API_URL}/exams/external/template`, "external_exam_template.csv"); }
    catch (e) { setMsg({ type: "error", text: e.message }); }
  };

  const importExternal = async () => {
    if (!file) { setMsg({ type: "error", text: "Please choose a CSV or XLSX file first." }); return; }
    if (rows.length > 0 && !window.confirm("An external exam schedule already exists. Importing again will replace it. Continue?")) return;
    try {
      setBusy(true); setMsg(null);
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`${API_URL}/exams/external/import`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: fd });
      let data = null;
      try { data = await res.json(); } catch (e) { /* no body */ }
      if (!res.ok) throw new Error(typeof data?.detail === "string" ? data.detail : "Import failed");
      setMsg({ type: "ok", text: `${data.message} Conflicts found: ${data.conflicts.length}.` });
      setFile(null); setFileKey((k) => k + 1);
      await load();
    } catch (e) {
      setMsg({ type: "error", text: e.message });
    } finally { setBusy(false); }
  };

  const clearAll = async () => {
    if (!window.confirm(`Delete the whole ${roundLabel} schedule?`)) return;
    try { await api(`/exams/clear?exam_round=${round}`, { method: "DELETE" }); await load(); }
    catch (e) { setMsg({ type: "error", text: e.message }); }
  };

  const changeInvigilator = async (examId, teacherId) => {
    try {
      setMsg(null);
      await api(`/exams/${examId}/invigilator`, { method: "PUT", body: JSON.stringify({ teacher_id: Number(teacherId) }) });
    } catch (e) { setMsg({ type: "error", text: e.message }); }
    await load();
  };

  // ---- derived ----
  const dates = useMemo(() => [...new Set(rows.map((r) => r.exam_date))].sort(), [rows]);
  const batchList = useMemo(() => [...new Set(rows.map((r) => r.batch_name))].sort(), [rows]);
  const byDate = useMemo(() => dates.map((d) => ({ date: d, items: rows.filter((r) => r.exam_date === d) })), [dates, rows]);
  const cellMap = useMemo(() => {
    const m = {};
    rows.forEach((r) => { (m[`${r.batch_name}|${r.exam_date}`] = m[`${r.batch_name}|${r.exam_date}`] || []).push(r); });
    return m;
  }, [rows]);
  const invCount = new Set(rows.map((r) => r.invigilator_id)).size;
  const maxDay = Math.max(1, ...byDate.map((g) => g.items.length));
  const maxDuties = Math.max(1, ...summary.map((s) => s.duties));

  const segBtn = (active) => ({
    padding: "7px 20px", fontSize: 13, fontWeight: 600, cursor: "pointer", border: "none",
    background: active ? C.navy : "transparent", color: active ? "#fff" : C.muted, borderRadius: 8,
  });

  return (
    <div style={{ background: C.bg, minHeight: "100vh", color: C.text }}>
      {/* HEADER */}
      <div style={{ background: `linear-gradient(135deg, ${C.navy}, ${C.navy2})`, borderBottom: `4px solid ${C.gold}`, padding: "26px 32px", color: "#fff" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 14 }}>
          <div>
            <div style={{ fontSize: 12, letterSpacing: "0.12em", textTransform: "uppercase", opacity: 0.75 }}>Examination Cell</div>
            <h1 style={{ margin: "4px 0 4px", fontSize: 27, fontFamily: "Georgia, 'Times New Roman', serif", fontWeight: 700 }}>
              Examination Timetable
            </h1>
            <div style={{ fontSize: 13, opacity: 0.85 }}>
              {isAdmin ? "Internal assessments and external examination schedule, with fair invigilation duty."
                : user?.role === "teacher" ? "Your invigilation duties." : "Exam timetable for your batch."}
            </div>
          </div>
          {isAdmin && rows.length > 0 && (
            <div style={{ display: "flex", gap: 10 }}>
              <button style={dlBtn(downloading === "xlsx")} disabled={!!downloading} onClick={() => download("xlsx")}>
                {downloading === "xlsx" ? "Preparing…" : "⬇ Excel"}
              </button>
              <button style={dlBtn(downloading === "pdf")} disabled={!!downloading} onClick={() => download("pdf")}>
                {downloading === "pdf" ? "Preparing…" : "⬇ PDF"}
              </button>
            </div>
          )}
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 32px 64px" }}>
        {msg && (
          <div style={{
            padding: "11px 16px", marginBottom: 16, borderRadius: 8, fontSize: 14, whiteSpace: "pre-line",
            background: msg.type === "ok" ? C.okBg : C.badBg, color: msg.type === "ok" ? "#166534" : "#991b1b",
          }}>{msg.text}</div>
        )}

        {/* ROUND TABS */}
        <div style={{ display: "inline-flex", background: "#fff", border: `1px solid ${C.border}`, borderRadius: 10, padding: 4, marginBottom: 18, flexWrap: "wrap" }}>
          {ROUNDS.map((r) => (
            <button key={r.id} onClick={() => setRound(r.id)} style={segBtn(round === r.id)}>{r.label}</button>
          ))}
        </div>

        {/* ADMIN CONTROLS */}
        {isAdmin && !isExternal && (
          <div style={{ ...card, borderTop: `3px solid ${C.navy}` }}>
            <span style={caption}>Generate {roundLabel}</span>
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-end" }}>
              <div>
                <span style={{ ...caption, marginBottom: 4 }}>Exam week starts (Monday)</span>
                <input type="date" value={weekStart} onChange={(e) => setWeekStart(e.target.value)} style={input} />
              </div>
              <label style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 6, paddingBottom: 10 }}>
                <input type="checkbox" checked={ignoreHolidays} onChange={(e) => setIgnoreHolidays(e.target.checked)} />
                Ignore holidays
              </label>
              <button onClick={generate} disabled={busy} style={{
                padding: "11px 22px", border: "none", borderRadius: 8, fontWeight: 700, fontSize: 14,
                background: busy ? "#94a3b8" : C.navy, color: "#fff", cursor: busy ? "not-allowed" : "pointer",
              }}>{busy ? "Generating…" : "⚡ Generate for All Batches"}</button>
              {rows.length > 0 && (
                <button onClick={clearAll} style={{ padding: "11px 16px", borderRadius: 8, fontWeight: 600, fontSize: 13, background: "#fff", color: C.bad, border: "1px solid #fecaca", cursor: "pointer" }}>
                  Clear
                </button>
              )}
            </div>
            <p style={{ margin: "12px 0 0", fontSize: 12, color: C.muted }}>
              Papers are 1 hour each (labs and practicals included): 10:00 to 11:00 AM and 11:30 AM to 12:30 PM.
              Exams are spread evenly across the week. One invigilator per room.
            </p>
          </div>
        )}

        {isAdmin && isExternal && (
          <div style={{ ...card, borderTop: `3px solid ${C.navy}` }}>
            <span style={caption}>Import external exam dates</span>
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "flex-end" }}>
              <input key={fileKey} type="file" accept=".csv,.xlsx" onChange={(e) => setFile(e.target.files[0] || null)} style={input} />
              <button onClick={importExternal} disabled={busy} style={{
                padding: "11px 22px", border: "none", borderRadius: 8, fontWeight: 700, fontSize: 14,
                background: busy ? "#94a3b8" : C.navy, color: "#fff", cursor: busy ? "not-allowed" : "pointer",
              }}>{busy ? "Importing…" : "📥 Import and Assign Invigilators"}</button>
              <button onClick={downloadTemplate} style={{ padding: "11px 16px", borderRadius: 8, fontWeight: 600, fontSize: 13, background: "#fff", color: C.navy, border: `1px solid ${C.navy}`, cursor: "pointer" }}>
                Download template
              </button>
              {rows.length > 0 && (
                <button onClick={clearAll} style={{ padding: "11px 16px", borderRadius: 8, fontWeight: 600, fontSize: 13, background: "#fff", color: C.bad, border: "1px solid #fecaca", cursor: "pointer" }}>
                  Clear
                </button>
              )}
            </div>
            <p style={{ margin: "12px 0 0", fontSize: 12, color: C.muted }}>
              Columns: <b>batch_name</b>, <b>subject_code</b>, <b>exam_date</b> (required); optional <b>start_time</b>, <b>end_time</b>
              (default 10:00 AM to 1:00 PM), <b>room_name</b>. If any row has a problem, nothing is imported.
            </p>
          </div>
        )}

        {loading ? (
          <p style={{ color: C.muted }}>Loading…</p>
        ) : rows.length === 0 ? (
          <div style={{ ...card, textAlign: "center", color: C.muted, padding: "40px 24px" }}>
            <div style={{ fontSize: 34, marginBottom: 8 }}>🗒️</div>
            {isAdmin
              ? isExternal ? "No external exam schedule yet. Import the dates file." : `No ${roundLabel} timetable yet. Click "Generate".`
              : `No ${roundLabel} exams scheduled.`}
          </div>
        ) : (
          <>
            {/* SUMMARY + PER DAY */}
            <div style={card}>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 18 }}>
                <Stat label="Total papers" value={rows.length} />
                <Stat label="Exam days" value={dates.length} />
                <Stat label="Batches" value={batchList.length} />
                <Stat label="Invigilators" value={invCount} />
              </div>
              <span style={caption}>Exams per day</span>
              <div style={{ display: "flex", gap: 12, alignItems: "flex-end", height: 110 }}>
                {byDate.map((g) => (
                  <div key={g.date} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", height: "100%" }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: C.navy, marginBottom: 3 }}>{g.items.length}</div>
                    <div style={{ width: "55%", maxWidth: 60, height: `${Math.max((g.items.length / maxDay) * 100, 6)}%`, background: C.navy2, borderRadius: "5px 5px 0 0" }} />
                    <div style={{ fontSize: 11, color: C.muted, marginTop: 5, whiteSpace: "nowrap" }}>{shortDate(g.date)}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* CONFLICT CHECK */}
            {isAdmin && check && (
              <div style={{ ...card, borderLeft: `5px solid ${check.ok ? C.ok : C.bad}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <div style={{ fontWeight: 700, fontSize: 15, color: check.ok ? C.ok : C.bad }}>
                    {check.ok ? "✓ No conflicts found" : `⚠ ${check.conflicts.length} conflict(s) found`}
                  </div>
                  <button onClick={runCheck} style={{ padding: "6px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600, background: "#fff", color: C.navy, border: `1px solid ${C.navy}`, cursor: "pointer" }}>
                    Re-check
                  </button>
                </div>
                <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>
                  {check.checked} exams checked for batch, room and invigilator clashes, absent invigilators, room capacity and Sundays.
                </div>
                {!check.ok && (
                  <ul style={{ margin: "10px 0 0", paddingLeft: 20, fontSize: 13 }}>
                    {check.conflicts.slice(0, 20).map((c, i) => (
                      <li key={i} style={{ marginBottom: 4 }}><b>{c.type}:</b> {c.detail}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {/* VIEW TOGGLE */}
            <div style={{ display: "inline-flex", background: "#fff", border: `1px solid ${C.border}`, borderRadius: 10, padding: 4, marginBottom: 16 }}>
              <button style={segBtn(view === "date")} onClick={() => setView("date")}>Date-wise</button>
              <button style={segBtn(view === "batch")} onClick={() => setView("batch")}>Batch-wise</button>
            </div>

            {view === "date" ? (
              byDate.map((g) => (
                <div key={g.date} style={{ ...card, padding: 0, overflow: "hidden" }}>
                  <div style={{ background: C.navy, color: "#fff", padding: "11px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>{longDate(g.date)}</div>
                    <div style={{ fontSize: 12, opacity: 0.85 }}>{g.items.length} paper(s)</div>
                  </div>
                  <div style={{ overflowX: "auto", padding: "4px 12px 12px" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                      <thead>
                        <tr style={{ textAlign: "left", color: C.muted, fontSize: 12 }}>
                          <th style={{ padding: 8 }}>Time</th><th>Batch</th><th>Subject</th><th>Room / Lab</th><th>Invigilator</th>
                        </tr>
                      </thead>
                      <tbody>
                        {g.items.map((r) => (
                          <tr key={r.exam_id} style={{ borderTop: `1px solid ${C.border}` }}>
                            <td style={{ padding: 9, whiteSpace: "nowrap" }}>
                              <span style={{ background: C.chip, color: C.navy, fontWeight: 600, padding: "3px 10px", borderRadius: 14, fontSize: 12 }}>
                                {fmt12(r.start_time)} – {fmt12(r.end_time)}
                              </span>
                            </td>
                            <td style={{ fontWeight: 600 }}>{r.batch_name}</td>
                            <td>{r.subject_name} <span style={{ color: C.muted }}>({r.subject_code})</span></td>
                            <td>{r.room_name}{r.room_type ? <span style={{ color: C.muted }}> · {r.room_type}</span> : ""}</td>
                            <td>
                              {isAdmin ? (
                                <select value={r.invigilator_id} onChange={(e) => changeInvigilator(r.exam_id, e.target.value)} style={{ ...input, padding: "4px 8px", fontSize: 13 }}>
                                  {teachers.map((t) => <option key={t.teacher_id} value={t.teacher_id}>{t.teacher_name}</option>)}
                                </select>
                              ) : <>👨‍🏫 {r.invigilator_name}</>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))
            ) : (
              <div style={{ ...card, padding: 0, overflow: "hidden" }}>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                    <thead>
                      <tr style={{ background: C.navy, color: "#fff" }}>
                        <th style={{ padding: "11px 14px", textAlign: "left", position: "sticky", left: 0, background: C.navy }}>Batch</th>
                        {dates.map((d) => <th key={d} style={{ padding: "11px 10px", minWidth: 150, textAlign: "left" }}>{shortDate(d)}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {batchList.map((b, bi) => (
                        <tr key={b} style={{ background: bi % 2 ? "#f8fafc" : "#fff", borderTop: `1px solid ${C.border}` }}>
                          <td style={{ padding: "10px 14px", fontWeight: 700, color: C.navy, position: "sticky", left: 0, background: bi % 2 ? "#f8fafc" : "#fff" }}>{b}</td>
                          {dates.map((d) => {
                            const items = cellMap[`${b}|${d}`] || [];
                            return (
                              <td key={d} style={{ padding: 8, verticalAlign: "top" }}>
                                {items.length === 0 ? <span style={{ color: "#cbd5e1" }}>—</span> : items.map((r) => (
                                  <div key={r.exam_id} style={{ background: C.chip, borderRadius: 8, padding: "6px 9px", marginBottom: 5 }}>
                                    <div style={{ fontWeight: 600, color: C.navy }}>{r.subject_name}</div>
                                    <div style={{ color: C.muted, fontSize: 11.5 }}>{fmt12(r.start_time)} · {r.room_name}</div>
                                  </div>
                                ))}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* FAIRNESS */}
            {isAdmin && summary.length > 0 && (
              <div style={card}>
                <span style={caption}>Invigilation workload · {roundLabel}</span>
                {summary.map((s) => (
                  <div key={s.teacher_id} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 9, fontSize: 13 }}>
                    <div style={{ width: 170 }}>{s.teacher_name}</div>
                    <div style={{ flex: 1, height: 10, background: "#e2e8f0", borderRadius: 10 }}>
                      <div style={{ width: `${(s.duties * 100) / maxDuties}%`, height: "100%", background: C.navy2, borderRadius: 10 }} />
                    </div>
                    <div style={{ width: 170, textAlign: "right", color: C.muted }}>
                      {s.duties} duties <span style={{ fontSize: 11 }}>(all rounds: {s.total_duties})</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}