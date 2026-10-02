import { Navigate } from "react-router-dom";
import { useAuth } from "./AuthContext";

// allowedRoles: array like ["admin"] or ["admin", "teacher"]
// loginPath: where to send the user if they're not logged in / wrong role
function ProtectedRoute({ children, allowedRoles, loginPath = "/" }) {
  const { user } = useAuth();

  if (!user) {
    return <Navigate to={loginPath} replace />;
  }

  if (!allowedRoles.includes(user.role)) {
    return <Navigate to={loginPath} replace />;
  }

  return children;
}

export default ProtectedRoute;