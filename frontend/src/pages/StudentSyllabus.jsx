import { useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { ProgressBar, ProgressRing } from "./progressWidgets";

const API_URL = "http://127.0.0.1:8000";

const C = {
  surface: "#ffffff",
  border: "#e8eaed",
  text: "#0f172a",
  muted: "#64748b",
  accent: "#7c3aed",
  accentDim: "#ede9fe",
  faint: "#f1f5f9",
  ok: "#16a34a",
};

const S = {
  page: {
    padding: "28px 32px 64px",
    maxWidth: 1100,
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

export default function StudentSyllabus() {
  const { user } = useAuth();

  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const [openId, setOpenId] = useState(null);
  const [topics, setTopics] = useState(null);

  const api = async (path) => {
    const response = await fetch(`${API_URL}${path}`, {
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
      throw new Error(typeof body?.detail === "string" ? body.detail : "Something went wrong.");
    }
    return body;
  };

  useEffect(() => {
    (async () => {
      try {
        setData(await api("/syllabus/progress/me"));
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleOpen = async (subject) => {
    if (openId === subject.subject_id) {
      setOpenId(null);
      return;
    }
    setOpenId(subject.subject_id);
    setTopics(null);
    try {
      const detail = await api(`/syllabus/subject/${subject.subject_id}/batch/${data.batch_id}`);
      setTopics(detail.topics);
    } catch (e) {
      setTopics([]);
      setError(e.message);
    }
  };

  const groupByUnit = (list) => {
    const units = {};
    list.forEach((t) => (units[t.unit_no] = units[t.unit_no] || []).push(t));
    return Object.keys(units)
      .sort((a, b) => Number(a) - Number(b))
      .map((u) => ({ unit: u, items: units[u] }));
  };

  if (loading) return <div style={S.page}>Loading your syllabus…</div>;

  if (!data) {
    return (
      <div style={S.page}>
        <h1 style={S.h1}>Syllabus Progress</h1>
        <div style={{ ...S.card, marginTop: 20, color: C.muted, fontSize: 14 }}>{error}</div>
      </div>
    );
  }

  return (
    <div style={S.page}>
      <h1 style={S.h1}>Syllabus Progress</h1>
      <p style={S.sub}>
        How much of each subject your teachers have taught so far — {data.batch_name}, Semester{" "}
        {data.semester}.
      </p>

      {error && (
        <div
          style={{
            padding: "10px 14px",
            marginBottom: 16,
            borderRadius: 8,
            background: "#fee2e2",
            color: "#991b1b",
            fontSize: 14,
          }}
        >
          {error}
        </div>
      )}

      {/* overall */}
      <div style={{ ...S.card, display: "flex", gap: 28, alignItems: "center", flexWrap: "wrap", marginBottom: 20 }}>
        <ProgressRing percent={data.percent} size={130} sub="overall" />
        <div style={{ flex: 1, minWidth: 240 }}>
          <div style={S.label}>Overall</div>
          <div style={{ display: "flex", gap: 28, margin: "10px 0 14px", flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 26, fontWeight: 700, color: C.ok }}>{data.covered}</div>
              <div style={{ fontSize: 12, color: C.muted }}>topics covered</div>
            </div>
            <div>
              <div style={{ fontSize: 26, fontWeight: 700 }}>{data.remaining}</div>
              <div style={{ fontSize: 12, color: C.muted }}>topics remaining</div>
            </div>
            <div>
              <div style={{ fontSize: 26, fontWeight: 700 }}>{data.total}</div>
              <div style={{ fontSize: 12, color: C.muted }}>total topics</div>
            </div>
          </div>
          <ProgressBar percent={data.percent} height={10} />
        </div>
      </div>

      {/* subject-wise */}
      <div style={{ ...S.label, marginBottom: 10 }}>Subject-wise</div>

      {data.subjects.length === 0 ? (
        <div style={{ ...S.card, color: C.muted, fontSize: 14 }}>
          No subjects are set up for your batch yet.
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
            gap: 16,
            alignItems: "start",
          }}
        >
          {data.subjects.map((s) => (
            <div key={s.subject_id} style={S.card}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{s.subject_name}</div>
                  <div style={{ fontSize: 12, color: C.muted, margin: "2px 0 10px" }}>
                    {s.subject_code || "—"}
                    {s.teachers.length > 0 && ` · ${s.teachers.join(", ")}`}
                  </div>
                  {s.total === 0 ? (
                    <div style={{ fontSize: 13, color: C.muted }}>Topics not added yet</div>
                  ) : (
                    <div style={{ fontSize: 13 }}>
                      <b>{s.covered}</b> of <b>{s.total}</b> topics done
                      <div style={{ color: C.muted, marginTop: 2 }}>{s.remaining} remaining</div>
                    </div>
                  )}
                </div>
                <ProgressRing percent={s.percent} size={76} stroke={9} />
              </div>

              {s.total > 0 && (
                <>
                  <div style={{ margin: "14px 0 10px" }}>
                    <ProgressBar percent={s.percent} height={7} />
                  </div>
                  <button
                    onClick={() => toggleOpen(s)}
                    style={{
                      border: "none",
                      background: C.accentDim,
                      color: C.accent,
                      padding: "6px 12px",
                      borderRadius: 8,
                      fontWeight: 600,
                      fontSize: 12,
                      cursor: "pointer",
                    }}
                  >
                    {openId === s.subject_id ? "Hide topics ▲" : "View topics ▼"}
                  </button>
                </>
              )}

              {openId === s.subject_id && (
                <div style={{ marginTop: 14 }}>
                  {topics === null ? (
                    <div style={{ fontSize: 13, color: C.muted }}>Loading topics…</div>
                  ) : (
                    groupByUnit(topics).map((g) => (
                      <div key={g.unit} style={{ marginBottom: 10 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: C.accent, marginBottom: 4 }}>
                          Unit {g.unit}
                        </div>
                        {g.items.map((t) => (
                          <div
                            key={t.topic_id}
                            style={{
                              display: "flex",
                              gap: 8,
                              fontSize: 13,
                              padding: "5px 0",
                              color: t.covered ? C.text : C.muted,
                            }}
                          >
                            <span style={{ color: t.covered ? C.ok : "#cbd5e1" }}>{t.covered ? "✓" : "○"}</span>
                            <span style={{ flex: 1 }}>{t.topic_title}</span>
                            {t.covered_on && (
                              <span style={{ fontSize: 11, color: C.muted }}>{t.covered_on}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}