import { useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { API_BASE as API_URL } from "../services/api";

const MAX_MB = 5;

// make pasted http/https links clickable (everything else stays plain text)
function linkify(text) {
  return String(text).split(/(https?:\/\/[^\s<]+)/g).map((part, i) =>
    i % 2 === 1 ? (
      <a key={i} href={part} target="_blank" rel="noopener noreferrer">{part}</a>
    ) : (
      part
    )
  );
}

// the image needs the login token, so it is fetched as a blob
function NoticeImage({ id }) {
  const [src, setSrc] = useState(null);

  useEffect(() => {
    let url;
    let cancelled = false;
    fetch(`${API_URL}/notices/${id}/image`)
      .then((r) => (r.ok ? r.blob() : null))
      .then((b) => {
        if (b && !cancelled) {
          url = URL.createObjectURL(b);
          setSrc(url);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [id]);

  if (!src) return null;
  return (
    <img className="notice-img" src={src} alt="Notice attachment"
      onClick={() => window.open(src, "_blank")} />
  );
}

/**
 * <NoticeBoard canPost />          teacher page (write + delete own)
 * <NoticeBoard limit={3} />        admin / student dashboard (read only)
 */
export default function NoticeBoard({ canPost = false, limit = null }) {
  const { user } = useAuth();
  const [notices, setNotices] = useState(null);
  const [error, setError] = useState("");
  const [showAll, setShowAll] = useState(false);

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [image, setImage] = useState(null);
  const [fileKey, setFileKey] = useState(0);
  const [posting, setPosting] = useState(false);
  const [formError, setFormError] = useState("");

  const load = async () => {
    try {
      const res = await fetch(`${API_URL}/notices`);
      if (!res.ok) throw new Error("Could not load notices.");
      setNotices(await res.json());
      setError("");
    } catch (e) {
      setError(e.message);
      setNotices([]);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const pickImage = (e) => {
    const f = e.target.files[0] || null;
    setFormError("");
    if (f && f.size > MAX_MB * 1024 * 1024) {
      setFormError(`Image is larger than ${MAX_MB} MB.`);
      setImage(null);
      setFileKey((k) => k + 1);
      return;
    }
    setImage(f);
  };

  const post = async (e) => {
    e.preventDefault();
    setFormError("");
    if (!title.trim() || !body.trim()) {
      setFormError("Please write a title and the notice text.");
      return;
    }
    try {
      setPosting(true);
      const fd = new FormData();
      fd.append("title", title.trim());
      fd.append("body", body.trim());
      if (image) fd.append("image", image);

      const res = await fetch(`${API_URL}/notices`, { method: "POST", body: fd });
      let data = null;
      try { data = await res.json(); } catch { /* no body */ }
      if (!res.ok) throw new Error(typeof data?.detail === "string" ? data.detail : "Could not post the notice.");

      setTitle("");
      setBody("");
      setImage(null);
      setFileKey((k) => k + 1);
      alert("Notice posted successfully");
      await load();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setPosting(false);
    }
  };

  const remove = async (id) => {
    if (!window.confirm("Delete this notice?")) return;
    try {
      const res = await fetch(`${API_URL}/notices/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Could not delete the notice.");
      await load();
    } catch (err) {
      alert(err.message);
    }
  };

  const when = (s) =>
    s ? new Date(s.replace(" ", "T")).toLocaleString("en-IN", {
      day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit",
    }) : "";

  const list = notices || [];
  const shown = limit && !showAll ? list.slice(0, limit) : list;

  return (
    <section className={canPost ? "notice-page" : "notice-section"}>
      <div className="notice-head">
        <h2>📌 Notice Board</h2>
        {!canPost && <span className="notice-sub">Posted by teachers</span>}
      </div>

      {canPost && (
        <form onSubmit={post} className="notice-form">
          <h3>Write a notice for students</h3>
          {formError && <div className="auth-error">{formError}</div>}
          <input type="text" placeholder="Title" maxLength={200}
            value={title} onChange={(e) => setTitle(e.target.value)} />
          <textarea rows={5} maxLength={5000}
            placeholder="Write the notice here. You can paste links (https://...), they become clickable."
            value={body} onChange={(e) => setBody(e.target.value)} />
          <label className="notice-file">
            Photo (optional, JPG/PNG/WEBP/GIF, max {MAX_MB} MB)
            <input key={fileKey} type="file" accept="image/png,image/jpeg,image/webp,image/gif"
              onChange={pickImage} />
          </label>
          <button type="submit" disabled={posting}>{posting ? "Posting…" : "Post notice"}</button>
        </form>
      )}

      {notices === null ? (
        <p className="notice-empty">Loading notices…</p>
      ) : error ? (
        <p className="notice-empty" style={{ color: "var(--danger)" }}>{error}</p>
      ) : list.length === 0 ? (
        <p className="notice-empty">No notices yet.</p>
      ) : (
        <div className="notice-grid">
          {shown.map((n) => (
            <article key={n.notice_id} className="notice-card">
              <h3>{n.title}</h3>
              <div className="notice-meta">
                {n.teacher_name || "Teacher"} · {when(n.created_at)}
              </div>
              <p className="notice-body">{linkify(n.body)}</p>
              {n.has_image && <NoticeImage id={n.notice_id} />}
              {canPost && n.teacher_id === user?.teacher_id && (
                <button className="notice-del" onClick={() => remove(n.notice_id)}>Delete</button>
              )}
            </article>
          ))}
        </div>
      )}

      {limit && list.length > limit && (
        <button className="notice-more" onClick={() => setShowAll((s) => !s)}>
          {showAll ? "Show fewer" : `Show all ${list.length} notices`}
        </button>
      )}
    </section>
  );
}