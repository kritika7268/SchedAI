"""
SchedAI - imports.py

Admin-only bulk import from an Excel / CSV file:

  POST /import/students/preview    check a student file (nothing is saved)
  POST /import/students/commit     save the valid rows (creates missing batches)
  POST /import/syllabus/preview    check a syllabus file (nothing is saved)
  POST /import/syllabus/commit     save/update subjects (+ teacher skills)
  POST /import/calendar/preview    check a holidays/events file (nothing is saved)
  POST /import/calendar/commit     save holidays + events and notify everyone
  GET  /import/template/{kind}     blank Excel template  (students | syllabus | calendar)

Include it in main.py with:
    from app.imports import router as import_router
    app.include_router(import_router)
"""

from datetime import datetime

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import Response

from app import import_logic as il
from app.auth import require_role
from app.database import get_db_connection
from app.websocket_manager import manager

router = APIRouter(prefix="/import", tags=["import"])

MAX_UPLOAD_BYTES = 5 * 1024 * 1024  # 5 MB


# ------------------------------------------------------------------
# helpers
# ------------------------------------------------------------------
async def _read_rows(file: UploadFile, kind: str):
    if not file.filename:
        raise HTTPException(status_code=400, detail="File name is required")

    if file.filename.lower().endswith(".pdf"):
        raise HTTPException(
            status_code=400,
            detail=("PDF files cannot be read reliably. Please save the data as an "
                    "Excel (.xlsx) file using the template and upload that."))

    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=400, detail="File is too large (limit 5 MB)")

    try:
        return il.read_table(file.filename, data, kind)
    except il.ImportFileError as e:
        raise HTTPException(status_code=400, detail=str(e))


def _base_context(cursor):
    cursor.execute("SELECT department_id, department_name FROM departments")
    departments = {
        r["department_name"].strip().lower(): {"id": r["department_id"], "name": r["department_name"]}
        for r in cursor.fetchall()
    }

    cursor.execute("SELECT batch_id, batch_name, department_id, semester FROM batches")
    batches = {
        (r["department_id"], r["batch_name"].strip().lower()): {"id": r["batch_id"], "semester": r["semester"]}
        for r in cursor.fetchall()
    }
    return {"departments": departments, "batches": batches}


def _student_context(cursor):
    ctx = _base_context(cursor)
    cursor.execute("SELECT roll_number, email FROM students")
    rows = cursor.fetchall()
    ctx["existing_rolls"] = {r["roll_number"].strip().lower() for r in rows if r["roll_number"]}
    ctx["existing_emails"] = {r["email"].strip().lower() for r in rows if r["email"]}
    return ctx


def _syllabus_context(cursor):
    ctx = _base_context(cursor)

    cursor.execute("SELECT subject_id, subject_code, subject_name, department_id, semester, batch_id FROM subjects")
    by_code, by_key = {}, {}
    for r in cursor.fetchall():
        if r["subject_code"]:
            by_code[r["subject_code"].strip().lower()] = r["subject_id"]
        by_key[(r["department_id"], r["subject_name"].strip().lower(), r["semester"], r["batch_id"])] = r["subject_id"]
    ctx["subjects_by_code"] = by_code
    ctx["subjects_by_key"] = by_key

    cursor.execute("SELECT teacher_id, email FROM teachers WHERE email IS NOT NULL AND email <> ''")
    ctx["teachers_by_email"] = {r["email"].strip().lower(): r["teacher_id"] for r in cursor.fetchall()}
    return ctx


# ------------------------------------------------------------------
# STUDENTS
# ------------------------------------------------------------------
@router.post("/students/preview")
async def preview_students(
    file: UploadFile = File(...),
    current_user: dict = Depends(require_role("admin")),
):
    rows = await _read_rows(file, "students")

    connection = get_db_connection()
    cursor = connection.cursor(dictionary=True)
    try:
        results = il.validate_student_rows(rows, _student_context(cursor))
    finally:
        cursor.close()
        connection.close()

    valid = [r for r in results if r["valid"]]
    new_batches = sorted({r["batch_name"] for r in valid if r["new_batch"]})
    return {
        "total_rows": len(results),
        "valid_rows": len(valid),
        "invalid_rows": len(results) - len(valid),
        "new_batches": new_batches,
        "rows": results,
    }


