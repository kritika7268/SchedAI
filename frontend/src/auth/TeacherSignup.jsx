import SignupForm from "./SignupForm";

function TeacherSignup() {
  return (
    <SignupForm roleLabel="Teacher" role="teacher" loginPath="/teacher/login" />
  );
}

export default TeacherSignup;