import LoginForm from "./LoginForm";

function StudentLogin() {
  return (
    <LoginForm
      roleLabel="Student"
      expectedRole="student"
      redirectTo="/student/dashboard"
      signupPath="/student/signup"
    />
  );
}

export default StudentLogin;