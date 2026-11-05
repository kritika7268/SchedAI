import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import AuthShell from "./AuthShell";
import { API_BASE as API_URL } from "../services/api";

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
  const [error, setError] = useState("");
  const navigate = useNavigate();

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
    setError("");

    if (!name.trim() || !email.trim() || !password) return setError("Please fill all fields");
    if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password))
      return setError("Password must be 8+ characters with letters and numbers");
    if (role === "teacher" && !teacherId) return setError("Please select your name from the list");
    if (role === "student" && !rollNumber.trim()) return setError("Please enter your roll number");
    if (role === "admin" && !adminCode.trim()) return setError("Please enter the admin access code");

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
        if (typeof data.detail === "string") message = data.detail;
        else if (Array.isArray(data.detail))
          message = data.detail.map((d) => d.msg || "Invalid input").join(", ");
        setError(message);
        return;
      }

      alert("Account created. Please log in.");
      navigate(loginPath);
    } catch (err) {
      console.error("Signup error:", err);
      setError("Server error while signing up");
    } finally {
      setLoading(false);
    }
  };

  const hint = {
    admin: "Admin accounts are limited. You need the admin access code.",
    teacher: "Choose your name and use the same email the admin registered for you.",
    student: "Use your roll number and the same email the admin registered for you.",
  }[role];

  return (
    <AuthShell title={`${roleLabel} Signup`} subtitle={hint}>
      {error && <div className="auth-error">{error}</div>}

      <form onSubmit={handleSubmit} className="auth-form">
        {role === "teacher" && (
          <label className="auth-field">
            Your name
            <select value={teacherId} onChange={(e) => setTeacherId(e.target.value)}>
              <option value="">Select your name</option>
              {teachers.map((t) => (
                <option key={t.teacher_id} value={t.teacher_id}>{t.teacher_name}</option>
              ))}
            </select>
          </label>
        )}

        {role === "student" && (
          <label className="auth-field">
            Roll number
            <input type="text" placeholder="e.g. BCA5028" value={rollNumber}
              onChange={(e) => setRollNumber(e.target.value)} />
          </label>
        )}

        <label className="auth-field">
          Full name
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} />
        </label>

        <label className="auth-field">
          Email
          <input type="email" autoComplete="email"
            placeholder={role === "admin" ? "you@college.edu" : "Email registered by admin"}
            value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>

        <label className="auth-field">
          Password
          <input type="password" autoComplete="new-password"
            placeholder="8+ characters, letters and numbers"
            value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>

        {role === "admin" && (
          <label className="auth-field">
            Admin access code
            <input type="password" value={adminCode} onChange={(e) => setAdminCode(e.target.value)} />
          </label>
        )}

        <button type="submit" disabled={loading} className="auth-btn">
          {loading ? "Creating account..." : "Sign Up"}
        </button>
      </form>

      <p className="auth-alt">
        Already have an account? <Link to={loginPath}>Login</Link>
      </p>
    </AuthShell>
  );
}

export default SignupForm;