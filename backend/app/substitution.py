"""
SchedAI - substitution.py

Absence + substitution endpoints that ALWAYS send real-time notifications
(admin, teachers and students all see them in the bell):

  POST /auto-substitute     teacher absent -> every affected class gets a substitute
  POST /substitutions       manual substitution
  POST /teacher-absences    record an absence

Include this router in main.py BEFORE the other routes (right after the other
include_router lines near the top).  Routes registered first win, so these
replace the older versions of the same URLs that are still lower down in main.py.
"""

from datetime import datetime, timedelta

from fastapi import APIRouter, HTTPException

from app.database import get_db_connection
from app.notify import notify
from app.substitute_engine import auto_assign_substitutes
from app.timetable_generator import DEFAULT_MAX_CLASSES_PER_TEACHER_PER_DAY, time_label

router = APIRouter(tags=["substitution"])


def _hms(value):
    """TIME column (timedelta) / string -> zero padded 'HH:MM:SS'."""
    if isinstance(value, timedelta):
        total = int(value.total_seconds())
    elif isinstance(value, (int, float)):
        total = int(value)
    else:
        p = str(value).split(":")
        total = int(p[0]) * 3600 + int(p[1] if len(p) > 1 else 0) * 60 + int(p[2] if len(p) > 2 else 0)
    return f"{total // 3600:02d}:{(total % 3600) // 60:02d}:{total % 60:02d}"


# ------------------------------------------------------------------
# RECORD AN ABSENCE (only records it — substitutes come from /auto-substitute)
# ------------------------------------------------------------------
@router.post("/teacher-absences")
async def create_teacher_absence(teacher_id: int, absence_date: str, reason: str):
    connection = get_db_connection()
    cursor = connection.cursor(dictionary=True)
    try:
        cursor.execute("SELECT teacher_name FROM teachers WHERE teacher_id = %s", (teacher_id,))
        teacher = cursor.fetchone()
        if not teacher:
            raise HTTPException(status_code=404, detail="Teacher not found")

        cursor.execute(
            "INSERT INTO teacher_absences (teacher_id, absence_date, reason) VALUES (%s, %s, %s)",
            (teacher_id, absence_date, reason))
        connection.commit()
        absence_id = cursor.lastrowid
        name = teacher["teacher_name"]
    except HTTPException:
        connection.rollback()
        raise
    except Exception as e:
        connection.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        cursor.close()
        connection.close()

    await notify("Teacher Absent", f"{name} is absent on {absence_date}.", "all", "warning")

    return {
        "message": "Teacher absence created successfully",
        "absence_id": absence_id,
        "teacher_id": teacher_id,
        "absence_date": absence_date,
        "reason": reason,
    }


# ------------------------------------------------------------------
# MANUAL SUBSTITUTION
# ------------------------------------------------------------------
@router.post("/substitutions")
async def create_substitution(
    absence_id: int,
    substitute_teacher_id: int,
    timetable_id: int,
    substitution_date: str,
    status: str,
):
    connection = get_db_connection()
    cursor = connection.cursor(dictionary=True)
    try:
        cursor.execute(
            """INSERT INTO substitutions
               (absence_id, substitute_teacher_id, timetable_id, substitution_date, status)
               VALUES (%s, %s, %s, %s, %s)""",
            (absence_id, substitute_teacher_id, timetable_id, substitution_date, status))
        connection.commit()
        substitution_id = cursor.lastrowid

        cursor.execute(
            """SELECT s.subject_name, b.batch_name, t.start_time,
                      absent.teacher_name AS absent_teacher,
                      sub.teacher_name AS substitute_teacher
               FROM timetables t
               JOIN subjects s ON s.subject_id = t.subject_id
               LEFT JOIN batches b ON b.batch_id = t.batch_id
               JOIN teacher_absences a ON a.absence_id = %s
               JOIN teachers absent ON absent.teacher_id = a.teacher_id
               JOIN teachers sub ON sub.teacher_id = %s
               WHERE t.timetable_id = %s""",
            (absence_id, substitute_teacher_id, timetable_id))
        info = cursor.fetchone()
    except Exception as e:
        connection.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        cursor.close()
        connection.close()

    if info:
        batch = f" ({info['batch_name']})" if info["batch_name"] else ""
        await notify(
            "Substitute Assigned",
            f"{info['subject_name']}{batch} at {time_label(info['start_time'])} on {substitution_date}: "
            f"{info['substitute_teacher']} will take the class instead of {info['absent_teacher']}.",
            "all", "success")

    return {
        "message": "Substitution created successfully",
        "substitution_id": substitution_id,
        "absence_id": absence_id,
        "substitute_teacher_id": substitute_teacher_id,
        "timetable_id": timetable_id,
        "substitution_date": substitution_date,
        "status": status,
    }


