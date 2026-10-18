import { useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";

const API_URL =
  import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";


function ForgotPassword() {
  const { role: routeRole } = useParams();
  const navigate = useNavigate();

  const role = routeRole || window.location.pathname.split("/")[1];


  // Baaki existing code yahin rahega


const roleName =
    role === "admin"
    ? "Admin"
    : role === "teacher"
    ? "Teacher"
    : role === "student"
    ? "Student"
    : "User";

const loginPath =
    role === "admin"
    ? "/admin/login"
    : role === "teacher"
    ? "/teacher/login"
    : "/student/login";

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
        headers: {
        "Content-Type": "application/json",
        },
        body: JSON.stringify({
        email: trimmedEmail,
        }),
    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error(
        data?.detail || "Unable to process your request."
        );
    }

    setMessage(
        data?.message ||
            "If an account exists with this email, a password reset OTP will be sent."
    );

    
    navigate(`/${role}/reset-password`, {
        state: { email: trimmedEmail },
    });

    } catch (err) {
    setError(
        err.message ||
        "Something went wrong. Please try again."
    );
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
        <div style={{ textAlign: "center", marginBottom: "28px" }}>
        <h1
            style={{
            margin: "0 0 8px",
            fontSize: "28px",
            color: "#111827",
            }}
        >
            Forgot Password?
        </h1>

        <p
            style={{
            margin: 0,
            color: "#6b7280",
            fontSize: "14px",
            lineHeight: 1.6,
            }}
        >
            Enter your registered {roleName.toLowerCase()} email
address and we&apos;ll send you a 6-digit password reset OTP.
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
            lineHeight: 1.5,
            }}
        >
            {message}
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
            lineHeight: 1.5,
            }}
        >
            {error}
        </div>
        )}

        <form onSubmit={handleSubmit}>
        <label
            htmlFor="forgot-email"
            style={{
            display: "block",
            marginBottom: "7px",
            fontSize: "14px",
            fontWeight: 600,
            color: "#374151",
            }}
        >
            Email Address
        </label>

        <input
            id="forgot-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Enter your registered email"
            autoComplete="email"
            disabled={loading}
            style={{
            width: "100%",
            boxSizing: "border-box",
            padding: "11px 12px",
            border: "1px solid #d1d5db",
            borderRadius: "8px",
            fontSize: "14px",
            outline: "none",
            marginBottom: "18px",
            }}
        />

        <button
            type="submit"
            disabled={loading}
            style={{
            width: "100%",
            padding: "12px",
            border: "none",
            borderRadius: "8px",
            background: loading ? "#94a3b8" : "#1e293b",
            color: "#ffffff",
            fontSize: "14px",
            fontWeight: 600,
            cursor: loading ? "not-allowed" : "pointer",
            }}
        >
            {loading ? "Sending OTP..." : "Send OTP"}
        </button>
        </form>

        <div
        style={{
            textAlign: "center",
            marginTop: "22px",
        }}
        >
        <Link
            to={loginPath}
            style={{
            color: "#1e293b",
            fontSize: "14px",
            fontWeight: 600,
            textDecoration: "none",
            }}
        >
            ← Back to {roleName} Login
        </Link>
        </div>
    </div>
    </div>
);
}

export default ForgotPassword;