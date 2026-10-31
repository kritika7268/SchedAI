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
    cur = conn.cursor(dictionary=True, buffered=True)
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

        # holiday or exam week => regular classes are suspended (same rule as the dashboard)
        reason = f"Holiday: {h['holiday_name']}" if h else None
        try:
            from app.exams import exam_week_containing
            wk = exam_week_containing(cur, today)
        except Exception as e:
            wk = None
            print("Assistant: exam week check failed:", e)
        if wk:
            ctx["exam_week"] = {"from": str(wk["week_start"]), "to": str(wk["week_end"])}
            reason = reason or "Exam week - regular classes are suspended"
        if reason:
            ctx["today"].update({"classes": [], "ongoing_class": None, "next_class": None,
                                 "classes_suspended": reason})

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
        try:
            cur.execute(
                """SELECT title, message, created_at FROM notifications
                   WHERE audience = 'all'
                      OR (audience = 'student' AND (batch_id IS NULL OR batch_id = %s))
                   ORDER BY created_at DESC LIMIT 5""", (batch_id,))
        except Exception:                      # older table without batch_id
            cur.execute(
                """SELECT title, message, created_at FROM notifications
                   WHERE audience = 'all' ORDER BY created_at DESC LIMIT 5""")
        ctx["recent_notifications"] = [
            {"title": n["title"], "message": n["message"],
             "when": n["created_at"].strftime("%d %b, %I:%M %p") if n["created_at"] else None}
            for n in cur.fetchall()]

        # ---- study material uploaded by teachers (own batch only) ----------
        try:
            cur.execute(
                """SELECT n.title, n.unit, s.subject_name, t.teacher_name
                   FROM notes n
                   JOIN subjects s ON n.subject_id = s.subject_id
                   JOIN teachers t ON n.teacher_id = t.teacher_id
                   WHERE n.batch_id = %s ORDER BY n.uploaded_at DESC LIMIT 60""", (batch_id,))
            notes_by = {}
            for n in cur.fetchall():
                d = notes_by.setdefault(n["subject_name"], {"count": 0, "teachers": [], "latest": []})
                d["count"] += 1
                if n["teacher_name"] not in d["teachers"]:
                    d["teachers"].append(n["teacher_name"])
                if len(d["latest"]) < 3:
                    d["latest"].append(f"{n['unit']}: {n['title']}" if n["unit"] else n["title"])

            cur.execute(
                """SELECT p.exam_year, s.subject_name FROM pyqs p
                   JOIN subjects s ON p.subject_id = s.subject_id
                   WHERE p.batch_id = %s ORDER BY p.exam_year DESC LIMIT 60""", (batch_id,))
            pyq_by = {}
            for p_ in cur.fetchall():
                yrs = pyq_by.setdefault(p_["subject_name"], [])
                if p_["exam_year"] not in yrs:
                    yrs.append(p_["exam_year"])

            taught = sorted({r["subject_name"] for r in rows})
            ctx["study_material"] = {
                "notes_total": sum(d["count"] for d in notes_by.values()),
                "notes_by_subject": notes_by,
                "subjects_without_notes": [x for x in taught if x not in notes_by],
                "pyq_years_by_subject": pyq_by,
                "where_to_download": "Dashboard > Study Material (Notes / PYQs tabs)",
            }
        except Exception as e:
            print("Assistant: study material load failed:", e)
            ctx["study_material"] = None

        # ---- upcoming exams (table: exam_schedule, own batch only) ---------
        labels = {"class_test_1": "Class Test 1", "mid_sem": "Mid Sem",
                  "class_test_2": "Class Test 2", "external": "External Exam"}
        try:
            cur.execute(
                """SELECT e.exam_round, e.exam_type, e.exam_date, e.start_time, e.end_time,
                          s.subject_name, s.subject_code, r.room_name
                   FROM exam_schedule e
                   JOIN subjects s ON e.subject_id = s.subject_id
                   LEFT JOIN rooms r ON e.room_id = r.room_id
                   WHERE e.batch_id = %s AND e.exam_date >= %s
                   ORDER BY e.exam_date, e.start_time LIMIT 25""", (batch_id, today))
            exams = []
            for x in cur.fetchall():
                days_left = (x["exam_date"] - today).days
                if days_left == 0 and _secs(x["end_time"]) <= now_secs:
                    continue                                   # today's paper already finished
                exams.append({
                    "exam": labels.get(x["exam_round"], x["exam_round"]), "type": x["exam_type"],
                    "subject": x["subject_name"], "subject_code": x["subject_code"],
                    "date": x["exam_date"].strftime("%A, %d %B %Y"),
                    "days_left": days_left,
                    "when": "TODAY" if days_left == 0 else "tomorrow" if days_left == 1 else f"in {days_left} days",
                    "time": f"{_fmt(x['start_time'])} - {_fmt(x['end_time'])}",
                    "room": x["room_name"] or "to be announced"})
            if exams:
                ctx["next_exam"] = exams[0]
                ctx["exam_today"] = [e for e in exams if e["days_left"] == 0] or None
                ctx["upcoming_exams"] = exams
            else:
                ctx["upcoming_exams"] = "No upcoming exam is scheduled for this batch."
        except Exception as e:
            print("Assistant: exams load failed:", e)
            ctx["upcoming_exams"] = "Exam schedule is not available right now."
        return ctx
    finally:
        cur.close()
        conn.close()