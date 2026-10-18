import { useEffect, useRef, useState } from "react";
import { useAuth } from "../auth/AuthContext";

const API_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";
const ACCENT = "#7c3aed";

const SUGGESTIONS = [
  "Show today's timetable",
  "What is my next class?",
  "Who is my project guide?",
  "What is my syllabus progress?",
  "Any holiday coming up?",
];

const GREETING = {
  role: "assistant",
  content:
    "Hi! I'm SchedAI Assistant 👋 Ask me about your timetable, next class, project guide, syllabus progress or holidays.",
};

/**
 * Floating AI chat for the STUDENT portal.
 * Mount once inside RoleLayout:  {role === "student" && <StudentChatbot />}
 */
export default function StudentChatbot() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([GREETING]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading, open]);

  const send = async (text) => {
    const question = (text ?? input).trim();
    if (!question || loading) return;

    const history = messages.slice(1).map((m) => ({ role: m.role, content: m.content }));
    setMessages((m) => [...m, { role: "user", content: question }]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch(`${API_URL}/ai-assistant/student/chat`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${user?.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ message: question, history }),
      });

      let data = null;
      try { data = await res.json(); } catch (e) { /* no body */ }

      if (!res.ok) {
        const msg =
          res.status === 401 ? "Your session has expired. Please log in again."
          : res.status === 429 ? "You're sending messages too fast. Please wait a minute."
          : typeof data?.detail === "string" ? data.detail
          : "Something went wrong. Please try again.";
        throw new Error(msg);
      }
      setMessages((m) => [...m, { role: "assistant", content: data.reply }]);
    } catch (e) {
      setMessages((m) => [
        ...m,
        { role: "assistant", content: `⚠️ ${e.message || "Could not reach the server."}`, error: true },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {open && (
        <div
          style={{
            position: "fixed", right: 20, bottom: 90, zIndex: 1000,
            width: "min(380px, calc(100vw - 32px))", height: "min(560px, calc(100vh - 130px))",
            display: "flex", flexDirection: "column", overflow: "hidden",
            background: "#fff", border: "1px solid #e8eaed", borderRadius: 14,
            boxShadow: "0 12px 40px rgba(15,23,42,0.22)",
            fontFamily: "'Inter',system-ui,sans-serif",
          }}
        >
          {/* header */}
          <div
            style={{
              background: ACCENT, color: "#fff", padding: "14px 16px",
              display: "flex", justifyContent: "space-between", alignItems: "center",
            }}
          >
            <div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>🤖 SchedAI Assistant</div>
              <div style={{ fontSize: 11, opacity: 0.85, marginTop: 2 }}>
                Answers from your real academic data
              </div>
            </div>
            <button
              onClick={() => setOpen(false)}
              aria-label="Close chat"
              style={{ background: "transparent", border: "none", color: "#fff", fontSize: 22, cursor: "pointer" }}
            >
              ×
            </button>
          </div>

          {/* messages */}
          <div style={{ flex: 1, overflowY: "auto", padding: 14, background: "#f8f9fb" }}>
            {messages.map((m, i) => (
              <div
                key={i}
                style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start", marginBottom: 10 }}
              >
                <div
                  style={{
                    maxWidth: "85%", padding: "9px 13px", borderRadius: 12, fontSize: 14, lineHeight: 1.5,
                    whiteSpace: "pre-wrap", wordBreak: "break-word",
                    background: m.role === "user" ? ACCENT : m.error ? "#fee2e2" : "#fff",
                    color: m.role === "user" ? "#fff" : m.error ? "#991b1b" : "#0f172a",
                    border: m.role === "user" ? "none" : "1px solid #e8eaed",
                  }}
                >
                  {m.content}
                </div>
              </div>
            ))}

            {loading && <div style={{ fontSize: 13, color: "#64748b", margin: "4px 2px" }}>SchedAI is thinking…</div>}

            {messages.length === 1 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 6 }}>
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    style={{
                      padding: "6px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer",
                      background: "#fff", color: ACCENT, border: "1px solid #ddd6fe", borderRadius: 20,
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
            <div ref={endRef} />
          </div>

          {/* input */}
          <div style={{ display: "flex", gap: 8, padding: 10, borderTop: "1px solid #e8eaed", background: "#fff" }}>
            <input
              value={input}
              maxLength={500}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send()}
              placeholder="Ask about your classes…"
              style={{
                flex: 1, padding: "10px 12px", fontSize: 14, borderRadius: 8,
                border: "1px solid #d1d5db", outline: "none",
              }}
            />
            <button
              onClick={() => send()}
              disabled={loading || !input.trim()}
              style={{
                padding: "10px 16px", fontWeight: 600, fontSize: 14, color: "#fff", border: "none",
                borderRadius: 8, background: loading || !input.trim() ? "#a78bfa" : ACCENT,
                cursor: loading || !input.trim() ? "not-allowed" : "pointer",
              }}
            >
              Send
            </button>
          </div>
        </div>
      )}

      {/* floating button */}
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Open AI assistant"
        style={{
          position: "fixed", right: 20, bottom: 20, zIndex: 1000,
          width: 56, height: 56, borderRadius: "50%", border: "none",
          background: ACCENT, color: "#fff", fontSize: 26, cursor: "pointer",
          boxShadow: "0 6px 20px rgba(124,58,237,0.45)",
        }}
      >
        {open ? "×" : "💬"}
      </button>
    </>
  );
}