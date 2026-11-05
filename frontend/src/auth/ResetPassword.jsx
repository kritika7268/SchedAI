import { useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import AuthShell from "./AuthShell";
import { API_BASE as API_URL } from "../services/api";

export default function ResetPassword() {
  const { role: routeRole } = useParams();
  const location = useLocation();
  const navigate = useNavigate();

  const rawRole = routeRole || window.location.pathname.split("/")[1];
  const role = ["admin", "teacher", "student"].includes(rawRole) ? rawRole : "student";
  const roleName = role.charAt(0).toUpperCase() + role.slice(1);
  const loginPath = `/${role}/login`;
  const forgotPath = `/${role}/forgot-password`;

  const [email, setEmail] = useState(location.state?.email || "");
  const [otp, setOtp] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage("");
    setError("");

    const trimmedEmail = email.trim().toLowerCase();

    if (!trimmedEmail || !otp || !password || !confirmPassword)
      return setError("Please fill in all fields.");
    if (!/^\d{6}$/.test(otp)) return setError("Please enter a valid 6-digit OTP.");
    if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password))
      return setError("Password must be 8+ characters with letters and numbers.");
    if (password !== confirmPassword) return setError("Passwords do not match.");

    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmedEmail, otp, new_password: password }),
      });

      let data = null;
      try {
        data = await response.json();
      } catch {
        /* no body */
      }

      if (!response.ok) {
        const detail =
          typeof data?.detail === "string"
            ? data.detail
            : Array.isArray(data?.detail)
            ? data.detail.map((d) => d.msg).join(", ")
            : "Unable to reset password. Check your OTP and try again.";
        throw new Error(detail);
      }

      setDone(true);
      setMessage(data?.message || "Password reset successfully!");
      setOtp("");
      setPassword("");
      setConfirmPassword("");
      setTimeout(() => navigate(loginPath), 2000);
    } catch (err) {
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title="Reset Password"
      subtitle={`${roleName} account · Enter the 6-digit OTP sent to your email and choose a new password.`}
    >
      {message && <div className="auth-success">✓ {message} Redirecting to login…</div>}
      {error && <div className="auth-error">{error}</div>}

      <form onSubmit={handleSubmit} className="auth-form">
        <label className="auth-field">
          Registered email
          <input
            type="email"
            autoComplete="email"
            disabled={loading || done}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>

        <label className="auth-field">
          6-digit OTP
          <input
            type="text"
            inputMode="numeric"
            maxLength={6}
            autoComplete="one-time-code"
            placeholder="······"
            className="auth-otp"
            disabled={loading || done}
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
          />
        </label>

        <label className="auth-field">
          New password
          <input
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            placeholder="8+ characters, letters and numbers"
            disabled={loading || done}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>

        <label className="auth-field">
          Confirm new password
          <input
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            disabled={loading || done}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
        </label>

        <label className="auth-check">
          <input
            type="checkbox"
            checked={showPassword}
            onChange={(e) => setShowPassword(e.target.checked)}
          />
          Show passwords
        </label>

        <button type="submit" disabled={loading || done} className="auth-btn">
          {loading ? "Resetting..." : done ? "Done ✓" : "Reset Password"}
        </button>
      </form>

      <p className="auth-alt">
        <Link to={forgotPath}>Didn't get the OTP? Send again</Link>
      </p>
      <p className="auth-home">
        <Link to={loginPath}>← Back to {roleName} Login</Link>
      </p>
    </AuthShell>
  );
}