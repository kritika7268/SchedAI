"""
SchedAI - syllabus.py

Syllabus topics and per-batch progress.

TEACHER (only for subjects he/she teaches to that batch in the timetable)
  GET    /syllabus/my-classes
  GET    /syllabus/subject/{subject_id}/batch/{batch_id}
  POST   /syllabus/topics                 add topics (one per line)
  DELETE /syllabus/topics/{topic_id}
  POST   /syllabus/coverage               tick / un-tick "covered today"

STUDENT
  GET    /syllabus/progress/me            progress of the student's own batch
  GET    /syllabus/subject/{subject_id}/batch/{batch_id}   (own batch only, read-only)

ADMIN (read-only)
  GET    /syllabus/progress/overview
  GET    /syllabus/progress/batch/{batch_id}

Include in main.py:
    from app.syllabus import router as syllabus_router, overall_progress
    app.include_router(syllabus_router)
"""

from datetime import date, datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app import syllabus_logic as sl
from app.auth import require_role
from app.database import get_db_connection

router = APIRouter(prefix="/syllabus", tags=["syllabus"])


# ------------------------------------------------------------------
# request bodies
# ------------------------------------------------------------------
class TopicsIn(BaseModel):
    subject_id: int
    unit_no: int = 1
    titles: list[str]


class CoverageIn(BaseModel):
    topic_id: int
    batch_id: int
    covered: bool
    covered_on: str | None = None      # YYYY-MM-DD, defaults to today


# ------------------------------------------------------------------
# helpers
# ------------------------------------------------------------------
def _teacher_id(user):
    tid = user.get("teacher_id")
    if not tid:
        raise HTTPException(status_code=403, detail="This account is not linked to a teacher record.")
    return tid


def _teaches(cursor, teacher_id, subject_id, batch_id=None):
    """True if the timetable gives this teacher the subject (for that batch)."""
    if batch_id is None:
        cursor.execute(
            "SELECT 1 FROM timetables WHERE teacher_id = %s AND subject_id = %s LIMIT 1",
            (teacher_id, subject_id))
    else:
        cursor.execute(
            "SELECT 1 FROM timetables WHERE teacher_id = %s AND subject_id = %s AND batch_id = %s LIMIT 1",
            (teacher_id, subject_id, batch_id))
    return cursor.fetchone() is not None


def _student_batch_id(cursor, user):
    sid = user.get("student_id")
    if not sid:
        raise HTTPException(status_code=403, detail="This account is not linked to a student record.")
    cursor.execute("SELECT batch_id FROM students WHERE student_id = %s", (sid,))
    row = cursor.fetchone()
    if not row or not row["batch_id"]:
        raise HTTPException(status_code=404, detail="You are not assigned to a batch yet. Contact the admin.")
    return row["batch_id"]


def _topic_totals(cursor):
    cursor.execute("SELECT subject_id, COUNT(*) AS n FROM syllabus_topics GROUP BY subject_id")
    return {r["subject_id"]: r["n"] for r in cursor.fetchall()}


def _covered_map(cursor):
    cursor.execute(
        """SELECT t.subject_id, c.batch_id, COUNT(*) AS n
           FROM topic_coverage c JOIN syllabus_topics t ON t.topic_id = c.topic_id
           GROUP BY t.subject_id, c.batch_id""")
    return {(r["subject_id"], r["batch_id"]): r["n"] for r in cursor.fetchall()}


def _load_progress(cursor, batch_ids=None):
    """Progress per batch for the given batches (all batches when None)."""
    cursor.execute("SELECT batch_id, batch_name, department_id, semester FROM batches ORDER BY batch_name")
    batches = cursor.fetchall()
    if batch_ids is not None:
        wanted = set(batch_ids)
        batches = [b for b in batches if b["batch_id"] in wanted]

    cursor.execute(
        """SELECT subject_id, subject_name, subject_code, department_id, semester,
                  batch_id, sessions_per_week FROM subjects""")
    subjects = cursor.fetchall()

    cursor.execute(
        """SELECT DISTINCT t.subject_id, t.batch_id, te.teacher_name
           FROM timetables t JOIN teachers te ON te.teacher_id = t.teacher_id
           WHERE t.batch_id IS NOT NULL""")
    teachers_map, pairs = {}, set()
    for r in cursor.fetchall():
        key = (r["subject_id"], r["batch_id"])
        pairs.add(key)
        teachers_map.setdefault(key, []).append(r["teacher_name"])

    return sl.assemble_progress(
        batches, subjects, _topic_totals(cursor), _covered_map(cursor), teachers_map, pairs)


