import LoginForm from "./LoginForm";

function TeacherLogin() {
  return (
    <LoginForm
      roleLabel="Teacher"
      expectedRole="teacher"
      redirectTo="/teacher/dashboard"
      signupPath="/teacher/signup"
    />
  );
}

export default TeacherLogin;