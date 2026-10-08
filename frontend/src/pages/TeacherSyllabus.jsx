import { useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { ProgressBar, ProgressRing } from "./progressWidgets";

const API_URL = "http://127.0.0.1:8000";

function todayISODate() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

const C = {
  bg: "#f8f9fb",
  surface: "#ffffff",
  border: "#e8eaed",
  text: "#0f172a",
  muted: "#64748b",
  accent: "#2563eb",
  accentBg: "#eff6ff",
  faint: "#f1f5f9",
  ok: "#166534",
  okBg: "#dcfce7",
  bad: "#991b1b",
  badBg: "#fee2e2",
};

const S = {
  page: {
    padding: "28px 32px 64px",
    maxWidth: 1200,
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
    marginBottom: 20,
  },
  label: { fontSize: 11, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: C.muted },
  input: {
    padding: "9px 12px",
    fontSize: 14,
    border: `1px solid ${C.border}`,
    borderRadius: 8,
    background: C.surface,
    color: C.text,
    outline: "none",
    boxSizing: "border-box",
    fontFamily: "inherit",
  },
  btnPrimary: {
    padding: "10px 18px",
    background: C.accent,
    color: "#fff",
    border: "none",
    borderRadius: 8,
    fontWeight: 600,
    fontSize: 14,
    cursor: "pointer",
  },
};

export default function TeacherSyllabus() {
  const { user } = useAuth();

  const [classes, setClasses] = useState([]);
  const [loadingClasses, setLoadingClasses] = useState(true);
  const [selected, setSelected] = useState(null); // { subject_id, batch_id }
  const [detail, setDetail] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const [coveredOn, setCoveredOn] = useState(todayISODate());
  const [unitNo, setUnitNo] = useState(1);
  const [titles, setTitles] = useState("");
  const [busyTopic, setBusyTopic] = useState(null);
  const [message, setMessage] = useState(null); // { type, text }

  // ── API helper (sends the login token) ──────────────────────────────────────
  const api = async (path, options = {}) => {
    const response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${user?.access_token}`,
        "Content-Type": "application/json",
      },
    });

    let data = null;
    try {
      data = await response.json();
    } catch (e) {
      /* no body */
    }

    if (!response.ok) {
      if (response.status === 401) throw new Error("Your session has expired. Please log in again.");
      throw new Error(typeof data?.detail === "string" ? data.detail : "Something went wrong.");
    }
    return data;
  };

  const loadClasses = async (autoSelect = false) => {
    try {
      const data = await api("/syllabus/my-classes");
      setClasses(data);
      if (autoSelect && data.length > 0) {
        setSelected({ subject_id: data[0].subject_id, batch_id: data[0].batch_id });
      }
    } catch (e) {
      setMessage({ type: "error", text: e.message });
    } finally {
      setLoadingClasses(false);
    }
  };

  const loadDetail = async (sel) => {
    if (!sel) return;
    try {
      setLoadingDetail(true);
      setDetail(await api(`/syllabus/subject/${sel.subject_id}/batch/${sel.batch_id}`));
    } catch (e) {
      setDetail(null);
      setMessage({ type: "error", text: e.message });
    } finally {
      setLoadingDetail(false);
    }
  };

  useEffect(() => {
    loadClasses(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadDetail(selected);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  // ── actions ────────────────────────────────────────────────────────────────
  const toggleTopic = async (topic) => {
    try {
      setBusyTopic(topic.topic_id);
      setMessage(null);
      await api("/syllabus/coverage", {
        method: "POST",
        body: JSON.stringify({
          topic_id: topic.topic_id,
          batch_id: selected.batch_id,
          covered: !topic.covered,
          covered_on: !topic.covered ? coveredOn : null,
        }),
      });
      await loadDetail(selected);
      await loadClasses(false);
    } catch (e) {
      setMessage({ type: "error", text: e.message });
    } finally {
      setBusyTopic(null);
    }
  };

  const addTopics = async () => {
    const lines = titles.split("\n").map((t) => t.trim()).filter(Boolean);
    if (lines.length === 0) {
      setMessage({ type: "error", text: "Type at least one topic (one per line)." });
      return;
    }
    try {
      setMessage(null);
      const data = await api("/syllabus/topics", {
        method: "POST",
        body: JSON.stringify({
          subject_id: selected.subject_id,
          unit_no: Number(unitNo) || 1,
          titles: lines,
        }),
      });
      setTitles("");
      setMessage({
        type: "ok",
        text:
          `${data.added} topic(s) added.` +
          (data.already_existed ? ` ${data.already_existed} already existed.` : ""),
      });
      await loadDetail(selected);
      await loadClasses(false);
    } catch (e) {
      setMessage({ type: "error", text: e.message });
    }
  };

  const deleteTopic = async (topic) => {
    if (!window.confirm(`Delete the topic "${topic.topic_title}"? Its progress is removed for every batch.`)) return;
    try {
      setMessage(null);
      await api(`/syllabus/topics/${topic.topic_id}`, { method: "DELETE" });
      await loadDetail(selected);
      await loadClasses(false);
    } catch (e) {
      setMessage({ type: "error", text: e.message });
    }
  };

  // group topics by unit
  const units = {};
  (detail?.topics || []).forEach((t) => {
    (units[t.unit_no] = units[t.unit_no] || []).push(t);
  });
  const unitKeys = Object.keys(units).sort((a, b) => Number(a) - Number(b));

  const isSelected = (c) =>
    selected && selected.subject_id === c.subject_id && selected.batch_id === c.batch_id;

  return (
    <div style={S.page}>
      <h1 style={S.h1}>Syllabus Tracker</h1>
      <p style={S.sub}>
        Tick the topics you taught today. You can update only the subjects the timetable gives you, for
        the batch you teach.
      </p>

      {message && (
        <div
          style={{
            padding: "10px 14px",
            marginBottom: 16,
            borderRadius: 8,
            fontSize: 14,
            background: message.type === "ok" ? C.okBg : C.badBg,
            color: message.type === "ok" ? C.ok : C.bad,
          }}
        >
          {message.text}
        </div>
      )}

      {loadingClasses ? (
        <p style={{ color: C.muted }}>Loading your classes…</p>
      ) : classes.length === 0 ? (
        <div style={S.card}>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>No classes found</div>
          <p style={{ margin: 0, fontSize: 14, color: C.muted }}>
            The timetable has no classes assigned to you yet. Once the admin generates the timetable,
            your subjects and batches appear here.
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "flex-start" }}>
          {/* ── my classes ── */}
          <div style={{ flex: "0 0 290px", maxWidth: "100%" }}>
            <div style={{ ...S.label, marginBottom: 10 }}>My classes</div>
            {classes.map((c) => (
              <button
                key={`${c.subject_id}-${c.batch_id}`}
                onClick={() => setSelected({ subject_id: c.subject_id, batch_id: c.batch_id })}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: "14px 16px",
                  marginBottom: 10,
                  background: isSelected(c) ? C.accentBg : C.surface,
                  border: `1px solid ${isSelected(c) ? C.accent : C.border}`,
                  borderRadius: 10,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                <div style={{ fontWeight: 600, fontSize: 14, color: C.text }}>{c.subject_name}</div>
                <div style={{ fontSize: 12, color: C.muted, margin: "2px 0 8px" }}>
                  {c.batch_name} · Sem {c.semester}
                </div>
                <ProgressBar percent={c.percent} height={7} />
                <div style={{ fontSize: 12, color: C.muted, marginTop: 6 }}>
                  {c.total === 0 ? "No topics added yet" : `${c.covered}/${c.total} topics · ${c.percent}%`}
                </div>
              </button>
            ))}
          </div>

          {/* ── selected class ── */}
          <div style={{ flex: "1 1 460px", minWidth: 0 }}>
            {loadingDetail && !detail ? (
              <p style={{ color: C.muted }}>Loading syllabus…</p>
            ) : !detail ? null : (
              <>
                <div style={{ ...S.card, display: "flex", gap: 24, alignItems: "center", flexWrap: "wrap" }}>
                  <ProgressRing percent={detail.summary.percent} size={110} sub="covered" />
                  <div style={{ flex: 1, minWidth: 220 }}>
                    <div style={{ fontSize: 20, fontWeight: 700 }}>{detail.subject.subject_name}</div>
                    <div style={{ fontSize: 14, color: C.muted, marginBottom: 12 }}>
                      {detail.batch.batch_name} · Semester {detail.batch.semester}
                    </div>
                    <div style={{ display: "flex", gap: 24, fontSize: 14 }}>
                      <span>
                        <b>{detail.summary.covered}</b> covered
                      </span>
                      <span>
                        <b>{detail.summary.remaining}</b> remaining
                      </span>
                      <span>
                        <b>{detail.summary.total}</b> total
                      </span>
                    </div>
                  </div>
                </div>

                {/* topics */}
                <div style={S.card}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      flexWrap: "wrap",
                      gap: 10,
                      marginBottom: 14,
                    }}
                  >
                    <div style={S.label}>Topics</div>
                    <label style={{ fontSize: 13, color: C.muted }}>
                      Taught on{" "}
                      <input
                        type="date"
                        value={coveredOn}
                        max={todayISODate()}
                        onChange={(e) => setCoveredOn(e.target.value || todayISODate())}
                        style={{ ...S.input, padding: "6px 10px" }}
                      />
                    </label>
                  </div>

                  {detail.topics.length === 0 ? (
                    <p style={{ margin: 0, fontSize: 14, color: C.muted }}>
                      No topics yet. Add the syllabus topics below, then tick them as you teach.
                    </p>
                  ) : (
                    unitKeys.map((u) => (
                      <div key={u} style={{ marginBottom: 14 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: C.accent, marginBottom: 6 }}>
                          Unit {u}
                        </div>
                        {units[u].map((t) => (
                          <div
                            key={t.topic_id}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 12,
                              padding: "10px 12px",
                              marginBottom: 6,
                              background: t.covered ? "#f0fdf4" : C.faint,
                              borderRadius: 8,
                              opacity: busyTopic === t.topic_id ? 0.6 : 1,
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={t.covered}
                              disabled={busyTopic === t.topic_id}
                              onChange={() => toggleTopic(t)}
                              style={{ width: 18, height: 18, cursor: "pointer", accentColor: "#16a34a" }}
                            />
                            <div style={{ flex: 1, fontSize: 14 }}>
                              <span
                                style={{
                                  textDecoration: t.covered ? "line-through" : "none",
                                  color: t.covered ? C.muted : C.text,
                                }}
                              >
                                {t.topic_title}
                              </span>
                              {t.covered && t.covered_on && (
                                <span style={{ marginLeft: 8, fontSize: 12, color: "#16a34a" }}>
                                  ✓ {t.covered_on}
                                </span>
                              )}
                            </div>
                            <button
                              onClick={() => deleteTopic(t)}
                              title="Delete topic"
                              style={{
                                border: "none",
                                background: "transparent",
                                color: "#94a3b8",
                                fontSize: 18,
                                cursor: "pointer",
                              }}
                            >
                              ×
                            </button>
                          </div>
                        ))}
                      </div>
                    ))
                  )}
                </div>

                {/* add topics */}
                <div style={S.card}>
                  <div style={{ ...S.label, marginBottom: 10 }}>Add topics</div>
                  <p style={{ margin: "0 0 12px", fontSize: 13, color: C.muted }}>
                    Type one topic per line. Topics belong to the subject, so every batch of this subject
                    sees the same list — but progress is tracked for each batch separately.
                  </p>
                  <div style={{ display: "flex", gap: 10, marginBottom: 10, alignItems: "center" }}>
                    <label style={{ fontSize: 13, color: C.muted }}>
                      Unit{" "}
                      <input
                        type="number"
                        min="1"
                        max="50"
                        value={unitNo}
                        onChange={(e) => setUnitNo(e.target.value)}
                        style={{ ...S.input, width: 70, marginLeft: 4 }}
                      />
                    </label>
                  </div>
                  <textarea
                    rows="5"
                    placeholder={"Introduction to DBMS\nER Diagram\nNormalization"}
                    value={titles}
                    onChange={(e) => setTitles(e.target.value)}
                    style={{ ...S.input, width: "100%", resize: "vertical" }}
                  />
                  <button onClick={addTopics} style={{ ...S.btnPrimary, marginTop: 10 }}>
                    ➕ Add topics
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}