def overall_progress(cursor):
    """Department-wide numbers (used by the admin dashboard card)."""
    return sl.overall(_load_progress(cursor))


def _subject_batch_payload(cursor, subject_id, batch_id):
    cursor.execute(
        "SELECT subject_id, subject_name, subject_code FROM subjects WHERE subject_id = %s", (subject_id,))
    subject = cursor.fetchone()
    cursor.execute("SELECT batch_id, batch_name, semester FROM batches WHERE batch_id = %s", (batch_id,))
    batch = cursor.fetchone()
    if not subject or not batch:
        raise HTTPException(status_code=404, detail="Subject or batch not found.")

    cursor.execute(
        """SELECT t.topic_id, t.unit_no, t.topic_title, c.covered_on
           FROM syllabus_topics t
           LEFT JOIN topic_coverage c ON c.topic_id = t.topic_id AND c.batch_id = %s
           WHERE t.subject_id = %s
           ORDER BY t.unit_no, t.topic_id""",
        (batch_id, subject_id))

    topics = []
    for r in cursor.fetchall():
        topics.append({
            "topic_id": r["topic_id"],
            "unit_no": r["unit_no"],
            "topic_title": r["topic_title"],
            "covered": r["covered_on"] is not None,
            "covered_on": r["covered_on"].strftime("%Y-%m-%d") if r["covered_on"] else None,
        })

    covered = sum(1 for t in topics if t["covered"])
    return subject, batch, topics, sl.summary(len(topics), covered)


# ------------------------------------------------------------------
# TEACHER
# ------------------------------------------------------------------
@router.get("/my-classes")
def my_classes(current_user: dict = Depends(require_role("teacher"))):
    teacher_id = _teacher_id(current_user)
    connection = get_db_connection()
    cursor = connection.cursor(dictionary=True)
    try:
        cursor.execute(
            """SELECT DISTINCT t.subject_id, s.subject_name, s.subject_code,
                      t.batch_id, b.batch_name, b.semester
               FROM timetables t
               JOIN subjects s ON s.subject_id = t.subject_id
               JOIN batches b ON b.batch_id = t.batch_id
               WHERE t.teacher_id = %s
               ORDER BY b.batch_name, s.subject_name""",
            (teacher_id,))
        classes = cursor.fetchall()

        totals = _topic_totals(cursor)
        covered = _covered_map(cursor)
        for c in classes:
            c.update(sl.summary(
                totals.get(c["subject_id"], 0),
                min(covered.get((c["subject_id"], c["batch_id"]), 0), totals.get(c["subject_id"], 0))))
        return classes
    finally:
        cursor.close()
        connection.close()


@router.get("/subject/{subject_id}/batch/{batch_id}")
def subject_batch_view(
    subject_id: int,
    batch_id: int,
    current_user: dict = Depends(require_role("teacher", "admin", "student")),
):
    connection = get_db_connection()
    cursor = connection.cursor(dictionary=True)
    try:
        role = current_user["role"]
        can_edit = False

        if role == "teacher":
            if not _teaches(cursor, _teacher_id(current_user), subject_id, batch_id):
                raise HTTPException(status_code=403, detail="You do not teach this subject to this batch.")
            can_edit = True
        elif role == "student":
            if _student_batch_id(cursor, current_user) != batch_id:
                raise HTTPException(status_code=403, detail="You can only see your own batch.")

        subject, batch, topics, summ = _subject_batch_payload(cursor, subject_id, batch_id)
        return {"subject": subject, "batch": batch, "can_edit": can_edit,
                "summary": summ, "topics": topics}
    finally:
        cursor.close()
        connection.close()


@router.post("/topics")
def add_topics(body: TopicsIn, current_user: dict = Depends(require_role("teacher"))):
    teacher_id = _teacher_id(current_user)
    titles = sl.clean_titles(body.titles)
    if not titles:
        raise HTTPException(status_code=400, detail="Enter at least one topic.")
    if body.unit_no < 1 or body.unit_no > 50:
        raise HTTPException(status_code=400, detail="Unit number must be between 1 and 50.")

    connection = get_db_connection()
    cursor = connection.cursor(dictionary=True)
    try:
        if not _teaches(cursor, teacher_id, body.subject_id):
            raise HTTPException(status_code=403, detail="You can only add topics to a subject you teach.")

        added = 0
        for title in titles:
            cursor.execute(
                """INSERT IGNORE INTO syllabus_topics (subject_id, unit_no, topic_title, created_by)
                   VALUES (%s, %s, %s, %s)""",
                (body.subject_id, body.unit_no, title, current_user["user_id"]))
            added += cursor.rowcount
        connection.commit()
        return {"added": added, "already_existed": len(titles) - added}
    except HTTPException:
        connection.rollback()
        raise
    except Exception as e:
        connection.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        cursor.close()
        connection.close()


