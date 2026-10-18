import { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { ProgressBar, ProgressRing } from "./ProgressWidgets";
import HolidayBanner from "./HolidayBanner";
import NotificationBell from "./NotificationBell";
import MyGuideCard from "./MyGuideCard";
import MyExams from "./MyExams";
import { useExamWeek, ExamWeekBanner } from "./ExamWeek";

const API_URL = "http://127.0.0.1:8000";

const DAYS = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const WORKING_DAYS = ["Monday","Tuesday","Wednesday","Thursday","Friday"];

// ── helpers ───────────────────────────────────────────────────────────────────
function todayISODate() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString().slice(0, 10);
}

// seconds since midnight -> "1:20 PM"  (12-hour clock)
function formatTime(seconds) {
  if (seconds == null) return "";
  const t = Number(seconds);
  if (isNaN(t)) return "";
  const h24 = Math.floor(t / 3600) % 24;
  const m   = Math.floor((t % 3600) / 60);
  const h12 = h24 % 12 || 12;
  return `${h12}:${String(m).padStart(2, "0")} ${h24 < 12 ? "AM" : "PM"}`;
}

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "morning" : h < 17 ? "afternoon" : "evening";
}
function firstName(n) { return n ? n.split(" ")[0] : "there"; }

// ── design tokens ─────────────────────────────────────────────────────────────
const C = {
  bg:        "#f8f9fb",
  surface:   "#ffffff",
  border:    "#e8eaed",
  accent:    "#7c3aed",
  accentBg:  "#f5f3ff",
  accentDim: "#ede9fe",
  text:      "#0f172a",
  muted:     "#64748b",
  faint:     "#f1f5f9",
  success:   "#16a34a",
  successBg: "#dcfce7",
  warn:      "#d97706",
  warnBg:    "#fef3c7",
  subBg:     "#fff7ed",
  subBorder: "#fb923c",
};

