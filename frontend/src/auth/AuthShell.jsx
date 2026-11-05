import { Link } from "react-router-dom";

export default function AuthShell({ title, subtitle, children }) {
  return (
    <div className="auth-page">
      <aside className="auth-side">
        <div className="auth-brand">SchedAI</div>
        <p className="auth-tag">AI-Powered Department Scheduling &amp; Academic Coordination</p>
        <ul className="auth-points">
          <li>Conflict-free timetable generation</li>
          <li>Instant teacher substitution</li>
          <li>Syllabus, exams and project guides in one place</li>
        </ul>
      </aside>

      <main className="auth-main">
        <div className="auth-card">
          <h1>{title}</h1>
          {subtitle && <p className="auth-sub">{subtitle}</p>}
          {children}
          <p className="auth-home">
            <Link to="/">← Back to home</Link>
          </p>
        </div>
      </main>
    </div>
  );
}