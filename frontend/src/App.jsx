import { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route, Link, Outlet } from "react-router-dom";
import "./App.css";

import Departments from "./pages/Departments";
import Teachers from "./pages/Teachers";
import Subjects from "./pages/Subjects";
import Rooms from "./pages/Rooms";
import Students from "./pages/Students";
import Batches from "./pages/Batches";
import TeacherDashboard from "./pages/TeacherDashboard";
import StudentDashboard from "./pages/StudentDashboard";
import Timetable from "./pages/Timetables";
import TeacherAbsences from "./pages/TeacherAbsences";
import Substitutions from "./pages/Substitutions";
import ProjectGuides from "./pages/ProjectGuides";
import SyllabusProgress from "./pages/SyllabusProgress";
import Holidays from "./pages/Holidays";
import Events from "./pages/Events";
import HolidayBanner from "./pages/HolidayBanner";

import { useAuth } from "./auth/AuthContext";
import ProtectedRoute from "./auth/ProtectedRoute";
import AdminLogin from "./auth/AdminLogin";
import AdminSignup from "./auth/AdminSignup";
import TeacherLogin from "./auth/TeacherLogin";
import TeacherSignup from "./auth/TeacherSignup";
import StudentLogin from "./auth/StudentLogin";
import StudentSignup from "./auth/StudentSignup";
import NotificationBell from "./pages/NotificationBell";
import RoleLayout from "./pages/RoleLayout";
import Profile from "./pages/Profile";
import Notes from "./pages/Notes";
import PYQs from "./pages/PYQs";
import ImportData from "./pages/ImportData";
const API_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

// =========================
// PUBLIC LANDING PAGE ("/")
// =========================
function RoleCard({ emoji, title, loginPath, signupPath }) {
  return (
    <div
      style={{
        background: "#ffffff",
        border: "1px solid #e5e7eb",
        borderRadius: "16px",
        padding: "36px 28px",
        width: "240px",
        textAlign: "center",
        boxShadow: "0 4px 14px rgba(15, 23, 42, 0.06)",
      }}
    >
      <div style={{ fontSize: "40px", marginBottom: "12px" }}>{emoji}</div>

      <h2 style={{ margin: "0 0 24px", fontSize: "20px", color: "#111827" }}>
        {title}
      </h2>

      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
        <Link to={loginPath}>
          <button
            style={{
              width: "100%",
              padding: "10px",
              background: "#1e293b",
              color: "white",
              fontWeight: "600",
            }}
          >
            Login
          </button>
        </Link>

        <Link to={signupPath}>
          <button
            style={{
              width: "100%",
              padding: "10px",
              background: "white",
              color: "#1e293b",
              border: "1px solid #1e293b",
              fontWeight: "600",
            }}
          >
            Sign Up
          </button>
        </Link>
      </div>
    </div>
  );
}

function Landing() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "#f6f8fc",
        padding: "40px 20px",
      }}
    >
      <h1 style={{ fontSize: "34px", marginBottom: "6px", color: "#111827" }}>
        SchedAI
      </h1>

      <p style={{ marginBottom: "6px", color: "#374151", fontSize: "15px" }}>
        AI-Powered Department Scheduling &amp; Academic Coordination
      </p>

      <p style={{ marginBottom: "40px", color: "#6b7280", fontSize: "16px" }}>
        Choose how you'd like to sign in
      </p>

      <div
        style={{
          display: "flex",
          gap: "24px",
          justifyContent: "center",
          flexWrap: "wrap",
        }}
      >
        <RoleCard
          emoji="🛠️"
          title="Admin"
          loginPath="/admin/login"
          signupPath="/admin/signup"
        />
        <RoleCard
          emoji="👨‍🏫"
          title="Teacher"
          loginPath="/teacher/login"
          signupPath="/teacher/signup"
        />
        <RoleCard
          emoji="🎓"
          title="Student"
          loginPath="/student/login"
          signupPath="/student/signup"
        />
      </div>
    </div>
  );
}

// =========================
// DASHBOARD CARD
// =========================
function DashboardCard({ to, title, description }) {
  return (
    <Link to={to} className="dashboard-card-link">
      <div className="dashboard-card">
        <h2>{title}</h2>
        <p>{description}</p>
        <span className="card-arrow">→</span>
      </div>
    </Link>
  );
}