@router.post("/students/commit")
async def commit_students(
    file: UploadFile = File(...),
    current_user: dict = Depends(require_role("admin")),
):
    rows = await _read_rows(file, "students")

    connection = get_db_connection()
    cursor = connection.cursor(dictionary=True)
    try:
        results = il.validate_student_rows(rows, _student_context(cursor))
        valid = [r for r in results if r["valid"]]
        invalid = [r for r in results if not r["valid"]]

        if not valid:
            return {
                "success": False,
                "message": "No valid students to import.",
                "imported": 0, "skipped": len(invalid),
                "new_batches_created": 0, "errors": invalid,
            }

        # 1. create batches that do not exist yet
        created_batches = {}
        for r in valid:
            if r["batch_id"] is not None:
                continue
            key = (r["department_id"], r["batch_name"].lower())
            if key not in created_batches:
                cursor.execute(
                    "INSERT INTO batches (batch_name, department_id, semester, section) VALUES (%s, %s, %s, %s)",
                    (r["batch_name"], r["department_id"], r["semester"], r["section"]))
                created_batches[key] = cursor.lastrowid

        # 2. insert the students
        for r in valid:
            batch_id = r["batch_id"] or created_batches[(r["department_id"], r["batch_name"].lower())]
            cursor.execute(
                """INSERT INTO students
                   (student_name, roll_number, email, semester, department_id, batch_id)
                   VALUES (%s, %s, %s, %s, %s, %s)""",
                (r["student_name"], r["roll_number"], r["email"],
                 r["semester"], r["department_id"], batch_id))

        connection.commit()

        return {
            "success": True,
            "message": f"{len(valid)} students imported.",
            "imported": len(valid),
            "skipped": len(invalid),
            "new_batches_created": len(created_batches),
            "errors": invalid,
        }

    except HTTPException:
        connection.rollback()
        raise
    except Exception as e:
        connection.rollback()
        raise HTTPException(status_code=400, detail=f"Student import failed: {e}")
    finally:
        cursor.close()
        connection.close()


# ------------------------------------------------------------------
# SYLLABUS (subjects)
# ------------------------------------------------------------------
@router.post("/syllabus/preview")
async def preview_syllabus(
    file: UploadFile = File(...),
    current_user: dict = Depends(require_role("admin")),
):
    rows = await _read_rows(file, "syllabus")

    connection = get_db_connection()
    cursor = connection.cursor(dictionary=True)
    try:
        results = il.validate_syllabus_rows(rows, _syllabus_context(cursor))
    finally:
        cursor.close()
        connection.close()

    valid = [r for r in results if r["valid"]]
    return {
        "total_rows": len(results),
        "valid_rows": len(valid),
        "invalid_rows": len(results) - len(valid),
        "to_create": sum(1 for r in valid if r["action"] == "create"),
        "to_update": sum(1 for r in valid if r["action"] == "update"),
        "rows": results,
    }


@router.post("/syllabus/commit")
async def commit_syllabus(
    file: UploadFile = File(...),
    current_user: dict = Depends(require_role("admin")),
):
    rows = await _read_rows(file, "syllabus")

    connection = get_db_connection()
    cursor = connection.cursor(dictionary=True)
    try:
        results = il.validate_syllabus_rows(rows, _syllabus_context(cursor))
        valid = [r for r in results if r["valid"]]
        invalid = [r for r in results if not r["valid"]]

        if not valid:
            return {
                "success": False,
                "message": "No valid subjects to import.",
                "created": 0, "updated": 0, "skipped": len(invalid), "errors": invalid,
            }

        created = updated = 0
        for r in valid:
            if r["action"] == "update":
                subject_id = r["existing_id"]
                cursor.execute(
                    """UPDATE subjects
                       SET subject_name = %s, department_id = %s, batch_id = %s,
                           semester = %s, sessions_per_week = %s, room_type_required = %s
                       WHERE subject_id = %s""",
                    (r["subject_name"], r["department_id"], r["batch_id"],
                     r["semester"], r["sessions_per_week"], r["room_type_required"], subject_id))
                updated += 1
            else:
                cursor.execute(
                    """INSERT INTO subjects
                       (subject_name, subject_code, department_id, batch_id,
                        semester, sessions_per_week, room_type_required)
                       VALUES (%s, %s, %s, %s, %s, %s, %s)""",
                    (r["subject_name"], r["subject_code"], r["department_id"], r["batch_id"],
                     r["semester"], r["sessions_per_week"], r["room_type_required"]))
                subject_id = cursor.lastrowid
                created += 1

            for teacher_id in r["teacher_ids"]:
                cursor.execute(
                    "INSERT IGNORE INTO teacher_skills (teacher_id, subject_id) VALUES (%s, %s)",
                    (teacher_id, subject_id))

        connection.commit()

        return {
            "success": True,
            "message": f"{created} subjects created, {updated} updated.",
            "created": created,
            "updated": updated,
            "skipped": len(invalid),
            "errors": invalid,
        }

    except HTTPException:
        connection.rollback()
        raise
    except Exception as e:
        connection.rollback()
        raise HTTPException(status_code=400, detail=f"Syllabus import failed: {e}")
    finally:
        cursor.close()
        connection.close()


