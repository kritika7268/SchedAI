import { useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";

const API_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

const inputStyle = {
  width: "100%",
  boxSizing: "border-box",
  padding: "11px 12px",
  border: "1px solid #d1d5db",
  borderRadius: "8px",
  fontSize: "14px",
  outline: "none",
};

const labelStyle = {
  display: "block",
  marginBottom: "7px",
  fontSize: "14px",
  fontWeight: 600,
  color: "#374151",
};

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

    if (!trimmedEmail || !otp || !password || !confirmPassword) {
      setError("Please fill in all fields.");
      return;
    }
    if (!/^\d{6}$/.test(otp)) {
      setError("Please enter a valid 6-digit OTP.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: trimmedEmail,
          otp: otp,
          new_password: password,
        }),
      });

      let data = null;
      try {
        data = await response.json();
      } catch (e) {
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

      // send the user to the login page automatically
      setTimeout(() => navigate(loginPath), 2000);
    } catch (err) {
      setError(err.message || "Something went wrong. Please try again.");
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
        padding: "24px",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "430px",
          background: "#ffffff",
          border: "1px solid #e5e7eb",
          borderRadius: "16px",
          padding: "36px",
          boxShadow: "0 8px 30px rgba(15, 23, 42, 0.08)",
        }}
      >
        <div style={{ textAlign: "center", marginBottom: "26px" }}>
          <div style={{ fontSize: "34px", marginBottom: "6px" }}>🔑</div>
          <h1 style={{ margin: "0 0 8px", fontSize: "26px", color: "#111827" }}>
            Reset Password
          </h1>
          <p style={{ margin: 0, color: "#6b7280", fontSize: "14px", lineHeight: 1.6 }}>
            {roleName} account · Enter the 6-digit OTP sent to your email and choose a new password.
          </p>
        </div>

        {message && (
          <div
            style={{
              marginBottom: "18px",
              padding: "12px 14px",
              borderRadius: "8px",
              background: "#ecfdf5",
              border: "1px solid #a7f3d0",
              color: "#047857",
              fontSize: "14px",
            }}
          >
            ✓ {message} Redirecting to login…
          </div>
        )}

        {error && (
          <div
            style={{
              marginBottom: "18px",
              padding: "12px 14px",
              borderRadius: "8px",
              background: "#fef2f2",
              border: "1px solid #fecaca",
              color: "#b91c1c",
              fontSize: "14px",
            }}
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div>
            <label style={labelStyle}>Registered Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your registered email"
              autoComplete="email"
              disabled={loading || done}
              style={inputStyle}
            />
          </div>

          <div>
            <label style={labelStyle}>6-digit OTP</label>
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="······"
              autoComplete="one-time-code"
              disabled={loading || done}
              style={{
                ...inputStyle,
                textAlign: "center",
                letterSpacing: "10px",
                fontSize: "20px",
                fontWeight: 600,
              }}
            />
          </div>

          <div>
            <label style={labelStyle}>New Password</label>
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              autoComplete="new-password"
              disabled={loading || done}
              style={inputStyle}
            />
          </div>

          <div>
            <label style={labelStyle}>Confirm New Password</label>
            <input
              type={showPassword ? "text" : "password"}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-enter new password"
              autoComplete="new-password"
              disabled={loading || done}
              style={inputStyle}
            />
            {confirmPassword && password !== confirmPassword && (
              <div style={{ marginTop: 6, fontSize: 12, color: "#b91c1c" }}>Passwords do not match</div>
            )}
          </div>

          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#374151", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={showPassword}
              onChange={(e) => setShowPassword(e.target.checked)}
            />
            Show passwords
          </label>

          <button
            type="submit"
            disabled={loading || done}
            style={{
              width: "100%",
              padding: "12px",
              border: "none",
              borderRadius: "8px",
              background: loading || done ? "#94a3b8" : "#1e293b",
              color: "#ffffff",
              fontSize: "14px",
              fontWeight: 600,
              cursor: loading || done ? "not-allowed" : "pointer",
            }}
          >
            {loading ? "Resetting Password..." : done ? "Done ✓" : "Reset Password"}
          </button>
        </form>

        <div style={{ textAlign: "center", marginTop: "22px", fontSize: "14px" }}>
          <Link to={forgotPath} style={{ color: "#6b7280", textDecoration: "none" }}>
            Didn't get the OTP? Send again
          </Link>
          <div style={{ marginTop: 10 }}>
            <Link to={loginPath} style={{ color: "#1e293b", fontWeight: 600, textDecoration: "none" }}>
              ← Back to {roleName} Login
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}