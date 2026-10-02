import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import HolidayBanner from "./HolidayBanner";
import NotificationBell from "./NotificationBell";

const API_URL = "http://127.0.0.1:8000";

const DAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

const WORKING_DAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
];

// seconds since midnight -> "1:20 PM"  (12-hour clock)
function formatTime(seconds) {
  if (seconds === null || seconds === undefined) return "";
  const total = Number(seconds);
  if (Number.isNaN(total)) return "";
  const h24 = Math.floor(total / 3600) % 24;
  const m = Math.floor((total % 3600) / 60);
  const h12 = h24 % 12 || 12;
  return `${h12}:${String(m).padStart(2, "0")} ${h24 < 12 ? "AM" : "PM"}`;
}

function todayISODate() {
  const d = new Date();
  const offset = d.getTimezoneOffset();
  const local = new Date(d.getTime() - offset * 60000);
  return local.toISOString().slice(0, 10);
}

// ── colour palette (slate-based, single accent) ──────────────────────────────
const C = {
  bg:        "#f8f9fb",
  surface:   "#ffffff",
  border:    "#e8eaed",
  accent:    "#2563eb",
  accentBg:  "#eff6ff",
  text:      "#0f172a",
  muted:     "#64748b",
  faint:     "#f1f5f9",
  success:   "#16a34a",
  successBg: "#dcfce7",
  danger:    "#dc2626",
  dangerBg:  "#fee2e2",
  warn:      "#d97706",
  warnBg:    "#fef3c7",
  barActive: "#2563eb",
  barRest:   "#cbd5e1",
};

const style = {
  page:    { minHeight:"100vh", background:C.bg, fontFamily:"'Inter',system-ui,sans-serif", color:C.text },
  wrap:    { maxWidth:1080, margin:"0 auto", padding:"32px 24px 64px" },

  header:  { display:"flex", justifyContent:"space-between", alignItems:"flex-start",
             flexWrap:"wrap", gap:12, marginBottom:24 },
  headerRight: { display:"flex", alignItems:"center", gap:10 },
  greeting:{ margin:0, fontSize:24, fontWeight:700, letterSpacing:"-0.4px" },
  sub:     { margin:"4px 0 0", fontSize:14, color:C.muted },
  logout:  { padding:"8px 16px", background:C.surface, border:`1px solid ${C.border}`,
             borderRadius:8, fontSize:14, fontWeight:600, color:C.text,
             cursor:"pointer", display:"flex", alignItems:"center", gap:6 },

  sectionLabel: { fontSize:11, fontWeight:700, letterSpacing:"0.08em",
                  textTransform:"uppercase", color:C.muted, marginBottom:12 },

  card:    { background:C.surface, border:`1px solid ${C.border}`,
             borderRadius:12, padding:"24px 28px", marginBottom:24 },

  classRow:{ display:"flex", justifyContent:"space-between", alignItems:"center",
             flexWrap:"wrap", gap:8, padding:"14px 18px",
             background:C.faint, borderRadius:8,
             borderLeft:`3px solid ${C.accent}` },
  classTitle:{ fontWeight:600, fontSize:15 },
  classMeta: { fontSize:13, color:C.muted, marginTop:2 },
  classTime: { fontSize:13, fontWeight:500, whiteSpace:"nowrap",
               background:C.accentBg, color:C.accent,
               padding:"4px 10px", borderRadius:6 },

  statRow: { display:"flex", gap:12, flexWrap:"wrap", marginBottom:28 },
  stat:    { flex:"1 1 120px", background:C.surface, border:`1px solid ${C.border}`,
             borderRadius:10, padding:"16px 20px" },
  statNum: { fontSize:26, fontWeight:700, lineHeight:1 },
  statLbl: { fontSize:12, color:C.muted, marginTop:4 },

  barWrap: { display:"flex", alignItems:"flex-end", gap:10, height:100, marginTop:8 },
  barCol:  { flex:1, display:"flex", flexDirection:"column", alignItems:"center",
             justifyContent:"flex-end", height:"100%" },
  barCount:{ fontSize:12, fontWeight:700, marginBottom:3 },
  barRect: { width:"60%", borderRadius:"4px 4px 0 0" },
  barDay:  { fontSize:12, marginTop:6 },

  formRow: { display:"flex", gap:12, flexWrap:"wrap", alignItems:"center", marginTop:16 },
  input:   { padding:"10px 14px", fontSize:14, border:`1px solid ${C.border}`,
             borderRadius:8, background:C.surface, color:C.text,
             outline:"none", flex:"1 1 160px" },
  btn:     { padding:"10px 20px", borderRadius:8, fontSize:14,
             fontWeight:600, cursor:"pointer", border:"none",
             background:C.accent, color:"#fff", whiteSpace:"nowrap" },
  btnDis:  { background:C.barRest, cursor:"not-allowed" },

  bannerOk:  { padding:"12px 16px", borderRadius:8, background:C.successBg,
               color:C.success, fontSize:14, fontWeight:500, marginTop:16 },
  bannerErr: { padding:"12px 16px", borderRadius:8, background:C.dangerBg,
               color:C.danger, fontSize:14, fontWeight:500, marginTop:16 },
  warnBox:   { marginTop:10 },
  warnTitle: { fontWeight:600, color:C.warn, fontSize:14 },

  table:   { width:"100%", borderCollapse:"collapse" },
  th:      { textAlign:"left", padding:"8px 12px", fontSize:12, fontWeight:600,
             color:C.muted, borderBottom:`1px solid ${C.border}`,
             textTransform:"uppercase", letterSpacing:"0.05em" },
  td:      { padding:"12px 12px", fontSize:14, borderBottom:`1px solid ${C.faint}`, color:C.text },
  badge:   { display:"inline-block", padding:"2px 8px", borderRadius:20,
             fontSize:12, fontWeight:500 },
};

