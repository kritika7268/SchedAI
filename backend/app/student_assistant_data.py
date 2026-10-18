"""
SchedAI - student_assistant_data.py

Builds the REAL data context for ONE student, straight from MySQL.
Only the logged-in student's own batch / guide / progress is fetched, so the
AI can never reveal another student's information.
"""

from datetime import datetime, timedelta

from app.database import get_db_connection

try:
    from zoneinfo import ZoneInfo
    IST = ZoneInfo("Asia/Kolkata")      # on Windows: pip install tzdata
except Exception:
    IST = None

DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]


def now_local():
    return datetime.now(IST) if IST else datetime.now()


def _secs(v):
    """mysql TIME comes back as timedelta -> seconds since midnight."""
    if isinstance(v, timedelta):
        return int(v.total_seconds())
    p = str(v).split(":")
    return int(p[0]) * 3600 + int(p[1]) * 60


def _fmt(v):
    if v is None:
        return None
    s = _secs(v)
    h, m = (s // 3600) % 24, (s % 3600) // 60
    return f"{h % 12 or 12}:{m:02d} {'AM' if h < 12 else 'PM'}"


def build_student_context(user: dict) -> dict:
    student_id = user.get("student_id")
    if not student_id:
        return {"error": "This account is not linked to a student record."}

    now = now_local()
    today = now.date()
    weekday = DAYS[today.weekday()]
    now_secs = now.hour * 3600 + now.minute * 60

    conn = get_db_connection()
    cur = conn.cursor(dictionary=True)
    try:
        # ---- student + own batch ------------------------------------------
        cur.execute(
            """SELECT s.student_name, s.roll_number, s.semester,
                      b.batch_id, b.batch_name, b.section, d.department_name
               FROM students s
               LEFT JOIN batches b ON s.batch_id = b.batch_id
               LEFT JOIN departments d ON s.department_id = d.department_id
               WHERE s.student_id = %s""", (student_id,))
        me = cur.fetchone()
        if not me:
            return {"error": "Student record not found."}
        batch_id = me["batch_id"]

        ctx = {
            "current_date_time": now.strftime("%A, %d %B %Y, %I:%M %p"),
            "student": {
                "name": me["student_name"], "roll_number": me["roll_number"],
                "department": me["department_name"], "batch": me["batch_name"],
                "section": me["section"], "semester": me["semester"],
            },
        }
        if not batch_id:
            ctx["note"] = "Student is not assigned to a batch yet."
            return ctx

        # ---- published timetable of this batch ----------------------------
        cur.execute(
            """SELECT t.timetable_id, t.day_of_week, t.start_time, t.end_time,
                      s.subject_name, s.subject_code, te.teacher_name, r.room_name
               FROM timetables t
               JOIN subjects s  ON t.subject_id = s.subject_id
               JOIN teachers te ON t.teacher_id = te.teacher_id
               JOIN rooms r     ON t.room_id = r.room_id
               WHERE t.batch_id = %s AND t.status = 'published'
               ORDER BY FIELD(t.day_of_week,'Monday','Tuesday','Wednesday',
                              'Thursday','Friday','Saturday'), t.start_time""",
            (batch_id,))
        rows = cur.fetchall()

        # ---- today's approved/auto substitutions --------------------------
        cur.execute(
            """SELECT sub.timetable_id, sub_t.teacher_name AS substitute_teacher,
                      abs_t.teacher_name AS absent_teacher
               FROM substitutions sub
               JOIN teacher_absences a ON sub.absence_id = a.absence_id
               JOIN teachers abs_t ON a.teacher_id = abs_t.teacher_id
               JOIN teachers sub_t ON sub.substitute_teacher_id = sub_t.teacher_id
               WHERE sub.substitution_date = %s
                 AND COALESCE(sub.status, '') <> 'cancelled'""", (today,))
        subs = {r["timetable_id"]: r for r in cur.fetchall()}

        weekly = {d: [] for d in DAYS[:5]}
        today_list = []
        for r in rows:
            if r["day_of_week"] in weekly:
                weekly[r["day_of_week"]].append({
                    "time": f"{_fmt(r['start_time'])} - {_fmt(r['end_time'])}",
                    "subject": r["subject_name"], "teacher": r["teacher_name"],
                    "room": r["room_name"]})
            if r["day_of_week"] == weekday:
                s, e = _secs(r["start_time"]), _secs(r["end_time"])
                item = {
                    "time": f"{_fmt(r['start_time'])} - {_fmt(r['end_time'])}",
                    "subject": r["subject_name"], "subject_code": r["subject_code"],
                    "teacher": r["teacher_name"], "room": r["room_name"],
                    "status": "finished" if now_secs >= e else
                              "ongoing now" if s <= now_secs else "upcoming",
                    "_start": s,
                }
                sub = subs.get(r["timetable_id"])
                if sub:
                    item["teacher"] = sub["substitute_teacher"]
                    item["substitution"] = (f"{sub['absent_teacher']} is absent; "
                                            f"{sub['substitute_teacher']} takes this class today")
                today_list.append(item)

        upcoming = [c for c in today_list if c["status"] == "upcoming"]
        ctx["today"] = {
            "day": weekday,
            "is_working_day": today.weekday() < 5,
            "classes": [{k: v for k, v in c.items() if k != "_start"} for c in today_list],
            "ongoing_class": next(({k: v for k, v in c.items() if k != "_start"}
                                   for c in today_list if c["status"] == "ongoing now"), None),
            "next_class": ({k: v for k, v in upcoming[0].items() if k != "_start"}
                           if upcoming else None),
        }
        ctx["weekly_timetable"] = weekly
        if not rows:
            ctx["timetable_note"] = "No published timetable for this batch yet."

        # ---- holidays / events --------------------------------------------
        cur.execute(
            """SELECT holiday_name, holiday_date, end_date FROM holidays
               WHERE %s BETWEEN holiday_date AND COALESCE(end_date, holiday_date)""", (today,))
        h = cur.fetchone()
        ctx["holiday_today"] = h["holiday_name"] if h else None

        cur.execute(
            """SELECT holiday_name, holiday_date, end_date FROM holidays
               WHERE holiday_date > %s ORDER BY holiday_date LIMIT 3""", (today,))
        ctx["upcoming_holidays"] = [
            {"name": x["holiday_name"], "from": str(x["holiday_date"]),
             "to": str(x["end_date"]) if x["end_date"] else None} for x in cur.fetchall()]

        cur.execute(
            """SELECT event_name, event_date, event_time, location FROM events
               WHERE event_date >= %s ORDER BY event_date, event_time LIMIT 3""", (today,))
        ctx["upcoming_events"] = [
            {"name": x["event_name"], "date": str(x["event_date"]),
             "time": _fmt(x["event_time"]), "location": x["location"]} for x in cur.fetchall()]

        # ---- project guide -------------------------------------------------
        cur.execute(
            """SELECT pg.project_title, pg.project_status, pg.project_type, pg.project_domain,
                      t.teacher_name, t.email AS teacher_email
               FROM project_guides pg JOIN teachers t ON pg.guide_teacher_id = t.teacher_id
               WHERE pg.student_id = %s ORDER BY pg.semester DESC LIMIT 1""", (student_id,))
        g = cur.fetchone()
        ctx["project_guide"] = ({
            "guide_name": g["teacher_name"], "guide_email": g["teacher_email"],
            "project_title": g["project_title"], "project_status": g["project_status"],
            "project_type": g["project_type"], "domain": g["project_domain"],
        } if g else "No project guide assigned (yet, or no project in this semester).")

        # ---- syllabus progress (same numbers as the dashboard) -------------
        try:
            from app.syllabus import _load_progress
            prog = _load_progress(cur, [batch_id]).get(batch_id)
            if prog:
                ctx["syllabus_progress"] = {
                    "overall_percent": prog["percent"],
                    "subjects": [{"subject": s["subject_name"], "covered": s["covered"],
                                  "total": s["total"], "percent": s["percent"]}
                                 for s in prog["subjects"]],
                }
        except Exception as e:
            print("Assistant: syllabus load failed:", e)

        # ---- recent announcements -----------------------------------------
        cur.execute(
            """SELECT title, message, created_at FROM notifications
               WHERE audience IN ('all', 'student') ORDER BY created_at DESC LIMIT 5""")
        ctx["recent_notifications"] = [
            {"title": n["title"], "message": n["message"],
             "when": n["created_at"].strftime("%d %b, %I:%M %p") if n["created_at"] else None}
            for n in cur.fetchall()]

        # exams module is not built yet
        ctx["exams"] = "Exam schedule is not available in SchedAI yet."
        return ctx
    finally:
        cur.close()
        conn.close()