// =========================
// LIVE STAT CARD (Admin Dashboard)
// =========================
const D = {
  border:    "#e5e7eb",
  surface:   "#ffffff",
  muted:     "#6b7280",
  text:      "#111827",
  accent:    "#1e293b",
  success:   "#16a34a",
  successBg: "#dcfce7",
  warn:      "#d97706",
  warnBg:    "#fef3c7",
  danger:    "#dc2626",
  dangerBg:  "#fee2e2",
  faint:     "#f8fafc",
};

function StatCard({ label, value, sub, tone, to }) {
  const toneColor = {
    default: D.accent,
    success: D.success,
    warn:    D.warn,
    danger:  D.danger,
  }[tone || "default"];

  const cardStyle = {
    background: D.surface,
    border: `1px solid ${D.border}`,
    borderRadius: 10,
    padding: "18px 20px",
    minWidth: 150,
    flex: "1 1 150px",
    display: "block",
    textDecoration: "none",
    color: "inherit",
    cursor: to ? "pointer" : "default",
    transition: "border-color 0.15s, box-shadow 0.15s",
  };

  const content = (
    <>
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}>
        <div style={{ fontSize: 26, fontWeight: 700, color: toneColor, lineHeight: 1 }}>
          {value}
        </div>
        {to && (
          <span style={{ fontSize: 13, color: D.muted }}>→</span>
        )}
      </div>
      <div style={{ fontSize: 13, color: D.text, marginTop: 6, fontWeight: 500 }}>
        {label}
      </div>
      {sub && (
        <div style={{ fontSize: 12, color: D.muted, marginTop: 2 }}>
          {sub}
        </div>
      )}
    </>
  );

  if (to) {
    return (
      <Link
        to={to}
        style={cardStyle}
        onMouseEnter={e => {
          e.currentTarget.style.borderColor = D.accent;
          e.currentTarget.style.boxShadow = "0 2px 8px rgba(15, 23, 42, 0.08)";
        }}
        onMouseLeave={e => {
          e.currentTarget.style.borderColor = D.border;
          e.currentTarget.style.boxShadow = "none";
        }}
      >
        {content}
      </Link>
    );
  }

  return <div style={cardStyle}>{content}</div>;
}

