import { useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { ProgressBar, ProgressRing } from "./ProgressWidgets";

const API_URL = "http://127.0.0.1:8000";

const C = {
  surface: "#ffffff",
  border: "#e8eaed",
  text: "#0f172a",
  muted: "#64748b",
  accent: "#1e293b",
  faint: "#f1f5f9",
  done: "#16a34a",
  going: "#2563eb",
  notStarted: "#d97706",
  none: "#cbd5e1",
};

const S = {
  page: {
    padding: "28px 32px 64px",
    maxWidth: 1250,
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
  },
  label: { fontSize: 11, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: C.muted },
};

// one subject of one batch -> which bucket does it fall in?
function bucket(subject) {
  if (subject.total === 0) return "none";
  if (subject.covered >= subject.total) return "done";
  if (subject.covered > 0) return "going";
  return "notStarted";
}

const BUCKETS = [
  { id: "done", label: "Completed", color: C.done },
  { id: "going", label: "In progress", color: C.going },
  { id: "notStarted", label: "Not started", color: C.notStarted },
  { id: "none", label: "No topics added", color: C.none },
];

export default function AdminSyllabus() {
  const { user } = useAuth();

  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [openBatch, setOpenBatch] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const response = await fetch(`${API_URL}/syllabus/progress/overview`, {
          headers: { Authorization: `Bearer ${user?.access_token}` },
        });
        let body = null;
        try {
          body = await response.json();
        } catch (e) {
          /* no body */
        }
        if (!response.ok) {
          if (response.status === 401) throw new Error("Your session has expired. Please log in again.");
          throw new Error(typeof body?.detail === "string" ? body.detail : "Could not load syllabus progress.");
        }
        setData(body);
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) return <div style={S.page}>Loading syllabus progress…</div>;

  if (!data) {
    return (
      <div style={S.page}>
        <h1 style={S.h1}>Syllabus Progress</h1>
        <div style={{ ...S.card, marginTop: 20, color: "#991b1b" }}>{error}</div>
      </div>
    );
  }

  // count every (batch, subject) pair
  const counts = { done: 0, going: 0, notStarted: 0, none: 0 };
  data.batches.forEach((b) => b.subjects.forEach((s) => counts[bucket(s)]++));
  const totalSubjects = counts.done + counts.going + counts.notStarted + counts.none;
  const batchesWithTopics = data.batches.filter((b) => b.total > 0).length;

  return (
    <div style={S.page}>
      <h1 style={S.h1}>Syllabus Progress</h1>
      <p style={S.sub}>
        A department-wide view of how much of the syllabus has been taught. Teachers update their own
        subjects — this page is read-only.
      </p>

      {/* ── department overview ── */}
      <div style={{ ...S.card, marginBottom: 24 }}>
        <div style={{ display: "flex", gap: 36, alignItems: "center", flexWrap: "wrap" }}>
          <ProgressRing percent={data.overall.percent} size={160} stroke={16} sub="all batches" />

          <div style={{ flex: 1, minWidth: 280 }}>
            <div style={S.label}>Whole department</div>

            <div style={{ display: "flex", gap: 30, margin: "10px 0 18px", flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: 28, fontWeight: 700, color: C.done }}>{data.overall.covered}</div>
                <div style={{ fontSize: 12, color: C.muted }}>topics taught</div>
              </div>
              <div>
                <div style={{ fontSize: 28, fontWeight: 700 }}>{data.overall.remaining}</div>
                <div style={{ fontSize: 12, color: C.muted }}>topics remaining</div>
              </div>
              <div>
                <div style={{ fontSize: 28, fontWeight: 700 }}>{counts.done}</div>
                <div style={{ fontSize: 12, color: C.muted }}>
                  of {totalSubjects} subjects completed
                </div>
              </div>
              <div>
                <div style={{ fontSize: 28, fontWeight: 700 }}>{batchesWithTopics}</div>
                <div style={{ fontSize: 12, color: C.muted }}>of {data.batches.length} batches tracked</div>
              </div>
            </div>

            {/* status split bar */}
            <div style={{ ...S.label, marginBottom: 6 }}>Subjects by status</div>
            <div style={{ display: "flex", height: 14, borderRadius: 14, overflow: "hidden", background: C.faint }}>
              {BUCKETS.map((b) =>
                counts[b.id] > 0 ? (
                  <div
                    key={b.id}
                    title={`${b.label}: ${counts[b.id]}`}
                    style={{ width: `${(counts[b.id] * 100) / totalSubjects}%`, background: b.color }}
                  />
                ) : null
              )}
            </div>
            <div style={{ display: "flex", gap: 18, flexWrap: "wrap", marginTop: 10 }}>
              {BUCKETS.map((b) => (
                <div key={b.id} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 3, background: b.color }} />
                  {b.label} <b>{counts[b.id]}</b>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── batch-wise ── */}
      <div style={{ ...S.label, marginBottom: 10 }}>Batch-wise</div>

      {data.batches.length === 0 ? (
        <div style={{ ...S.card, color: C.muted }}>No batches found.</div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))",
            gap: 16,
            alignItems: "start",
          }}
        >
          {data.batches.map((b) => {
            const isOpen = openBatch === b.batch_id;
            return (
              <div key={b.batch_id} style={S.card}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 16 }}>{b.batch_name}</div>
                    <div style={{ fontSize: 12, color: C.muted, margin: "2px 0 10px" }}>
                      Semester {b.semester} · {b.subjects.length} subject(s)
                    </div>
                    {b.total === 0 ? (
                      <div style={{ fontSize: 13, color: C.muted }}>No topics added yet</div>
                    ) : (
                      <div style={{ fontSize: 13 }}>
                        <b>{b.covered}</b> of <b>{b.total}</b> topics taught
                        <div style={{ color: C.muted, marginTop: 2 }}>{b.remaining} remaining</div>
                      </div>
                    )}
                  </div>
                  <ProgressRing percent={b.percent} size={84} stroke={10} />
                </div>

                {b.subjects.length > 0 && (
                  <button
                    onClick={() => setOpenBatch(isOpen ? null : b.batch_id)}
                    style={{
                      marginTop: 14,
                      border: "none",
                      background: C.faint,
                      color: C.accent,
                      padding: "6px 12px",
                      borderRadius: 8,
                      fontWeight: 600,
                      fontSize: 12,
                      cursor: "pointer",
                    }}
                  >
                    {isOpen ? "Hide subjects ▲" : "View subjects ▼"}
                  </button>
                )}

                {isOpen && (
                  <div style={{ marginTop: 14 }}>
                    {b.subjects.map((s) => (
                      <div key={s.subject_id} style={{ marginBottom: 12 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 13, marginBottom: 4 }}>
                          <span>
                            <b>{s.subject_name}</b>
                            {s.teachers.length > 0 && (
                              <span style={{ color: C.muted }}> · {s.teachers.join(", ")}</span>
                            )}
                          </span>
                          <span style={{ color: C.muted, whiteSpace: "nowrap" }}>
                            {s.total ? `${s.covered}/${s.total} · ${s.percent}%` : "no topics"}
                          </span>
                        </div>
                        <ProgressBar percent={s.percent} height={7} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}