@router.delete("/topics/{topic_id}")
def delete_topic(topic_id: int, current_user: dict = Depends(require_role("teacher"))):
    teacher_id = _teacher_id(current_user)
    connection = get_db_connection()
    cursor = connection.cursor(dictionary=True)
    try:
        cursor.execute("SELECT subject_id FROM syllabus_topics WHERE topic_id = %s", (topic_id,))
        topic = cursor.fetchone()
        if not topic:
            raise HTTPException(status_code=404, detail="Topic not found.")
        if not _teaches(cursor, teacher_id, topic["subject_id"]):
            raise HTTPException(status_code=403, detail="You can only delete topics of a subject you teach.")

        cursor.execute("DELETE FROM syllabus_topics WHERE topic_id = %s", (topic_id,))
        connection.commit()
        return {"deleted": True}
    except HTTPException:
        connection.rollback()
        raise
    finally:
        cursor.close()
        connection.close()


@router.post("/coverage")
def set_coverage(body: CoverageIn, current_user: dict = Depends(require_role("teacher"))):
    """Tick (covered=true) or un-tick (covered=false) a topic for ONE batch."""
    teacher_id = _teacher_id(current_user)

    when = date.today()
    if body.covered_on:
        try:
            when = datetime.strptime(body.covered_on, "%Y-%m-%d").date()
        except ValueError:
            raise HTTPException(status_code=400, detail="Date must be YYYY-MM-DD.")
        if when > date.today():
            raise HTTPException(status_code=400, detail="A topic cannot be marked as covered on a future date.")

    connection = get_db_connection()
    cursor = connection.cursor(dictionary=True)
    try:
        cursor.execute("SELECT subject_id FROM syllabus_topics WHERE topic_id = %s", (body.topic_id,))
        topic = cursor.fetchone()
        if not topic:
            raise HTTPException(status_code=404, detail="Topic not found.")

        subject_id = topic["subject_id"]
        if not _teaches(cursor, teacher_id, subject_id, body.batch_id):
            raise HTTPException(
                status_code=403,
                detail="You can only update subjects you teach to this batch.")

        if body.covered:
            cursor.execute(
                """INSERT INTO topic_coverage (topic_id, batch_id, covered_on, marked_by)
                   VALUES (%s, %s, %s, %s)
                   ON DUPLICATE KEY UPDATE covered_on = VALUES(covered_on),
                                           marked_by = VALUES(marked_by)""",
                (body.topic_id, body.batch_id, when, current_user["user_id"]))
        else:
            cursor.execute(
                "DELETE FROM topic_coverage WHERE topic_id = %s AND batch_id = %s",
                (body.topic_id, body.batch_id))
        connection.commit()

        _, _, _, summ = _subject_batch_payload(cursor, subject_id, body.batch_id)
        return {"covered": body.covered, "summary": summ}
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
# STUDENT / ADMIN PROGRESS
# ------------------------------------------------------------------
@router.get("/progress/me")
def my_progress(current_user: dict = Depends(require_role("student"))):
    connection = get_db_connection()
    cursor = connection.cursor(dictionary=True)
    try:
        batch_id = _student_batch_id(cursor, current_user)
        progress = _load_progress(cursor, [batch_id])
        return progress[batch_id]
    finally:
        cursor.close()
        connection.close()


@router.get("/progress/batch/{batch_id}")
def batch_progress(batch_id: int, current_user: dict = Depends(require_role("admin", "teacher"))):
    connection = get_db_connection()
    cursor = connection.cursor(dictionary=True)
    try:
        progress = _load_progress(cursor, [batch_id])
        if batch_id not in progress:
            raise HTTPException(status_code=404, detail="Batch not found.")
        return progress[batch_id]
    finally:
        cursor.close()
        connection.close()


@router.get("/progress/overview")
def progress_overview(current_user: dict = Depends(require_role("admin"))):
    connection = get_db_connection()
    cursor = connection.cursor(dictionary=True)
    try:
        progress = _load_progress(cursor)
        return {
            "overall": sl.overall(progress),
            "batches": list(progress.values()),
        }
    finally:
        cursor.close()
        connection.close()