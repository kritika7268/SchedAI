import SignupForm from "./SignupForm";

function StudentSignup() {
  return (
    <SignupForm roleLabel="Student" role="student" loginPath="/student/login" />
  );
}

export default StudentSignup;