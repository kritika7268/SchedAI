"""SchedAI - security.py : login + role check + rate limit, ek jagah."""
import time
from collections import defaultdict, deque

from fastapi import HTTPException
from starlette.requests import HTTPConnection

from app.auth import get_current_user

PUBLIC = {
    ("GET", "/"), ("GET", "/health"),
    ("POST", "/login"), ("POST", "/signup"), ("GET", "/signup/teachers"),
    ("POST", "/forgot-password"), ("POST", "/reset-password"),
    ("GET", "/holidays/notifications"),
}
DOC_PATHS = ("/docs", "/redoc", "/openapi.json")   # deploy par hata dena

WRITE = {"POST", "PUT", "PATCH", "DELETE"}
ADMIN_WRITE = ("/departments", "/teachers", "/subjects", "/rooms", "/students",
               "/batches", "/timetables", "/syllabus-progress", "/holidays",
               "/events", "/substitutions", "/generate-timetable", "/teacher-absences")
ADMIN_ANY = ("/admin", "/teacher-workload", "/students/bulk-import")
TEACHER_OWN = {("POST", "/auto-substitute"), ("POST", "/teacher-absences")}

# (max requests, seconds) per IP
LIMITS = {
    ("POST", "/login"): (10, 60),
    ("POST", "/forgot-password"): (5, 600),
    ("POST", "/reset-password"): (10, 600),
    ("POST", "/signup"): (10, 600),
}
_hits = defaultdict(deque)


def _under(path, prefix):
    return path == prefix or path.startswith(prefix + "/")


def _rate_limit(conn, key):
    maximum, window = LIMITS[key]
    ip = conn.client.host if conn.client else "unknown"
    q = _hits[(ip, key)]
    now = time.time()
    while q and now - q[0] > window:
        q.popleft()
    if len(q) >= maximum:
        raise HTTPException(429, "Too many attempts. Please wait and try again.")
    q.append(now)


def api_gate(conn: HTTPConnection):
    if conn.scope["type"] != "http":
        return                                     # websocket ka check main.py me
    method = conn.scope["method"]
    path = conn.url.path.rstrip("/") or "/"
    if method == "OPTIONS":
        return
    if (method, path) in LIMITS:
        _rate_limit(conn, (method, path))
    if (method, path) in PUBLIC or path in DOC_PATHS:
        return

    auth = conn.headers.get("authorization", "")
    if not auth.lower().startswith("bearer "):
        raise HTTPException(401, "Login required", headers={"WWW-Authenticate": "Bearer"})
    user = get_current_user(auth[7:].strip())
    role = user["role"]

    if (method, path) in TEACHER_OWN:
        if role == "admin":
            return
        if role == "teacher" and str(conn.query_params.get("teacher_id")) == str(user.get("teacher_id")):
            return
        raise HTTPException(403, "You can only do this for yourself")

    if any(_under(path, p) for p in ADMIN_ANY) or \
       (method in WRITE and any(_under(path, p) for p in ADMIN_WRITE)):
        if role != "admin":
            raise HTTPException(403, "Admin only")
    # baaki (notes, pyqs, exams, syllabus, project-guides, ai) me apne role checks pehle se hain