// =========================
// ADMIN DASHBOARD (home page inside /admin)
// =========================
function Dashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const res = await fetch(`${API_URL}/admin/dashboard-stats`);
        if (!res.ok) throw new Error("Could not load dashboard stats");
        const data = await res.json();
        setStats(data);
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <h1>SchedAI</h1>
        <p>Welcome to your department's academic scheduling &amp; coordination system.</p>
      </div>

      {/* ── HOLIDAY NOTIFICATIONS ── */}
      <HolidayBanner />

      {/* ── LIVE STATS ── */}
      {loading ? (
        <p style={{ color: D.muted, fontSize: 14 }}>Loading dashboard stats…</p>
      ) : error ? (
        <p style={{ color: D.danger, fontSize: 14 }}>{error}</p>
      ) : stats && (
        <div style={{ marginBottom: 32 }}>
          {/* Row 1: department totals */}
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 14 }}>
            <StatCard label="Total Teachers" value={stats.totals.teachers} to="/admin/teachers" />
            <StatCard label="Total Students" value={stats.totals.students} to="/admin/students" />
            <StatCard label="Total Batches" value={stats.totals.batches} to="/admin/batches" />
            <StatCard label="Total Subjects" value={stats.totals.subjects} to="/admin/subjects" />
            <StatCard label="Total Rooms" value={stats.totals.rooms} to="/admin/rooms" />
          </div>

          {/* Row 2: today's operational status */}
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 14 }}>
            <StatCard
              label={`Today's Classes (${stats.today_day_name})`}
              value={stats.today.classes_scheduled}
              to="/admin/timetable-link"
            />
            <StatCard
              label="Teachers Absent Today"
              value={stats.today.teachers_absent}
              tone={stats.today.teachers_absent > 0 ? "warn" : "success"}
              sub={
                stats.today.absent_teachers.length > 0
                  ? stats.today.absent_teachers.map(t => t.teacher_name).join(", ")
                  : "All present"
              }
              to="/admin/teacher-absences"
            />
            <StatCard
              label="Pending Substitutions"
              value={stats.today.pending_substitutions}
              tone={stats.today.pending_substitutions > 0 ? "warn" : "success"}
              to="/admin/substitutions"
            />
            <StatCard
              label="Timetable Status"
              value={`${stats.timetable_status.batches_with_timetable}/${stats.timetable_status.total_batches}`}
              sub="batches generated"
              tone={stats.timetable_status.batches_without_timetable > 0 ? "warn" : "success"}
              to="/admin/timetable-link"
            />
          </div>

          {/* Row 3: progress overviews */}
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
            <StatCard
              label="Syllabus Progress"
              value={`${stats.syllabus.average_progress_percent}%`}
              sub={`${stats.syllabus.subjects_tracked} subjects tracked`}
              to="/admin/syllabus-progress"
            />
            <StatCard
              label="Project Guide Allocation"
              value={`${stats.project_guides.students_with_guide}/${stats.project_guides.students_total}`}
              sub="students assigned a guide"
              tone={
                stats.project_guides.students_with_guide < stats.project_guides.students_total
                  ? "warn" : "success"
              }
              to="/admin/project-guides"
            />
          </div>

          {/* Today's substitution detail, if any */}
          {stats.today.substitutions.length > 0 && (
            <div style={{
              marginTop: 14,
              background: D.warnBg,
              border: `1px solid ${D.warn}`,
              borderRadius: 10,
              padding: "14px 18px",
            }}>
              <div style={{ fontWeight: 600, fontSize: 13, color: D.warn, marginBottom: 8 }}>
                ⚠️ Substitutions today
              </div>
              {stats.today.substitutions.map(s => (
                <div key={s.substitution_id} style={{ fontSize: 13, color: D.text, marginBottom: 4 }}>
                  {s.subject_name} — {s.absent_teacher} → {s.substitute_teacher}
                  <span style={{ color: D.muted }}> ({s.status})</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── EXISTING NAVIGATION GRID ── */}
      <div className="dashboard-grid">
        <DashboardCard to="/admin/departments" title="Departments" description="Manage department information." />
        <DashboardCard to="/admin/teachers" title="Teachers" description="Manage teacher records." />
        <DashboardCard to="/admin/subjects" title="Subjects" description="Manage department subjects." />
        <DashboardCard to="/admin/rooms" title="Rooms" description="Manage classrooms and rooms." />
        <DashboardCard to="/admin/students" title="Students" description="Manage student records." />
        <DashboardCard to="/admin/batches" title="Batches" description="Manage batches/sections." />
        <DashboardCard to="/admin/timetable-link" title="Timetable" description="Generate and manage the AI timetable." />
        <DashboardCard to="/admin/teacher-absences" title="Teacher Absences" description="Manage teacher absence records." />
        <DashboardCard to="/admin/substitutions" title="Substitutions" description="Manage teacher substitutions." />
        <DashboardCard to="/admin/syllabus-progress" title="Syllabus Progress" description="Track subject syllabus progress." />
        <DashboardCard to="/admin/project-guides" title="Project Guides" description="Manage final year project guides." />
        <DashboardCard to="/admin/holidays" title="Holiday Calendar" description="Manage department holidays." />
        <DashboardCard to="/admin/notes" title="Notes" description="Manage semester Notes." />
        <DashboardCard to="/admin/pyqs" title="Previous Year Questions" description="Manage previous year question papers." />
        <DashboardCard to="/admin/import" title="Import Data" description="Import data from CSV files." />
      </div>
    </div>
  );
}

// =========================
// ADMIN LAYOUT (sidebar + profile + logout, wraps every /admin/* page)
// =========================
function AdminLayout() {
  const { user } = useAuth();

  return (
    <div className="app">
      {/* Make the admin sidebar scrollable when the menu is taller than the screen */}
      <style>{`
        .sidebar {
          max-height: 100vh;
          overflow-y: auto !important;
          overscroll-behavior: contain;
        }
        .sidebar .sidebar-nav {
          overflow: visible !important;
          padding-bottom: 24px;
        }
        .sidebar::-webkit-scrollbar { width: 6px; }
        .sidebar::-webkit-scrollbar-thumb { background: #475569; border-radius: 3px; }
      `}</style>

      <aside className="sidebar">
        <div className="sidebar-header">
          <h2>SchedAI</h2>
          <p>Logged in as {user?.name} (Admin)</p>
        </div>

        <nav className="sidebar-nav">
          <Link to="/admin/dashboard"><span>🏠</span>Dashboard</Link>
          <Link to="/admin/profile"><span>👤</span>Profile</Link>
          <Link to="/admin/departments"><span>🏢</span>Departments</Link>
          <Link to="/admin/teachers"><span>👨‍🏫</span>Teachers</Link>
          <Link to="/admin/subjects"><span>📚</span>Subjects</Link>
          <Link to="/admin/rooms"><span>🏫</span>Rooms</Link>
          <Link to="/admin/students"><span>🎓</span>Students</Link>
          <Link to="/admin/batches"><span>👥</span>Batches</Link>
          <Link to="/admin/timetable-link"><span>🗓️</span>Timetable</Link>
          <Link to="/admin/teacher-absences"><span>📅</span>Teacher Absences</Link>
          <Link to="/admin/substitutions"><span>🔄</span>Substitutions</Link>
          <Link to="/admin/syllabus-progress"><span>📊</span>Syllabus Progress</Link>
          <Link to="/admin/project-guides"><span>👨‍💼</span>Project Guides</Link>
          <Link to="/admin/holidays"><span>🎉</span>Holiday Calendar</Link>
          <Link to="/admin/events"><span>📢</span>Events</Link>
          <Link to="/admin/notes"><span>📚</span>Notes</Link>
          <Link to="/admin/pyqs"><span>📝</span>PYQs</Link>
          <Link to="/admin/import"><span>📥</span>Import Data</Link>
          
        </nav>
      </aside>

      <main className="main-content">
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            alignItems: "center",
            gap: 14,
            padding: "12px 20px",
            borderBottom: "1px solid #e5e7eb",
            background: "#fff",
          }}
        >
          <NotificationBell role="admin" />
          <Link
            to="/admin/profile"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              textDecoration: "none",
              color: "#111827",
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            <span
              style={{
                width: 30,
                height: 30,
                borderRadius: "50%",
                background: "#1e293b",
                color: "#fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 13,
              }}
            >
              {(user?.name || "?").charAt(0).toUpperCase()}
            </span>
            {user?.name}
          </Link>
        </div>

        <Outlet />
      </main>
    </div>
  );
}

