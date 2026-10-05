import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "./AuthContext";

const API_URL = "http://127.0.0.1:8000";

// roleLabel: "Admin" | "Teacher" | "Student"
// expectedRole: "admin" | "teacher" | "student"
// redirectTo: where to send the user after a successful login
// signupPath: where the "Sign up" link should point
function LoginForm({ roleLabel, expectedRole, redirectTo, signupPath }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!email.trim() || !password) {
      alert("Please enter email and password");
      return;
    }

    try {
      setLoading(true);

      // "role" tells the server which login page this is, so a teacher
      // cannot log in through the admin page (and so on).
      const response = await fetch(`${API_URL}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          password,
          role: expectedRole,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        alert(typeof data.detail === "string" ? data.detail : "Login failed");
        return;
      }

      // safety net (the server already checks this)
      if (data.role !== expectedRole) {
        alert(
          `This is not a ${roleLabel} account. Please use the correct login page.`
        );
        return;
      }

      login(data);
      navigate(redirectTo);
    } catch (error) {
      console.error("Login error:", error);
      alert("Server error while logging in");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#f6f8fc",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "380px",
          margin: "20px",
          padding: "36px 32px",
          background: "white",
          border: "1px solid #e5e7eb",
          borderRadius: "14px",
          boxShadow: "0 4px 14px rgba(15, 23, 42, 0.06)",
        }}
      >
        <h1 style={{ marginTop: 0, marginBottom: "24px", fontSize: "24px" }}>
          {roleLabel} Login
        </h1>

        <form
          onSubmit={handleSubmit}
          style={{ display: "flex", flexDirection: "column", gap: "14px" }}
        >
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{ padding: "10px" }}
          />

          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{ padding: "10px" }}
          />

          <button type="submit" disabled={loading} style={{ padding: "10px" }}>
            {loading ? "Logging in..." : "Login"}
          </button>
        </form>

        <p style={{ marginTop: "20px", fontSize: "14px", textAlign: "center" }}>
          Don't have an account?{" "}
          <Link to={signupPath} style={{ color: "#1e293b", fontWeight: "600" }}>
            Sign up
          </Link>
        </p>

        <p style={{ marginTop: "10px", fontSize: "14px", textAlign: "center" }}>
          <Link to="/" style={{ color: "#6b7280" }}>
            ← Back to home
          </Link>
        </p>
      </div>
    </div>
  );
}

export default LoginForm;