# ------------------------------------------------------------------
# AUTO-SUBSTITUTE
# ------------------------------------------------------------------
@router.post("/auto-substitute")
async def auto_substitute(teacher_id: int, absence_date: str, reason: str = "Not specified"):
    try:
        parsed_date = datetime.strptime(absence_date, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(status_code=400, detail="absence_date must be in YYYY-MM-DD format")
    day_of_week = parsed_date.strftime("%A")

    connection = get_db_connection()
    cursor = connection.cursor(dictionary=True)

    assigned, unassigned, affected = [], [], []
    absent_name = ""
    absence_id = None
    already_covered = False

    try:
        cursor.execute("SELECT * FROM teachers WHERE teacher_id = %s", (teacher_id,))
        absent_teacher = cursor.fetchone()
        if not absent_teacher:
            raise HTTPException(status_code=404, detail="Teacher not found")
        absent_name = absent_teacher["teacher_name"]

        # reuse the absence if it was already reported (no duplicate rows)
        cursor.execute(
            "SELECT absence_id FROM teacher_absences WHERE teacher_id = %s AND absence_date = %s",
            (teacher_id, absence_date))
        existing = cursor.fetchone()
        if existing:
            absence_id = existing["absence_id"]
        else:
            cursor.execute(
                "INSERT INTO teacher_absences (teacher_id, absence_date, reason) VALUES (%s, %s, %s)",
                (teacher_id, absence_date, reason))
            connection.commit()
            absence_id = cursor.lastrowid

        # this teacher's classes that weekday, minus the ones already covered
        cursor.execute(
            """SELECT t.timetable_id, t.subject_id, t.day_of_week, t.start_time, t.end_time,
                      t.room_id, s.department_id, s.subject_name, b.batch_name
               FROM timetables t
               JOIN subjects s ON s.subject_id = t.subject_id
               LEFT JOIN batches b ON b.batch_id = t.batch_id
               WHERE t.teacher_id = %s AND t.day_of_week = %s""",
            (teacher_id, day_of_week))
        affected = cursor.fetchall()

        cursor.execute(
            "SELECT timetable_id FROM substitutions WHERE substitution_date = %s AND status != 'cancelled'",
            (absence_date,))
        covered_ids = {r["timetable_id"] for r in cursor.fetchall()}
        all_count = len(affected)
        affected = [c for c in affected if c["timetable_id"] not in covered_ids]
        already_covered = all_count > 0 and len(affected) == 0

        names = {c["timetable_id"]: (c["subject_name"], c["batch_name"]) for c in affected}
        for c in affected:
            c["start_time"] = _hms(c["start_time"])
            c["end_time"] = _hms(c["end_time"])

        results = []
        if affected:
            # teachers who are absent on this date cannot substitute
            cursor.execute("SELECT teacher_id FROM teacher_absences WHERE absence_date = %s", (absence_date,))
            absent_ids = {r["teacher_id"] for r in cursor.fetchall()}

            cursor.execute("SELECT * FROM teachers WHERE teacher_id != %s", (teacher_id,))
            candidates = [t for t in cursor.fetchall() if t.get("status") != "inactive"]
            max_daily = {
                t["teacher_id"]: int(t.get("max_daily_classes") or DEFAULT_MAX_CLASSES_PER_TEACHER_PER_DAY)
                for t in candidates}

            cursor.execute("SELECT subject_id, teacher_id FROM teacher_skills")
            skills = {}
            for r in cursor.fetchall():
                skills.setdefault(r["subject_id"], set()).add(r["teacher_id"])

            # busy slots: regular classes + substitutions already given that date
            cursor.execute(
                "SELECT teacher_id, day_of_week, start_time FROM timetables WHERE day_of_week = %s",
                (day_of_week,))
            busy = {(r["teacher_id"], r["day_of_week"], _hms(r["start_time"])) for r in cursor.fetchall()}
            daily = {}
            for (tid, _d, _s) in busy:
                daily[tid] = daily.get(tid, 0) + 1

            cursor.execute(
                """SELECT sub.substitute_teacher_id AS tid, t.day_of_week, t.start_time
                   FROM substitutions sub JOIN timetables t ON sub.timetable_id = t.timetable_id
                   WHERE sub.substitution_date = %s AND sub.status != 'cancelled'""",
                (absence_date,))
            for r in cursor.fetchall():
                key = (r["tid"], r["day_of_week"], _hms(r["start_time"]))
                if key not in busy:
                    busy.add(key)
                    daily[r["tid"]] = daily.get(r["tid"], 0) + 1

            cursor.execute("SELECT teacher_id, COUNT(*) AS cnt FROM timetables GROUP BY teacher_id")
            weekly = {r["teacher_id"]: r["cnt"] for r in cursor.fetchall()}

            results = auto_assign_substitutes(
                affected_classes=affected, candidate_teachers=candidates, busy_slots=busy,
                teacher_workload=weekly, absent_teacher_id=teacher_id,
                skills_by_subject=skills, daily_count=daily,
                teacher_max_daily=max_daily, unavailable_teacher_ids=absent_ids)

            ins = connection.cursor()
            for r in results:
                subject_name, batch_name = names.get(r["timetable_id"], (None, None))
                r["start_label"] = time_label(r["start_time"])
                r["subject_name"] = subject_name
                r["batch_name"] = batch_name
                if r["status"] == "assigned":
                    ins.execute(
                        """INSERT INTO substitutions
                           (absence_id, substitute_teacher_id, timetable_id, substitution_date, status)
                           VALUES (%s, %s, %s, %s, 'auto-assigned')""",
                        (absence_id, r["substitute_teacher_id"], r["timetable_id"], absence_date))
                    assigned.append(r)
                else:
                    unassigned.append(r)
            connection.commit()
            ins.close()

        # best effort: mark the teacher absent in the attendance table (if it exists)
        try:
            att = connection.cursor()
            att.execute(
                """INSERT INTO teacher_attendance (teacher_id, attendance_date, status)
                   VALUES (%s, %s, 'absent') ON DUPLICATE KEY UPDATE status = 'absent'""",
                (teacher_id, absence_date))
            connection.commit()
            att.close()
        except Exception:
            connection.rollback()

    except HTTPException:
        connection.rollback()
        raise
    except Exception as e:
        connection.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        cursor.close()
        connection.close()

    # ------------------------------------------------------------------
    # NOTIFICATIONS  (admin + every teacher + every student see these)
    # ------------------------------------------------------------------
    if not already_covered:
        if affected:
            await notify(
                "Teacher Absent",
                f"{absent_name} is absent on {absence_date}. {len(affected)} class(es) affected.",
                "all", "warning")
        else:
            await notify(
                "Teacher Absent",
                f"{absent_name} is absent on {absence_date}. No classes that day.",
                "all", "info")

    for a in assigned:
        batch = f" ({a['batch_name']})" if a.get("batch_name") else ""
        await notify(
            "Substitute Assigned",
            f"{a['subject_name']}{batch} at {a['start_label']} on {absence_date}: "
            f"{a['substitute_teacher_name']} will take the class instead of {absent_name}.",
            "all", "success")

    if unassigned:
        lines = ", ".join(
            f"{u['subject_name']}{' (' + u['batch_name'] + ')' if u.get('batch_name') else ''} at {u['start_label']}"
            for u in unassigned)
        await notify(
            "Substitute Needed",
            f"No substitute found for: {lines}. Please assign manually.",
            "admin", "warning")

    if not affected:
        message = (f"{absent_name}'s classes on {day_of_week} already have substitutes."
                   if already_covered
                   else f"{absent_name} has no classes on {day_of_week}. Absence logged, nothing to substitute.")
    else:
        message = (f"{len(assigned)}/{len(affected)} classes covered automatically"
                   + (f", {len(unassigned)} need manual attention" if unassigned else ""))

    return {
        "message": message,
        "absence_id": absence_id,
        "day_of_week": day_of_week,
        "assigned": assigned,
        "unassigned": unassigned,
    }