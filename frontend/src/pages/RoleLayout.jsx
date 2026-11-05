import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import StudentChatbot from "./StudentChatbot";

const ROLE_LABEL = { teacher: "Teacher", student: "Student" };

function initials(name) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] || "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

/**
 * Sidebar layout for the Teacher and Student portals.
 * <RoleLayout role="teacher" />  /  <RoleLayout role="student" />
 * Uses the same academic theme (App.css) as the admin layout.
 */
export default function RoleLayout({ role }) {
  const { user } = useAuth();
  const base = `/${role}`;

  const links = [
    { to: `${base}/dashboard`, icon: "🏠", label: "Dashboard" },
    { to: `${base}/syllabus`, icon: "📖", label: "Syllabus" },
    ...(role === "teacher"
      ? [
          { to: `${base}/notes`, icon: "📚", label: "Notes" },
          { to: `${base}/pyqs`, icon: "📝", label: "PYQs" },
        ]
      : []),
    { to: `${base}/profile`, icon: "👤", label: "Profile" },
  ];

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="sidebar-header">
          <h2>SchedAI</h2>
          <p>{ROLE_LABEL[role]} Portal</p>
        </div>

        <div className="sidebar-user">
          <span className="topbar-avatar">{initials(user?.name)}</span>
          <div className="sidebar-user-text">
            <div className="sidebar-user-name">{user?.name}</div>
            <div className="sidebar-user-role">{ROLE_LABEL[role]}</div>
          </div>
        </div>

        <nav className="sidebar-nav">
          {links.map((l) => (
            <NavLink key={l.to} to={l.to}>
              <span>{l.icon}</span>
              {l.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <main className="main-content">
        <Outlet />
      </main>

      {/* AI assistant: floating chat, students only */}
            {role === "student" && <StudentChatbot />}
      {role === "teacher" && (
        <StudentChatbot
          endpoint="/ai-assistant/staff/chat"
          placeholder="Ask about your classes…"
          suggestions={[
            "What classes do I have today?",
            "How many classes do I have today?",
            "Am I free at 11 AM?",
            "What is my syllabus progress?",
            "Who is absent today?",
          ]}
          greeting={{ role: "assistant", content: "Hi! I'm SchedAI Assistant 👋 Ask me about your classes today, free periods, syllabus progress or who is absent." }}
        />
      )}
    </div>
  );
}