const S = {
  page:   { minHeight:"100vh", background:C.bg,
            fontFamily:"'Inter',system-ui,sans-serif", color:C.text },
  wrap:   { maxWidth:1080, margin:"0 auto", padding:"32px 24px 64px" },

  hdr:    { display:"flex", justifyContent:"space-between", alignItems:"flex-start",
            flexWrap:"wrap", gap:12, marginBottom:24 },
  hdrRight:{ display:"flex", alignItems:"center", gap:10 },
  name:   { margin:0, fontSize:24, fontWeight:700, letterSpacing:"-0.4px" },
  sub:    { margin:"4px 0 0", fontSize:14, color:C.muted },
  logout: { padding:"8px 16px", background:C.surface, border:`1px solid ${C.border}`,
            borderRadius:8, fontSize:14, fontWeight:600, color:C.text, cursor:"pointer" },

  batchPill: { display:"inline-flex", alignItems:"center", gap:8,
              background:C.accentDim, color:C.accent,
              padding:"6px 14px", borderRadius:20, fontSize:13,
              fontWeight:600, marginBottom:28 },

  lbl:    { fontSize:11, fontWeight:700, letterSpacing:"0.07em",
            textTransform:"uppercase", color:C.muted, marginBottom:10 },

  card:   { background:C.surface, border:`1px solid ${C.border}`,
            borderRadius:12, padding:"22px 26px", marginBottom:20 },

  heroCard: { background:C.accent, borderRadius:12,
              padding:"24px 28px", marginBottom:20, color:"#fff" },
  heroLabel:{ fontSize:11, fontWeight:700, letterSpacing:"0.07em",
              textTransform:"uppercase", opacity:0.7, marginBottom:6 },
  heroSubj: { fontSize:22, fontWeight:700, margin:"0 0 6px" },
  heroMeta: { fontSize:14, opacity:0.85 },
  heroTime: { marginTop:12, display:"inline-block", background:"rgba(255,255,255,0.18)",
              padding:"5px 14px", borderRadius:20, fontSize:13, fontWeight:600 },

  row:    { display:"flex", justifyContent:"space-between", alignItems:"center",
            flexWrap:"wrap", gap:8, padding:"13px 16px",
            background:C.faint, borderRadius:8,
            borderLeft:`3px solid ${C.accent}`, marginBottom:8 },
  rowSub: { borderLeft:`3px solid ${C.subBorder}`,
            background:C.subBg },

  rowTitle:{ fontWeight:600, fontSize:15 },
  rowMeta: { fontSize:13, color:C.muted, marginTop:2 },
  timeBadge:{ fontSize:13, fontWeight:500, whiteSpace:"nowrap",
              background:C.accentBg, color:C.accent,
              padding:"4px 10px", borderRadius:6 },
  subBadge: { fontSize:11, fontWeight:700, color:C.subBorder,
              background:"#fff7ed", border:`1px solid ${C.subBorder}`,
              padding:"2px 8px", borderRadius:10, marginLeft:8 },

  grid:   { overflowX:"auto" },
  table:  { width:"100%", borderCollapse:"collapse", fontSize:13 },
  th:     { padding:"10px 8px", textAlign:"center", fontWeight:600,
            fontSize:12, color:C.muted, borderBottom:`1px solid ${C.border}`,
            whiteSpace:"nowrap" },
  tdTime: { padding:"8px 10px", fontWeight:600, fontSize:12,
            color:C.muted, whiteSpace:"nowrap",
            borderRight:`1px solid ${C.border}` },
  td:     { padding:"6px 6px", verticalAlign:"top",
            borderBottom:`1px solid ${C.faint}` },
  tdLunch:{ padding:"6px 10px", textAlign:"center", fontSize:12, fontWeight:600,
            color:C.muted, background:C.faint, letterSpacing:"0.05em" },
  cell:   { background:C.accentDim, borderRadius:6,
            padding:"6px 10px", fontSize:12 },
  cellSub:{ background:"#fff7ed", borderRadius:6,
            padding:"6px 10px", fontSize:12,
            border:`1px solid #fde68a` },
  cellSubj:{ fontWeight:600, color:C.accent, marginBottom:2 },
  cellMeta:{ color:C.muted, lineHeight:1.4 },

  empty:  { textAlign:"center", padding:"32px 0", color:C.muted },
  emptyIco:{ fontSize:36, marginBottom:10 },


// notes / PYQ download rows
  docRow: { display:"flex", justifyContent:"space-between", alignItems:"center",
            flexWrap:"wrap", gap:8, padding:"11px 14px",
            background:C.faint, borderRadius:8, marginBottom:8 },
  docTitle:{ fontWeight:600, fontSize:14 },
  docMeta: { fontSize:12, color:C.muted, marginTop:2 },
  docBtn:  { padding:"6px 12px", fontSize:13, fontWeight:600,
            background:C.surface, border:`1px solid ${C.border}`,
            borderRadius:6, cursor:"pointer" },
  tabRow:  { display:"flex", gap:8, marginBottom:14 },
  tabBtn:  { padding:"6px 16px", fontSize:13, fontWeight:600,
              borderRadius:20, cursor:"pointer", border:`1px solid ${C.border}`,
              background:C.surface, color:C.muted },
  tabBtnActive: { background:C.accent, color:"#fff", borderColor:C.accent },
};

// ── Time slots for grid: 50-min classes, 1-hour lunch 12:20 PM - 1:20 PM ──────
const TIME_SLOTS = [
  { label:"9:00 – 9:50",    start:32400 },
  { label:"9:50 – 10:40",   start:35400 },
  { label:"10:40 – 11:30",  start:38400 },
  { label:"11:30 – 12:20",  start:41400 },
  { label:"12:20 – 1:20",   lunch:true },
  { label:"1:20 – 2:10",    start:48000 },
  { label:"2:10 – 3:00",    start:51000 },
  { label:"3:00 – 3:50",    start:54000 },
];

