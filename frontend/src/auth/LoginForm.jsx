import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "./AuthContext";
import AuthShell from "./AuthShell";
import { API_BASE as API_URL } from "../services/api";

// roleLabel: "Admin" | "Teacher" | "Student"
function LoginForm({ roleLabel, expectedRole, redirectTo, signupPath }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const { login } = useAuth();
  const navigate = useNavigate();

  const forgotPasswordPath = `/${expectedRole}/forgot-password`;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!email.trim() || !password) {
      setError("Please enter email and password");
      return;
    }

    try {
      setLoading(true);
      const response = await fetch(`${API_URL}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password, role: expectedRole }),
      });
      const data = await response.json();

      if (!response.ok) {
        setError(typeof data.detail === "string" ? data.detail : "Login failed");
        return;
      }
      if (data.role !== expectedRole) {
        setError(`This is not a ${roleLabel} account. Please use the correct login page.`);
        return;
      }

      login(data);
      navigate(redirectTo);
    } catch (err) {
      console.error("Login error:", err);
      setError("Server error while logging in");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell title={`${roleLabel} Login`} subtitle="Sign in to continue to your portal.">
      {error && <div className="auth-error">{error}</div>}

      <form onSubmit={handleSubmit} className="auth-form">
        <label className="auth-field">
          Email
          <input
            type="email"
            placeholder="you@college.edu"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>

        <label className="auth-field">
          Password
          <input
            type="password"
            placeholder="Your password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>

        <div className="auth-row">
          <Link to={forgotPasswordPath}>Forgot password?</Link>
        </div>

        <button type="submit" disabled={loading} className="auth-btn">
          {loading ? "Logging in..." : "Login"}
        </button>
      </form>

      <p className="auth-alt">
        Don't have an account? <Link to={signupPath}>Sign up</Link>
      </p>
    </AuthShell>
  );
}

export default LoginForm;