export default function TeacherDashboard() {
  const { user, logout } = useAuth();
  const teacherId = user?.teacher_id;

  const [timetables, setTimetables] = useState([]);
  const [absences,   setAbsences]   = useState([]);
  const [loading,    setLoading]     = useState(true);

  const [absentDate, setAbsentDate] = useState(todayISODate());
  const [reason,     setReason]     = useState("");
  const [running,    setRunning]    = useState(false);
  const [result,     setResult]     = useState(null);

  const todayName = DAYS[new Date().getDay()];
  const todayFormatted = new Date().toLocaleDateString("en-IN", {
    weekday:"long", day:"numeric", month:"long"
  });

  const fetchAll = async () => {
    try {
      setLoading(true);
      const [ttRes, absRes] = await Promise.all([
        fetch(`${API_URL}/timetables`),
        fetch(`${API_URL}/teacher-absences`),
      ]);
      setTimetables(ttRes.ok ? await ttRes.json() : []);
      setAbsences(absRes.ok   ? await absRes.json() : []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAll(); }, []);

  const myClasses    = useMemo(() => timetables.filter(t => t.teacher_id === teacherId), [timetables, teacherId]);
  const todaysClasses = useMemo(() =>
    myClasses.filter(t => t.day_of_week === todayName).sort((a,b) => Number(a.start_time) - Number(b.start_time)),
  [myClasses, todayName]);

  const workloadByDay = useMemo(() => {
    const counts = {};
    WORKING_DAYS.forEach(d => (counts[d] = 0));
    myClasses.forEach(t => { if (counts[t.day_of_week] !== undefined) counts[t.day_of_week]++; });
    return counts;
  }, [myClasses]);

  const maxDailyLoad = Math.max(1, ...Object.values(workloadByDay));

  const myAbsences = useMemo(() =>
    absences.filter(a => a.teacher_id === teacherId)
            .sort((a,b) => a.absence_date < b.absence_date ? 1 : -1),
  [absences, teacherId]);

  const handleMarkAbsent = async () => {
    if (!absentDate) { alert("Please pick a date"); return; }
    if (!window.confirm(`Mark yourself absent on ${absentDate}? SchedAI will auto-assign substitutes for all affected classes.`)) return;
    try {
      setRunning(true); setResult(null);
      const params = new URLSearchParams({
        teacher_id: teacherId, absence_date: absentDate, reason: reason || "Not specified"
      });
      const res  = await fetch(`${API_URL}/auto-substitute?${params}`, { method:"POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(
        typeof data.detail === "string" ? data.detail : "Failed to mark absence"
      );
      setResult(data); setReason("");
      await fetchAll();
    } catch (e) {
      setResult({ error: e.message });
    } finally {
      setRunning(false);
    }
  };

  if (!teacherId) return (
    <div style={{ ...style.page, display:"flex", alignItems:"center", justifyContent:"center" }}>
      <div style={{ maxWidth:400, textAlign:"center", padding:32 }}>
        <div style={{ fontSize:48, marginBottom:16 }}>🔗</div>
        <h2 style={{ margin:"0 0 8px" }}>Account not linked</h2>
        <p style={{ color:C.muted, marginBottom:24 }}>
          This account isn't connected to a teacher record yet. Contact an admin to link your account.
        </p>
        <button onClick={logout} style={{ ...style.btn }}>Sign out</button>
      </div>
    </div>
  );

  return (
    <div style={style.page}>
      <div style={style.wrap}>

        {/* ── HEADER (with notification bell) ── */}
        <div style={style.header}>
          <div>
            <h1 style={style.greeting}>Good {greeting()}, {firstName(user?.name)} 👋</h1>
            <p style={style.sub}>{todayFormatted} · SchedAI Teacher Portal</p>
          </div>
          <div style={style.headerRight}>
            <NotificationBell role="teacher" />
            <button onClick={logout} style={style.logout}>
              <span>🚪</span> Sign out
            </button>
          </div>
        </div>

        {/* ── HOLIDAY NOTIFICATIONS ── */}
        <HolidayBanner />

        {loading ? (
          <div style={{ color:C.muted, fontSize:15, paddingTop:40, textAlign:"center" }}>
            Loading your dashboard…
          </div>
        ) : (
          <>
            {/* ── QUICK STATS ── */}
            <div style={style.statRow}>
              <div style={style.stat}>
                <div style={{ ...style.statNum, color:C.accent }}>{myClasses.length}</div>
                <div style={style.statLbl}>Classes this week</div>
              </div>
              <div style={style.stat}>
                <div style={{ ...style.statNum, color:C.text }}>{todaysClasses.length}</div>
                <div style={style.statLbl}>Classes today</div>
              </div>
              <div style={style.stat}>
                <div style={{ ...style.statNum, color:C.success }}>{myAbsences.length}</div>
                <div style={style.statLbl}>Absences recorded</div>
              </div>
              <div style={style.stat}>
                <div style={{ ...style.statNum, color:C.text }}>
                  {workloadByDay[todayName] > 0
                    ? `${workloadByDay[todayName]} / 5`
                    : "—"}
                </div>
                <div style={style.statLbl}>Today's load</div>
              </div>
            </div>

            {/* ── TODAY'S CLASSES ── */}
            <div style={style.card}>
              <p style={style.sectionLabel}>Today's Classes</p>

              {todaysClasses.length === 0 ? (
                <div style={{ padding:"24px 0", textAlign:"center", color:C.muted }}>
                  <div style={{ fontSize:32, marginBottom:8 }}>☀️</div>
                  <p style={{ margin:0, fontSize:14 }}>No classes scheduled today — enjoy the free day!</p>
                </div>
              ) : (
                <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                  {todaysClasses.map(t => (
                    <div key={t.timetable_id} style={style.classRow}>
                      <div>
                        <div style={style.classTitle}>{t.subject_name}</div>
                        <div style={style.classMeta}>
                          {t.subject_code}
                          {t.batch_name && ` · ${t.batch_name}${t.section ? ` (${t.section})` : ""}`}
                          {` · ${t.room_name}`}
                        </div>
                      </div>
                      <div style={style.classTime}>
                        {formatTime(t.start_time)} – {formatTime(t.end_time)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ── WEEKLY WORKLOAD ── */}
            <div style={style.card}>
              <p style={style.sectionLabel}>Weekly Workload</p>

              <div style={style.barWrap}>
                {WORKING_DAYS.map(day => {
                  const count    = workloadByDay[day];
                  const pct      = count === 0 ? 3 : Math.max((count / maxDailyLoad) * 100, 8);
                  const isToday  = day === todayName;
                  return (
                    <div key={day} style={style.barCol}>
                      <div style={{
                        ...style.barCount,
                        color: isToday ? C.accent : C.muted,
                      }}>{count}</div>
                      <div style={{
                        ...style.barRect,
                        height: `${pct}%`,
                        background: isToday ? C.barActive : C.barRest,
                      }} />
                      <div style={{
                        ...style.barDay,
                        color:      isToday ? C.accent : C.muted,
                        fontWeight: isToday ? 700 : 400,
                      }}>{day.slice(0,3)}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ── REPORT ABSENCE ── */}
            <div style={{ ...style.card, border:`1.5px solid ${C.accent}` }}>
              <p style={style.sectionLabel}>Report Absence</p>
              <p style={{ margin:"0 0 4px", fontSize:15, fontWeight:600 }}>
                Can't make it in?
              </p>
              <p style={{ margin:0, fontSize:14, color:C.muted }}>
                SchedAI will automatically find and assign a substitute for every affected class.
                Your regular weekly timetable stays unchanged — only that day's schedule is updated.
              </p>

              <div style={style.formRow}>
                <input
                  type="date"
                  value={absentDate}
                  onChange={e => setAbsentDate(e.target.value)}
                  style={style.input}
                />
                <input
                  type="text"
                  placeholder="Reason (optional)"
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  style={{ ...style.input, minWidth:200 }}
                />
                <button
                  onClick={handleMarkAbsent}
                  disabled={running}
                  style={{ ...style.btn, ...(running ? style.btnDis : {}) }}
                >
                  {running ? "Submitting…" : "Mark Absent"}
                </button>
              </div>

              {result && (
                result.error
                  ? <div style={style.bannerErr}>{result.error}</div>
                  : <>
                      <div style={style.bannerOk}>✓ {result.message}</div>
                      {result.unassigned?.length > 0 && (
                        <div style={style.warnBox}>
                          <p style={style.warnTitle}>⚠️ Classes needing manual attention</p>
                          <ul style={{ margin:"6px 0 0", paddingLeft:20 }}>
                            {result.unassigned.map(u => (
                              <li key={u.timetable_id} style={{ fontSize:13, color:C.muted, marginBottom:4 }}>
                                {u.day_of_week} {u.start_label || u.start_time} — {u.reason}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </>
              )}
            </div>

            {/* ── ABSENCE HISTORY ── */}
            <div style={style.card}>
              <p style={style.sectionLabel}>Absence History</p>

              {myAbsences.length === 0 ? (
                <p style={{ color:C.muted, fontSize:14, margin:0 }}>No absences recorded yet. 🎉</p>
              ) : (
                <table style={style.table}>
                  <thead>
                    <tr>
                      <th style={style.th}>Date</th>
                      <th style={style.th}>Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {myAbsences.map(a => (
                      <tr key={a.absence_id}>
                        <td style={{ ...style.td, fontWeight:500 }}>{a.absence_date}</td>
                        <td style={{ ...style.td, color:C.muted }}>{a.reason || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function firstName(name) {
  return name ? name.split(" ")[0] : "there";
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "morning";
  if (h < 17) return "afternoon";
  return "evening";
}