// ── Main Component ────────────────────────────────────────────────────────────
export default function StudentDashboard() {
  const { user } = useAuth();
  const studentId = user?.student_id;
  const token = user?.access_token;
  const examWeek = useExamWeek();
  const classesSuspended = !!examWeek?.active;

  const [student,       setStudent]       = useState(null);
  const [batch,         setBatch]         = useState(null);
  const [timetables,    setTimetables]    = useState([]);
  const [substitutions, setSubstitutions] = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [error,         setError]         = useState(null);
  const [syllabus,      setSyllabus]      = useState(null);
  const [now,           setNow]           = useState(new Date());

  // tick every 30 seconds so the "ongoing / next / all done" card stays correct
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);

  const todayName    = DAYS[new Date().getDay()];
  const todayDate    = todayISODate();
  const todayFormatted = new Date().toLocaleDateString("en-IN", {
    weekday:"long", day:"numeric", month:"long"
  });

   // Notes & PYQs — the backend auto-filters both to this student's own batch.
  const [docTab,      setDocTab]      = useState("notes"); // "notes" | "pyqs"
  const [notes,       setNotes]       = useState([]);
  const [pyqs,        setPyqs]        = useState([]);
  const [docsLoading, setDocsLoading] = useState(true);

  // ── fetch everything ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!studentId) { setLoading(false); return; }

    (async () => {
      try {
        setLoading(true);

        // 1. get student record
        const sRes  = await fetch(`${API_URL}/students`);
        const sData = sRes.ok ? await sRes.json() : [];
        const me    = sData.find(s => s.student_id === studentId);
        if (!me) throw new Error("Student record not found. Contact admin.");
        setStudent(me);

        // 2. find the student's OWN batch (by batch_id).
        //    Fallback to dept + semester only if batch_id is missing.
        const bRes  = await fetch(`${API_URL}/batches`);
        const bData = bRes.ok ? await bRes.json() : [];
        let myBatch = me.batch_id
          ? bData.find(b => b.batch_id === me.batch_id) ?? null
          : null;
        if (!myBatch) {
          myBatch = bData.find(
            b => b.department_id === me.department_id && b.semester === me.semester
          ) ?? null;
        }
        setBatch(myBatch);

        if (!myBatch) {
          setLoading(false);
          return;
        }

        // 3. timetables + substitutions in parallel
        const [ttRes, subRes] = await Promise.all([
          fetch(`${API_URL}/timetables`),
          fetch(`${API_URL}/substitutions`),
        ]);

        const ttAll  = ttRes.ok  ? await ttRes.json()  : [];
        const subAll = subRes.ok ? await subRes.json() : [];

        setTimetables(ttAll.filter(t => t.batch_id === myBatch.batch_id));
        setSubstitutions(subAll.filter(s => s.substitution_date === todayDate));

      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [studentId]);

  // ── syllabus progress (small summary card) ──────────────────────────────────
  useEffect(() => {
    if (!user?.access_token) return;
    fetch(`${API_URL}/syllabus/progress/me`, {
      headers: { Authorization: `Bearer ${user.access_token}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then(setSyllabus)
      .catch(() => {});
  }, [user]);

   // ── Notes & PYQs: the backend sees role = "student" in the JWT and filters
  //    to this student's own batch automatically, so no batch_id param needed.
  useEffect(() => {
    if (!token) { setDocsLoading(false); return; }
 
    (async () => {
      try {
        setDocsLoading(true);
        const authHeaders = { Authorization: `Bearer ${token}` };
        const [notesRes, pyqsRes] = await Promise.all([
          fetch(`${API_URL}/notes`, { headers: authHeaders }),
          fetch(`${API_URL}/pyqs`,  { headers: authHeaders }),
        ]);
        setNotes(notesRes.ok ? await notesRes.json() : []);
        setPyqs(pyqsRes.ok  ? await pyqsRes.json()  : []);
      } catch (e) {
        console.error("Could not load notes/PYQs:", e);
      } finally {
        setDocsLoading(false);
      }
    })();
  }, [token]);
 
  // Downloads need the Bearer token, so a plain <a href> can't be used —
  // fetch the PDF as a blob and trigger the save from memory.
  const handleDocDownload = async (kind, id, fileName) => {
    try {
      const res = await fetch(`${API_URL}/${kind}/${id}/download`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Download failed");
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName || "file.pdf";
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      alert(e.message || "Could not download file");
    }
  };

  // ── derived data ────────────────────────────────────────────────────────────
   const todaysRegular = useMemo(() =>
    timetables
      .filter(t => !classesSuspended && t.day_of_week === todayName)
      .sort((a,b) => Number(a.start_time) - Number(b.start_time)),
  [timetables, todayName, classesSuspended]);

  // substitution map: timetable_id -> substitute teacher name
  const subMap = useMemo(() => {
    const m = {};
    substitutions.forEach(s => { m[s.timetable_id] = s.substitute_teacher; });
    return m;
  }, [substitutions]);

  const todaysMerged = useMemo(() =>
    todaysRegular.map(t => ({
      ...t,
      substituteTeacher: subMap[t.timetable_id] ?? null,
    })),
  [todaysRegular, subMap]);

  const nowSeconds = now.getHours() * 3600 + now.getMinutes() * 60;

  // class running right now (started, not yet finished)
  const currentClass = todaysMerged.find(
    t => Number(t.start_time) <= nowSeconds && nowSeconds < Number(t.end_time)
  ) ?? null;

  // next class that has not started yet
  const nextClass = todaysMerged.find(t => Number(t.start_time) > nowSeconds) ?? null;

  // "all done" only after the LAST class has actually ended (e.g. 3:50 PM)
  const lastEnd = todaysMerged.length
    ? Math.max(...todaysMerged.map(t => Number(t.end_time)))
    : 0;
  const allDone = todaysMerged.length > 0 && nowSeconds >= lastEnd;

  // weekly grid: "Day_startSeconds" -> class
  const weeklyMap = useMemo(() => {
    const m = {};
    timetables.forEach(t => {
      m[`${t.day_of_week}_${Number(t.start_time)}`] = t;
    });
    return m;
  }, [timetables]);

  // ── render states ───────────────────────────────────────────────────────────
  if (!studentId) return <NotLinked />;

  if (loading) return (
    <div style={{ ...S.page, display:"flex", alignItems:"center", justifyContent:"center" }}>
      <p style={{ color:C.muted }}>Loading your dashboard…</p>
    </div>
  );

  if (error) return (
    <div style={{ ...S.page, display:"flex", alignItems:"center", justifyContent:"center" }}>
      <div style={{ maxWidth:400, textAlign:"center", padding:32 }}>
        <div style={{ fontSize:40, marginBottom:12 }}>⚠️</div>
        <p style={{ color:C.muted }}>{error}</p>
      </div>
    </div>
  );

  return (
    <div style={S.page}>
      <div style={S.wrap}>

        {/* HEADER (with notification bell) */}
        <div style={S.hdr}>
          <div>
            <h1 style={S.name}>Good {greeting()}, {firstName(user?.name)} 👋</h1>
            <p style={S.sub}>{todayFormatted} · SchedAI Student Portal</p>
          </div>
          <div style={S.hdrRight}>
            <NotificationBell role="student" />
          </div>
        </div>

        {/* HOLIDAY NOTIFICATIONS */}
        <HolidayBanner />
        <ExamWeekBanner week={examWeek} />

        {/* BATCH PILL */}
        {batch ? (
          <div style={S.batchPill}>
            🎓 {batch.batch_name}{batch.section ? ` · Section ${batch.section}` : ""}
            &nbsp;·&nbsp; Semester {student?.semester}
          </div>
        ) : (
          <div style={{ ...S.batchPill, background:C.warnBg, color:C.warn }}>
            ⚠️ No batch found for your account — contact admin
          </div>
        )}

        {/* NOW / NEXT CLASS HERO */}
        {currentClass ? (
          <div style={{ ...S.heroCard, background:"#16a34a" }}>
            <div style={S.heroLabel}>Ongoing now</div>
            <div style={S.heroSubj}>{currentClass.subject_name}</div>
            <div style={S.heroMeta}>
              {currentClass.substituteTeacher
                ? `🔄 ${currentClass.substituteTeacher} (substitute)`
                : `👤 ${currentClass.teacher_name}`}
              &nbsp;·&nbsp; 🏫 {currentClass.room_name}
            </div>
            <div style={S.heroTime}>
              {formatTime(currentClass.start_time)} – {formatTime(currentClass.end_time)}
            </div>
            {nextClass && (
              <div style={{ marginTop:12, fontSize:13, opacity:0.9 }}>
                Next: <b>{nextClass.subject_name}</b> at {formatTime(nextClass.start_time)}
              </div>
            )}
          </div>
        ) : nextClass ? (
          <div style={S.heroCard}>
            <div style={S.heroLabel}>Up next</div>
            <div style={S.heroSubj}>{nextClass.subject_name}</div>
            <div style={S.heroMeta}>
              {nextClass.substituteTeacher
                ? `🔄 ${nextClass.substituteTeacher} (substitute)`
                : `👤 ${nextClass.teacher_name}`}
              &nbsp;·&nbsp; 🏫 {nextClass.room_name}
            </div>
            <div style={S.heroTime}>
              {formatTime(nextClass.start_time)} – {formatTime(nextClass.end_time)}
            </div>
          </div>
        ) : allDone ? (
          <div style={{ ...S.heroCard, background:"#475569" }}>
            <div style={S.heroLabel}>Classes today</div>
            <div style={S.heroSubj}>All done for the day 🎉</div>
            <div style={S.heroMeta}>No more classes remaining today.</div>
          </div>
        ) : null}

        {/* TODAY'S CLASSES */}
        <div style={S.card}>
          <p style={S.lbl}>Today's Schedule</p>

          {todaysMerged.length === 0 ? (
            <div style={S.empty}>
              <div style={S.emptyIco}>☀️</div>
              <p style={{ margin:0, fontSize:14 }}>No classes scheduled today.</p>
            </div>
          ) : (
            todaysMerged.map(t => (
              <div
                key={t.timetable_id}
                style={{ ...S.row, ...(t.substituteTeacher ? S.rowSub : {}) }}
              >
                <div>
                  <div style={S.rowTitle}>
                    {t.subject_name}
                    {t.substituteTeacher && (
                      <span style={S.subBadge}>Substitute</span>
                    )}
                  </div>
                  <div style={S.rowMeta}>
                    {t.subject_code} &nbsp;·&nbsp;
                    {t.substituteTeacher
                      ? `🔄 ${t.substituteTeacher}`
                      : `👤 ${t.teacher_name}`}
                    &nbsp;·&nbsp; 🏫 {t.room_name}
                  </div>
                </div>
                <div style={{
                  ...S.timeBadge,
                  ...(t.substituteTeacher
                    ? { background:"#fff7ed", color:C.subBorder }
                    : {})
                }}>
                  {formatTime(t.start_time)} – {formatTime(t.end_time)}
                </div>
              </div>
            ))
          )}
        </div>
        <MyExams />
        {/* PROJECT GUIDE */}
        <MyGuideCard />
        {/* SYLLABUS PROGRESS */}
        {syllabus && syllabus.subjects.length > 0 && (
          <div style={S.card}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
              <p style={{ ...S.lbl, margin:0 }}>Syllabus Progress</p>
              <Link
                to="/student/syllabus"
                style={{ fontSize:13, fontWeight:600, color:C.accent, textDecoration:"none" }}
              >
                View details →
              </Link>
            </div>

            <div style={{ display:"flex", gap:24, alignItems:"center", flexWrap:"wrap" }}>
              <ProgressRing percent={syllabus.percent} size={96} sub="overall" />
              <div style={{ flex:1, minWidth:240 }}>
                {syllabus.subjects.slice(0, 5).map((s) => (
                  <div key={s.subject_id} style={{ marginBottom:10 }}>
                    <div style={{ display:"flex", justifyContent:"space-between", fontSize:13, marginBottom:4 }}>
                      <span>{s.subject_name}</span>
                      <span style={{ color:C.muted }}>
                        {s.total ? `${s.covered}/${s.total} · ${s.percent}%` : "no topics yet"}
                      </span>
                    </div>
                    <ProgressBar percent={s.percent} height={7} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* WEEKLY TIMETABLE GRID */}
        {batch && (
          <div style={S.card}>
            <p style={S.lbl}>Weekly Timetable</p>
            <div style={S.grid}>
              <table style={S.table}>
                <thead>
                  <tr>
                    <th style={{ ...S.th, textAlign:"left", width:110 }}>Time</th>
                    {WORKING_DAYS.map(d => (
                      <th
                        key={d}
                        style={{
                          ...S.th,
                          color: d === todayName ? C.accent : C.muted,
                          fontWeight: d === todayName ? 700 : 600,
                        }}
                      >
                        {d.slice(0,3)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {TIME_SLOTS.map(slot => (
                    slot.lunch ? (
                      <tr key="lunch">
                        <td style={S.tdTime}>{slot.label}</td>
                        <td style={S.tdLunch} colSpan={WORKING_DAYS.length}>
                          🍽️ LUNCH BREAK
                        </td>
                      </tr>
                    ) : (
                      <tr key={slot.start}>
                        <td style={S.tdTime}>{slot.label}</td>
                        {WORKING_DAYS.map(day => {
                          const cls = weeklyMap[`${day}_${slot.start}`];
                          const isSub = cls && subMap[cls.timetable_id] && day === todayName;
                          return (
                            <td key={day} style={S.td}>
                              {cls ? (
                                <div style={isSub ? S.cellSub : S.cell}>
                                  <div style={S.cellSubj}>{cls.subject_code}</div>
                                  <div style={S.cellMeta}>
                                    {isSub
                                      ? `🔄 ${subMap[cls.timetable_id]}`
                                      : cls.teacher_name?.split(" ").slice(-1)[0]}
                                    <br />{cls.room_name}
                                  </div>
                                </div>
                              ) : null}
                            </td>
                          );
                        })}
                      </tr>
                    )
                  ))}
                </tbody>
              </table>
            </div>
            <p style={{ fontSize:12, color:C.muted, marginTop:12, marginBottom:0 }}>
              <span style={{ color:C.accent, fontWeight:600 }}>■</span> Regular class &nbsp;
              <span style={{ color:C.subBorder, fontWeight:600 }}>■</span> Substitute today
            </p>
          </div>
        )}

        {/* SUBSTITUTION NOTICE (if any today) */}
        {substitutions.length > 0 && (
          <div style={{ ...S.card, border:`1.5px solid ${C.subBorder}`, background:C.subBg }}>
            <p style={{ ...S.lbl, color:C.warn }}>⚠️ Substitutions Today</p>
            {substitutions.map(s => (
              <div key={s.substitution_id} style={{ marginBottom:10, fontSize:14 }}>
                <strong>{s.subject_name}</strong> at {formatTime(s.start_time)} —
                <span style={{ color:C.muted }}> {s.absent_teacher} is absent.</span>
                <br />
                <span style={{ color:C.success, fontWeight:500 }}>
                  ✓ {s.substitute_teacher} will take this class.
                </span>
              </div>
            ))}
          </div>
        )}
        {/* STUDY MATERIAL — Notes & PYQs for this student's own batch */}
          <div style={S.card}>
            <p style={S.lbl}>Study Material</p>
 
          <div style={S.tabRow}>
            <button
              onClick={() => setDocTab("notes")}
              style={{ ...S.tabBtn, ...(docTab === "notes" ? S.tabBtnActive : {}) }}
            >
              📝 Notes ({notes.length})
            </button>
            <button
              onClick={() => setDocTab("pyqs")}
              style={{ ...S.tabBtn, ...(docTab === "pyqs" ? S.tabBtnActive : {}) }}
            >
              📄 PYQs ({pyqs.length})
            </button>
          </div>
 
          {docsLoading ? (
            <p style={{ color:C.muted, fontSize:14 }}>Loading…</p>
            ) : docTab === "notes" ? (
            notes.length === 0 ? (
              <div style={S.empty}>
                <div style={S.emptyIco}>📭</div>
                <p style={{ margin:0, fontSize:14 }}>No notes uploaded yet for your batch.</p>
              </div>
            ) : (
              notes.map(n => (
                <div key={n.note_id} style={S.docRow}>
                  <div>
                    <div style={S.docTitle}>
                      {n.title}
                      {n.unit && (
                        <span style={{ color:C.muted, fontWeight:400 }}> — {n.unit}</span>
                      )}
                    </div>
                    <div style={S.docMeta}>
                      {n.subject_name} ({n.subject_code})
                      {n.teacher_name && ` · ${n.teacher_name}`}
                    </div>
                  </div>
                  <button
                    style={S.docBtn}
                    onClick={() => handleDocDownload("notes", n.note_id, n.file_name)}
                  >
                    ⬇️ Download
                  </button>
                </div>
              ))
            )
          ) : (
            pyqs.length === 0 ? (
              <div style={S.empty}>
                <div style={S.emptyIco}>📭</div>
                <p style={{ margin:0, fontSize:14 }}>No PYQs uploaded yet for your batch.</p>
              </div>
            ) : (
              pyqs.map(p => (
                <div key={p.pyq_id} style={S.docRow}>
                  <div>
                    <div style={S.docTitle}>
                      {p.title}
                      <span style={{
                        marginLeft:8, fontSize:11, fontWeight:700,
                        background:C.accentDim, color:C.accent,
                        padding:"2px 8px", borderRadius:10,
                      }}>
                        {p.exam_year}
                      </span>
                    </div>
                    <div style={S.docMeta}>
                      {p.subject_name} ({p.subject_code})
                    </div>
                  </div>
                  <button
                    style={S.docBtn}
                    onClick={() => handleDocDownload("pyqs", p.pyq_id, p.file_name)}
                  >
                    ⬇️ Download
                  </button>
                </div>
              ))
            )
          )}
        </div>
      </div>
    </div>
  );
}

// ── Not linked state ──────────────────────────────────────────────────────────
function NotLinked() {
  return (
    <div style={{ ...S.page, display:"flex", alignItems:"center", justifyContent:"center" }}>
      <div style={{ maxWidth:400, textAlign:"center", padding:32 }}>
        <div style={{ fontSize:48, marginBottom:16 }}>🔗</div>
        <h2 style={{ margin:"0 0 8px" }}>Account not linked</h2>
        <p style={{ color:C.muted, marginBottom:24 }}>
          This account isn't connected to a student record yet.
          Contact your admin to link your account.
        </p>
      </div>
    </div>
  );
}