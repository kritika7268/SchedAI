import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";

const API_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

// role: "admin" | "teacher" | "student"
function SignupForm({ roleLabel, role, loginPath }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [teachers, setTeachers] = useState([]);
  const [rollNumber, setRollNumber] = useState("");
  const [teacherId, setTeacherId] = useState("");
  const [adminCode, setAdminCode] = useState("");

  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  // Teacher signup: only teachers the admin already added (and who have no
  // account yet) are listed — names only, no emails or phone numbers.
  useEffect(() => {
    if (role === "teacher") {
      fetch(`${API_URL}/signup/teachers`)
        .then((res) => res.json())
        .then(setTeachers)
        .catch((err) => console.error("Error fetching teachers:", err));
    }
  }, [role]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!name.trim() || !email.trim() || !password) {
      alert("Please fill all fields");
      return;
    }

    if (password.length < 8) {
      alert("Password must be at least 8 characters");
      return;
    }

    if (role === "teacher" && !teacherId) {
      alert("Please select your name from the list");
      return;
    }

    if (role === "student" && !rollNumber.trim()) {
      alert("Please enter your roll number");
      return;
    }

    if (role === "admin" && !adminCode.trim()) {
      alert("Please enter the admin access code");
      return;
    }

    try {
      setLoading(true);

      const payload = {
        name: name.trim(),
        email: email.trim(),
        password,
        role,
        teacher_id: role === "teacher" ? Number(teacherId) : null,
        roll_number: role === "student" ? rollNumber.trim() : null,
        admin_code: role === "admin" ? adminCode.trim() : null,
      };

      const response = await fetch(`${API_URL}/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        let message = "Signup failed";

        if (typeof data.detail === "string") {
          message = data.detail;
        } else if (Array.isArray(data.detail)) {
          message = data.detail.map((err) => err.msg || "Invalid input").join("\n");
        } else if (data.detail) {
          message = JSON.stringify(data.detail);
        }

        alert(message);
        return;
      }

      alert("Account created. Please log in.");
      navigate(loginPath);
    } catch (error) {
      console.error("Signup error:", error);
      alert("Server error while signing up");
    } finally {
      setLoading(false);
    }
  };

  const hint = {
    admin: "Admin accounts are limited. You need the admin access code.",
    teacher:
      "Choose your name and use the same email the admin registered for you.",
    student:
      "Use your roll number and the same email the admin registered for you.",
  }[role];

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
          maxWidth: "420px",
          margin: "20px",
          padding: "36px 32px",
          background: "white",
          border: "1px solid #e5e7eb",
          borderRadius: "14px",
          boxShadow: "0 4px 14px rgba(15, 23, 42, 0.06)",
        }}
      >
        <h1 style={{ marginTop: 0, marginBottom: "8px", fontSize: "24px" }}>
          {roleLabel} Signup
        </h1>

        <p style={{ margin: "0 0 20px", fontSize: "13px", color: "#6b7280" }}>
          {hint}
        </p>

        <form
          onSubmit={handleSubmit}
          style={{ display: "flex", flexDirection: "column", gap: "14px" }}
        >
          {role === "teacher" && (
            <select
              value={teacherId}
              onChange={(e) => setTeacherId(e.target.value)}
              style={{ padding: "10px" }}
            >
              <option value="">Select your name</option>
              {teachers.map((t) => (
                <option key={t.teacher_id} value={t.teacher_id}>
                  {t.teacher_name}
                </option>
              ))}
            </select>
          )}

          {role === "student" && (
            <input
              type="text"
              placeholder="Roll Number (e.g. BCA5028)"
              value={rollNumber}
              onChange={(e) => setRollNumber(e.target.value)}
              style={{ padding: "10px" }}
            />
          )}

          <input
            type="text"
            placeholder="Full name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{ padding: "10px" }}
          />

          <input
            type="email"
            placeholder={
              role === "admin" ? "Email" : "Email (the one registered by admin)"
            }
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{ padding: "10px" }}
          />

          <input
            type="password"
            placeholder="Password (min 8 characters)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{ padding: "10px" }}
          />

          {role === "admin" && (
            <input
              type="password"
              placeholder="Admin access code"
              value={adminCode}
              onChange={(e) => setAdminCode(e.target.value)}
              style={{ padding: "10px" }}
            />
          )}

          <button type="submit" disabled={loading} style={{ padding: "10px" }}>
            {loading ? "Creating account..." : "Sign Up"}
          </button>
        </form>

        <p style={{ marginTop: "20px", fontSize: "14px", textAlign: "center" }}>
          Already have an account?{" "}
          <Link to={loginPath} style={{ color: "#1e293b", fontWeight: "600" }}>
            Login
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

export default SignupForm;