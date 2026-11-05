import { useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import AuthShell from "./AuthShell";
import { API_BASE as API_URL } from "../services/api";

function ForgotPassword() {
  const { role: routeRole } = useParams();
  const navigate = useNavigate();

  const rawRole = routeRole || window.location.pathname.split("/")[1];
  const role = ["admin", "teacher", "student"].includes(rawRole) ? rawRole : "student";
  const roleName = role.charAt(0).toUpperCase() + role.slice(1);
  const loginPath = `/${role}/login`;

  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage("");
    setError("");

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setError("Please enter your email address.");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmedEmail }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.detail || "Unable to process your request.");
      }

      setMessage(
        data?.message ||
          "If an account exists with this email, a password reset OTP will be sent."
      );
      navigate(`/${role}/reset-password`, { state: { email: trimmedEmail } });
    } catch (err) {
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title="Forgot Password?"
      subtitle={`Enter your registered ${roleName.toLowerCase()} email and we'll send a 6-digit OTP.`}
    >
      {message && <div className="auth-success">{message}</div>}
      {error && <div className="auth-error">{error}</div>}

      <form onSubmit={handleSubmit} className="auth-form">
        <label className="auth-field">
          Email address
          <input
            type="email"
            placeholder="Your registered email"
            autoComplete="email"
            disabled={loading}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>

        <button type="submit" disabled={loading} className="auth-btn">
          {loading ? "Sending OTP..." : "Send OTP"}
        </button>
      </form>

      <p className="auth-alt">
        <Link to={loginPath}>← Back to {roleName} Login</Link>
      </p>
    </AuthShell>
  );
}

export default ForgotPassword;