import SignupForm from "./SignupForm";

function AdminSignup() {
  return (
    <SignupForm roleLabel="Admin" role="admin" loginPath="/admin/login" />
  );
}

export default AdminSignup;