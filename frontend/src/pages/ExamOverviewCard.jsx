import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

const API_URL = "http://127.0.0.1:8000";

const ROUNDS = [
  { id: "class_test_1", label: "Class Test 1" },
  { id: "mid_sem", label: "Mid Sem" },
  { id: "class_test_2", label: "Class Test 2" },
  { id: "external", label: "External Exam" },
];

const N = {
  navy: "#1e3a5f", gold: "#c9a227", border: "#e2e8f0",
  muted: "#64748b", faint: "#f8fafc", chip: "#e8eef7",
};

const dayOf = (iso) => new Date(iso + "T00:00:00");
const fmt = (iso) => dayOf(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });

export default function ExamOverviewCard() {
  const { user } = useAuth();
  const [rows, setRows] = useState(null);
  const [conflicts, setConflicts] = useState(null);

  useEffect(() => {
    if (!user?.access_token) return;
    const headers = { Authorization: `Bearer ${user.access_token}` };

    fetch(`${API_URL}/exams/schedule`, { headers })
      .then((r) => (r.ok ? r.json() : []))
      .then(setRows)
      .catch(() => setRows([]));

    fetch(`${API_URL}/exams/conflicts`, { headers })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setConflicts(d ? d.conflicts.length : null))
      .catch(() => {});
  }, [user]);

  const summary = useMemo(() => {
    const out = {};
    (rows || []).forEach((r) => {
      const s = (out[r.exam_round] = out[r.exam_round] || { count: 0, from: r.exam_date, to: r.exam_date });
      s.count += 1;
      if (r.exam_date < s.from) s.from = r.exam_date;
      if (r.exam_date > s.to) s.to = r.exam_date;
    });
    return out;
  }, [rows]);

  if (rows === null) return null;

  const total = rows.length;

  return (
    <Link
      to="/admin/exams"
      style={{
        display: "block", textDecoration: "none", color: "inherit", marginTop: 14,
        background: "#fff", border: `1px solid ${N.border}`, borderRadius: 12,
        borderTop: `3px solid ${N.navy}`, padding: "18px 22px",
        boxShadow: "0 1px 3px rgba(15,23,42,0.05)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: N.navy }}>Examination Timetable</div>
          <div style={{ fontSize: 12, color: N.muted, marginTop: 2 }}>
            {total === 0 ? "No exams scheduled yet" : `${total} papers scheduled`}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {total > 0 && conflicts !== null && (
            <span style={{
              fontSize: 12, fontWeight: 600, padding: "4px 12px", borderRadius: 14,
              background: conflicts === 0 ? "#dcfce7" : "#fee2e2",
              color: conflicts === 0 ? "#166534" : "#991b1b",
            }}>
              {conflicts === 0 ? "✓ No conflicts" : `⚠ ${conflicts} conflict(s)`}
            </span>
          )}
          <span style={{ fontSize: 13, fontWeight: 600, color: N.navy }}>
            {total === 0 ? "Create →" : "View details →"}
          </span>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 10, marginTop: 14 }}>
        {ROUNDS.map((r) => {
          const s = summary[r.id];
          return (
            <div key={r.id} style={{
              background: N.faint, border: `1px solid ${N.border}`, borderRadius: 10, padding: "10px 14px",
            }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: N.navy }}>{r.label}</div>
              {s ? (
                <>
                  <div style={{ fontSize: 13, marginTop: 4 }}>
                    {s.from === s.to ? fmt(s.from) : `${fmt(s.from)} – ${fmt(s.to)}`}
                  </div>
                  <div style={{ fontSize: 11.5, color: N.muted, marginTop: 2 }}>{s.count} papers</div>
                </>
              ) : (
                <div style={{ fontSize: 12.5, color: N.muted, marginTop: 4 }}>Not scheduled</div>
              )}
            </div>
          );
        })}
      </div>
    </Link>
  );
}