# ------------------------------------------------------------------
# CALENDAR (holidays + events)
# ------------------------------------------------------------------
async def _notify(title, message, audience="all", notif_type="info"):
    """Save a notification and push it to everyone connected (same as the rest of SchedAI)."""
    connection = get_db_connection()
    cursor = connection.cursor()
    try:
        cursor.execute(
            "INSERT INTO notifications (title, message, notif_type, audience) VALUES (%s, %s, %s, %s)",
            (title, message, notif_type, audience))
        connection.commit()
        notification_id = cursor.lastrowid
    finally:
        cursor.close()
        connection.close()

    try:
        await manager.broadcast({
            "notification_id": notification_id,
            "title": title,
            "message": message,
            "notif_type": notif_type,
            "audience": audience,
            "created_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        })
    except Exception as e:  # a socket problem must never break the import
        print("WebSocket broadcast failed:", e)


def _calendar_context(cursor):
    cursor.execute("SELECT holiday_name, holiday_date FROM holidays")
    holidays = {(r["holiday_name"].strip().lower(), r["holiday_date"].strftime("%Y-%m-%d"))
                for r in cursor.fetchall()}
    cursor.execute("SELECT event_name, event_date FROM events")
    events = {(r["event_name"].strip().lower(), r["event_date"].strftime("%Y-%m-%d"))
              for r in cursor.fetchall()}
    return {"holidays": holidays, "events": events}


@router.post("/calendar/preview")
async def preview_calendar(
    file: UploadFile = File(...),
    current_user: dict = Depends(require_role("admin")),
):
    rows = await _read_rows(file, "calendar")

    connection = get_db_connection()
    cursor = connection.cursor(dictionary=True)
    try:
        results = il.validate_calendar_rows(rows, _calendar_context(cursor))
    finally:
        cursor.close()
        connection.close()

    valid = [r for r in results if r["valid"]]
    return {
        "total_rows": len(results),
        "valid_rows": len(valid),
        "invalid_rows": len(results) - len(valid),
        "holidays": sum(1 for r in valid if r["type"] == "holiday"),
        "events": sum(1 for r in valid if r["type"] == "event"),
        "rows": results,
    }


@router.post("/calendar/commit")
async def commit_calendar(
    file: UploadFile = File(...),
    current_user: dict = Depends(require_role("admin")),
):
    rows = await _read_rows(file, "calendar")

    connection = get_db_connection()
    cursor = connection.cursor(dictionary=True)
    try:
        results = il.validate_calendar_rows(rows, _calendar_context(cursor))
        valid = [r for r in results if r["valid"]]
        invalid = [r for r in results if not r["valid"]]

        if not valid:
            return {
                "success": False,
                "message": "No valid holidays or events to import.",
                "holidays": 0, "events": 0, "skipped": len(invalid), "errors": invalid,
            }

        for r in valid:
            if r["type"] == "holiday":
                cursor.execute(
                    """INSERT INTO holidays (holiday_name, holiday_date, end_date, description)
                       VALUES (%s, %s, %s, %s)""",
                    (r["name"], r["date"], r["end_date"], r["description"]))
            else:
                cursor.execute(
                    """INSERT INTO events (event_name, event_date, event_time, location, description)
                       VALUES (%s, %s, %s, %s, %s)""",
                    (r["name"], r["date"], r["time"], r["location"], r["description"]))

        connection.commit()
    except HTTPException:
        connection.rollback()
        raise
    except Exception as e:
        connection.rollback()
        raise HTTPException(status_code=400, detail=f"Calendar import failed: {e}")
    finally:
        cursor.close()
        connection.close()

    holiday_rows = [r for r in valid if r["type"] == "holiday"]
    event_rows = [r for r in valid if r["type"] == "event"]

    # ---- notify students + teachers (+ admin) in real time ----
    if len(valid) <= 3:
        for r in valid:
            when = r["date"] + (f" to {r['end_date']}" if r["end_date"] else "")
            if r["type"] == "holiday":
                await _notify("Holiday Announced", f"{r['name']} — {when}", "all", "info")
            else:
                extra = (f" at {r['location']}" if r["location"] else "")
                await _notify("Event Announced", f"{r['name']} — {when}{extra}", "all", "info")
    else:
        first = sorted(valid, key=lambda r: r["date"])[0]
        await _notify(
            "Calendar Updated",
            f"{len(holiday_rows)} holiday(s) and {len(event_rows)} event(s) added. "
            f"Next: {first['name']} on {first['date']}.",
            "all", "info")

    return {
        "success": True,
        "message": (f"{len(holiday_rows)} holiday(s) and {len(event_rows)} event(s) added. "
                    "Students and teachers have been notified."),
        "holidays": len(holiday_rows),
        "events": len(event_rows),
        "skipped": len(invalid),
        "errors": invalid,
    }


# ------------------------------------------------------------------
# TEMPLATES
# ------------------------------------------------------------------
@router.get("/template/{kind}")
def download_template(kind: str, current_user: dict = Depends(require_role("admin"))):
    if kind not in ("students", "syllabus", "calendar"):
        raise HTTPException(status_code=404, detail="Unknown template")

    return Response(
        content=il.make_template(kind),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename=schedai_{kind}_template.xlsx"},
    )