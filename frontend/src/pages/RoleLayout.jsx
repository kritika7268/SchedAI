import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

const ACCENT = { teacher: "#2563eb", student: "#7c3aed" };
const ROLE_LABEL = { teacher: "Teacher", student: "Student" };

function initials(name) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] || "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

/**
 * Sidebar layout for the Teacher and Student portals.
 * <RoleLayout role="teacher" />  /  <RoleLayout role="student" />
 * Renders the sidebar (Dashboard, Profile) and the active page in <Outlet />.
 */
export default function RoleLayout({ role }) {
  const { user } = useAuth();
  const accent = ACCENT[role] || "#1e293b";
  const base = `/${role}`;

  const links = [
    { to: `${base}/dashboard`, icon: "🏠", label: "Dashboard" },
    { to: `${base}/profile`, icon: "👤", label: "Profile" },
  ];

  return (
    <div className="role-shell">
      <style>{`
        .role-shell { display:flex; min-height:100vh; background:#f8f9fb;
                      font-family:'Inter',system-ui,sans-serif; }
        .role-side  { width:230px; flex-shrink:0; background:#0f172a; color:#fff;
                      padding:24px 14px; position:sticky; top:0; height:100vh;
                      box-sizing:border-box; display:flex; flex-direction:column; }
        .role-main  { flex:1; min-width:0; }
        .role-link  { display:flex; align-items:center; gap:10px; padding:10px 12px;
                      border-radius:8px; color:#cbd5e1; text-decoration:none;
                      font-size:14px; font-weight:500; margin-bottom:4px; }
        .role-link:hover { background:#1e293b; color:#fff; }
        @media (max-width: 720px) {
          .role-shell { flex-direction:column; }
          .role-side  { width:100%; height:auto; position:static;
                        flex-direction:row; align-items:center; gap:10px;
                        padding:10px 14px; overflow-x:auto; }
          .role-brand, .role-user { display:none; }
          .role-nav   { display:flex; gap:6px; }
          .role-link  { margin-bottom:0; white-space:nowrap; }
        }
      `}</style>

      <aside className="role-side">
        <div className="role-brand" style={{ marginBottom: 22, paddingLeft: 6 }}>
          <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-0.3px" }}>SchedAI</div>
          <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>
            {ROLE_LABEL[role]} Portal
          </div>
        </div>

        <div
          className="role-user"
          style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "10px 8px", marginBottom: 18,
            background: "#1e293b", borderRadius: 10,
          }}
        >
          <div
            style={{
              width: 36, height: 36, borderRadius: "50%", background: accent,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontWeight: 700, fontSize: 13, flexShrink: 0,
            }}
          >
            {initials(user?.name)}
          </div>
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontSize: 13, fontWeight: 600, overflow: "hidden",
                textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}
            >
              {user?.name}
            </div>
            <div style={{ fontSize: 11, color: "#94a3b8" }}>{ROLE_LABEL[role]}</div>
          </div>
        </div>

        <nav className="role-nav">
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              className="role-link"
              style={({ isActive }) =>
                isActive ? { background: accent, color: "#fff" } : undefined
              }
            >
              <span>{l.icon}</span>
              {l.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <main className="role-main">
        <Outlet />
      </main>
    </div>
  );
}