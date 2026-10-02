import LoginForm from "./LoginForm";

function AdminLogin() {
  return (
    <LoginForm
      roleLabel="Admin"
      expectedRole="admin"
      redirectTo="/admin/dashboard"
      signupPath="/admin/signup"
    />
  );
}

export default AdminLogin;