// =========================
// APP
// =========================
function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public landing + auth pages */}
        <Route path="/" element={<Landing />} />
        <Route path="/admin/login" element={<AdminLogin />} />
        <Route path="/admin/signup" element={<AdminSignup />} />
        <Route path="/teacher/login" element={<TeacherLogin />} />
        <Route path="/teacher/signup" element={<TeacherSignup />} />
        <Route path="/student/login" element={<StudentLogin />} />
        <Route path="/student/signup" element={<StudentSignup />} />

        {/* Teacher area (sidebar: Dashboard + Profile) */}
        <Route
          path="/teacher"
          element={
            <ProtectedRoute allowedRoles={["teacher"]} loginPath="/teacher/login">
              <RoleLayout role="teacher" />
            </ProtectedRoute>
          }
        >
          <Route path="dashboard" element={<TeacherDashboard />} />
          <Route path="profile" element={<Profile role="teacher" />} />
        </Route>

        {/* Student area (sidebar: Dashboard + Profile) */}
        <Route
          path="/student"
          element={
            <ProtectedRoute allowedRoles={["student"]} loginPath="/student/login">
              <RoleLayout role="student" />
            </ProtectedRoute>
          }
        >
          <Route path="dashboard" element={<StudentDashboard />} />
          <Route path="profile" element={<Profile role="student" />} />
        </Route>

        {/* Admin area: everything below requires an admin login */}
        <Route
          path="/admin"
          element={
            <ProtectedRoute allowedRoles={["admin"]} loginPath="/admin/login">
              <AdminLayout />
            </ProtectedRoute>
          }
        >
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="departments" element={<Departments />} />
          <Route path="teachers" element={<Teachers />} />
          <Route path="subjects" element={<Subjects />} />
          <Route path="rooms" element={<Rooms />} />
          <Route path="students" element={<Students />} />
          <Route path="batches" element={<Batches />} />
          <Route path="timetable-link" element={<Timetable />} />
          <Route path="teacher-absences" element={<TeacherAbsences />} />
          <Route path="substitutions" element={<Substitutions />} />
          <Route path="syllabus-progress" element={<SyllabusProgress />} />
          <Route path="project-guides" element={<ProjectGuides />} />
          <Route path="holidays" element={<Holidays />} />
          <Route path="events" element={<Events />} />
          <Route path="profile" element={<Profile role="admin" />} />
          <Route path="notes" element={<Notes />} />
          <Route path="pyqs" element={<PYQs />} />
          <Route path="import" element={<ImportData />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;