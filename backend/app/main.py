from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from app.database import get_db_connection
from app.timetable_generator import generate_all, DEFAULT_MAX_CLASSES_PER_TEACHER_PER_DAY, time_label
from fastapi.concurrency import run_in_threadpool
from app.substitute_engine import auto_assign_substitutes
from typing import Optional
from datetime import datetime, timedelta
from pydantic import BaseModel, EmailStr 
from app.auth import hash_password, verify_password, create_access_token, get_current_user, require_role 
from fastapi import Depends
from fastapi import UploadFile, File
from fastapi.responses import StreamingResponse, FileResponse
import csv
import io
import re
import os
import uuid
from pathlib import Path
app = FastAPI(title="SchedAI API")
from fastapi import WebSocket, WebSocketDisconnect
from app.websocket_manager import manager


def _normalize_time_str(value):
    """
    mysql-connector returns TIME columns as datetime.timedelta, and
    str(timedelta) does NOT zero-pad the hour (e.g. "9:00:00" instead of
    "09:00:00"). The generator's DEFAULT_SLOTS are zero-padded, so without
    this, any single-digit hour (9 AM, etc.) silently fails to match when
    checking "is this slot already busy" — a real conflict slips through.
    This normalizes any of {timedelta, number-of-seconds, string} into a
    consistent zero-padded "HH:MM:SS" string.
    """

    if isinstance(value, timedelta):
        total_seconds = int(value.total_seconds())
    elif isinstance(value, (int, float)):
        total_seconds = int(value)
    else:
        parts = str(value).split(":")
        h = int(parts[0])
        m = int(parts[1]) if len(parts) > 1 else 0
        s = int(parts[2]) if len(parts) > 2 else 0
        total_seconds = h * 3600 + m * 60 + s

    hours = total_seconds // 3600
    minutes = (total_seconds % 3600) // 60
    seconds = total_seconds % 60
    return f"{hours:02d}:{minutes:02d}:{seconds:02d}"

async def create_notification(
    title: str,
    message: str,
    audience: str = "all",
    notif_type: str = "info"
):
    """
    Saves notification in database and sends it
    to connected WebSocket clients.
    """
    connection = get_db_connection()
    cursor = connection.cursor()

    try:
        cursor.execute(
            """
            INSERT INTO notifications (title, message, notif_type, audience)
            VALUES (%s, %s, %s, %s)
            """,
            (title, message, notif_type, audience)
        )

        connection.commit()
        notification_id = cursor.lastrowid

    finally:
        cursor.close()
        connection.close()

    await manager.broadcast({
        "notification_id": notification_id,
        "title": title,
        "message": message,
        "notif_type": notif_type,
        "audience": audience,
        "created_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
    })

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def home():
    return {"message": "SchedAI Backend is Running"}


@app.websocket("/ws/notifications")
async def websocket_notifications(websocket: WebSocket, role: str = "all"):
    await manager.connect(websocket, role)

    try:
        while True:
            await websocket.receive_text()

    except WebSocketDisconnect:
        manager.disconnect(websocket)


# ============================================================
# NOTES & PYQ FILE STORAGE
# ============================================================

BASE_DIR = Path(__file__).resolve().parent
UPLOADS_DIR = BASE_DIR / "uploads"

NOTES_UPLOAD_DIR = UPLOADS_DIR / "notes"
PYQS_UPLOAD_DIR = UPLOADS_DIR / "pyqs"

NOTES_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
PYQS_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)        


# ==================== DEPARTMENTS ====================

@app.get("/departments")
def get_departments():
    connection = get_db_connection()
    cursor = connection.cursor(dictionary=True)

    cursor.execute("SELECT * FROM departments")
    departments = cursor.fetchall()

    cursor.close()
    connection.close()

    return departments


@app.post("/departments")
def create_department(department_name: str):
    connection = get_db_connection()
    cursor = connection.cursor()

    try:
        cursor.execute(
            "INSERT INTO departments (department_name) VALUES (%s)",
            (department_name,)
        )

        connection.commit()

        department_id = cursor.lastrowid

        return {
            "message": "Department created successfully",
            "department_id": department_id,
            "department_name": department_name
        }

    except Exception as e:
        connection.rollback()
        raise HTTPException(status_code=400, detail=str(e))

    finally:
        cursor.close()
        connection.close()


@app.put("/departments/{department_id}")
def update_department(department_id: int, department_name: str):
    connection = get_db_connection()
    cursor = connection.cursor()

    try:
        cursor.execute(
            "UPDATE departments SET department_name = %s WHERE department_id = %s",
            (department_name, department_id)
        )

        if cursor.rowcount == 0:
            raise HTTPException(
                status_code=404,
                detail="Department not found"
            )

        connection.commit()

        return {
            "message": "Department updated successfully",
            "department_id": department_id,
            "department_name": department_name
        }

    except HTTPException:
        connection.rollback()
        raise

    except Exception as e:
        connection.rollback()
        raise HTTPException(status_code=400, detail=str(e))

    finally:
        cursor.close()
        connection.close()


@app.delete("/departments/{department_id}")
def delete_department(department_id: int):
    connection = get_db_connection()
    cursor = connection.cursor()

    try:
        cursor.execute(
            "DELETE FROM departments WHERE department_id = %s",
            (department_id,)
        )

        if cursor.rowcount == 0:
            raise HTTPException(
                status_code=404,
                detail="Department not found"
            )

        connection.commit()

        return {
            "message": "Department deleted successfully",
            "department_id": department_id
        }

    except HTTPException:
        connection.rollback()
        raise

    except Exception as e:
        connection.rollback()
        raise HTTPException(status_code=400, detail=str(e))

    finally:
        cursor.close()
        connection.close()


# ==================== TEACHERS ====================

@app.get("/teachers")
def get_teachers():
    connection = get_db_connection()
    cursor = connection.cursor(dictionary=True)

    cursor.execute("SELECT * FROM teachers")
    teachers = cursor.fetchall()

    cursor.close()
    connection.close()

    return teachers


@app.post("/teachers")
def create_teacher(
    teacher_name: str,
    email: str,
    phone: str,
    department_id: int
):
    connection = get_db_connection()
    cursor = connection.cursor()

    try:
        cursor.execute(
            """
            INSERT INTO teachers
            (teacher_name, email, phone, department_id)
            VALUES (%s, %s, %s, %s)
            """,
            (
                teacher_name,
                email,
                phone,
                department_id
            )
        )

        connection.commit()

        teacher_id = cursor.lastrowid

        return {
            "message": "Teacher created successfully",
            "teacher_id": teacher_id,
            "teacher_name": teacher_name,
            "email": email,
            "phone": phone,
            "department_id": department_id
        }

    except Exception as e:
        connection.rollback()
        raise HTTPException(
            status_code=400,
            detail=str(e)
        )

    finally:
        cursor.close()
        connection.close()


@app.put("/teachers/{teacher_id}")
def update_teacher(
    teacher_id: int,
    teacher_name: str,
    email: str,
    phone: str,
    department_id: int
):
    connection = get_db_connection()
    cursor = connection.cursor()

    try:
        cursor.execute(
            """
            UPDATE teachers
            SET teacher_name = %s,
                email = %s,
                phone = %s,
                department_id = %s
            WHERE teacher_id = %s
            """,
            (
                teacher_name,
                email,
                phone,
                department_id,
                teacher_id
            )
        )

        if cursor.rowcount == 0:
            raise HTTPException(
                status_code=404,
                detail="Teacher not found"
            )

        connection.commit()

        return {
            "message": "Teacher updated successfully",
            "teacher_id": teacher_id,
            "teacher_name": teacher_name,
            "email": email,
            "phone": phone,
            "department_id": department_id
        }

    except HTTPException:
        connection.rollback()
        raise

    except Exception as e:
        connection.rollback()
        raise HTTPException(
            status_code=400,
            detail=str(e)
        )

    finally:
        cursor.close()
        connection.close()


@app.delete("/teachers/{teacher_id}")
def delete_teacher(teacher_id: int):
    connection = get_db_connection()
    cursor = connection.cursor()

    try:
        cursor.execute(
            "DELETE FROM teachers WHERE teacher_id = %s",
            (teacher_id,)
        )

        if cursor.rowcount == 0:
            raise HTTPException(
                status_code=404,
                detail="Teacher not found"
            )

        connection.commit()

        return {
            "message": "Teacher deleted successfully",
            "teacher_id": teacher_id
        }

    except HTTPException:
        connection.rollback()
        raise

    except Exception as e:
        connection.rollback()
        raise HTTPException(
            status_code=400,
            detail=str(e)
        )

    finally:
        cursor.close()
        connection.close()


# ==================== SUBJECTS ====================

@app.get("/subjects")
def get_subjects():
    connection = get_db_connection()
    cursor = connection.cursor(dictionary=True)

    cursor.execute("SELECT * FROM subjects")
    subjects = cursor.fetchall()

    cursor.close()
    connection.close()

    return subjects


@app.post("/subjects")
def create_subject(
    subject_name: str,
    subject_code: str,
    department_id: int,
    teacher_id: int
):
    connection = get_db_connection()
    cursor = connection.cursor()

    try:
        cursor.execute(
            """
            INSERT INTO subjects
            (subject_name, subject_code, department_id, teacher_id)
            VALUES (%s, %s, %s, %s)
            """,
            (
                subject_name,
                subject_code,
                department_id,
                teacher_id
            )
        )

        connection.commit()

        subject_id = cursor.lastrowid

        return {
            "message": "Subject created successfully",
            "subject_id": subject_id,
            "subject_name": subject_name,
            "subject_code": subject_code,
            "department_id": department_id,
            "teacher_id": teacher_id
        }

    except Exception as e:
        connection.rollback()
        raise HTTPException(
            status_code=400,
            detail=str(e)
        )

    finally:
        cursor.close()
        connection.close()


@app.put("/subjects/{subject_id}")
def update_subject(
    subject_id: int,
    subject_name: str,
    subject_code: str,
    department_id: int,
    teacher_id: int
):
    connection = get_db_connection()
    cursor = connection.cursor()

    try:
        cursor.execute(
            """
            UPDATE subjects
            SET subject_name = %s,
                subject_code = %s,
                department_id = %s,
                teacher_id = %s
            WHERE subject_id = %s
            """,
            (
                subject_name,
                subject_code,
                department_id,
                teacher_id,
                subject_id
            )
        )

        if cursor.rowcount == 0:
            raise HTTPException(
                status_code=404,
                detail="Subject not found"
            )

        connection.commit()

        return {
            "message": "Subject updated successfully",
            "subject_id": subject_id,
            "subject_name": subject_name,
            "subject_code": subject_code,
            "department_id": department_id,
            "teacher_id": teacher_id
        }

    except HTTPException:
        connection.rollback()
        raise

    except Exception as e:
        connection.rollback()
        raise HTTPException(
            status_code=400,
            detail=str(e)
        )

    finally:
        cursor.close()
        connection.close()


@app.delete("/subjects/{subject_id}")
def delete_subject(subject_id: int):
    connection = get_db_connection()
    cursor = connection.cursor()

    try:
        cursor.execute(
            "DELETE FROM subjects WHERE subject_id = %s",
            (subject_id,)
        )

        if cursor.rowcount == 0:
            raise HTTPException(
                status_code=404,
                detail="Subject not found"
            )

        connection.commit()

        return {
            "message": "Subject deleted successfully",
            "subject_id": subject_id
        }

    except HTTPException:
        connection.rollback()
        raise

    except Exception as e:
        connection.rollback()
        raise HTTPException(
            status_code=400,
            detail=str(e)
        )

    finally:
        cursor.close()
        connection.close()


# ==================== ROOMS ====================

@app.get("/rooms")
def get_rooms():
    connection = get_db_connection()
    cursor = connection.cursor(dictionary=True)

    cursor.execute("SELECT * FROM rooms")
    rooms = cursor.fetchall()

    cursor.close()
    connection.close()

    return rooms


@app.post("/rooms")
def create_room(
    room_name: str,
    room_type: str,
    capacity: int
):
    connection = get_db_connection()
    cursor = connection.cursor()

    try:
        cursor.execute(
            """
            INSERT INTO rooms
            (room_name, room_type, capacity)
            VALUES (%s, %s, %s)
            """,
            (
                room_name,
                room_type,
                capacity
            )
        )

        connection.commit()

        room_id = cursor.lastrowid

        return {
            "message": "Room created successfully",
            "room_id": room_id,
            "room_name": room_name,
            "room_type": room_type,
            "capacity": capacity
        }

    except Exception as e:
        connection.rollback()
        raise HTTPException(
            status_code=400,
            detail=str(e)
        )

    finally:
        cursor.close()
        connection.close()


@app.put("/rooms/{room_id}")
def update_room(
    room_id: int,
    room_name: str,
    room_type: str,
    capacity: int
):
    connection = get_db_connection()
    cursor = connection.cursor()

    try:
        cursor.execute(
            """
            UPDATE rooms
            SET room_name = %s,
                room_type = %s,
                capacity = %s
            WHERE room_id = %s
            """,
            (
                room_name,
                room_type,
                capacity,
                room_id
            )
        )

        if cursor.rowcount == 0:
            raise HTTPException(
                status_code=404,
                detail="Room not found"
            )

        connection.commit()

        return {
            "message": "Room updated successfully",
            "room_id": room_id,
            "room_name": room_name,
            "room_type": room_type,
            "capacity": capacity
        }

    except HTTPException:
        connection.rollback()
        raise

    except Exception as e:
        connection.rollback()
        raise HTTPException(
            status_code=400,
            detail=str(e)
        )

    finally:
        cursor.close()
        connection.close()


@app.delete("/rooms/{room_id}")
def delete_room(room_id: int):
    connection = get_db_connection()
    cursor = connection.cursor()

    try:
        cursor.execute(
            "DELETE FROM rooms WHERE room_id = %s",
            (room_id,)
        )

        if cursor.rowcount == 0:
            raise HTTPException(
                status_code=404,
                detail="Room not found"
            )

        connection.commit()

        return {
            "message": "Room deleted successfully",
            "room_id": room_id
        }

    except HTTPException:
        connection.rollback()
        raise

    except Exception as e:
        connection.rollback()
        raise HTTPException(
            status_code=400,
            detail=str(e)
        )

    finally:
        cursor.close()
        connection.close()


# ==================== STUDENTS ====================

@app.get("/students")
def get_students():
    connection = get_db_connection()
    cursor = connection.cursor(dictionary=True)

    try:
        cursor.execute(
            """
            SELECT
                s.student_id,
                s.student_name,
                s.roll_number,
                s.email,
                s.semester,
                s.department_id,
                d.department_name,
                s.batch_id,
                b.batch_name,
                b.section AS batch_section
            FROM students s
            LEFT JOIN departments d
                ON s.department_id = d.department_id
            LEFT JOIN batches b
                ON s.batch_id = b.batch_id
            ORDER BY
                b.batch_name,
                s.roll_number
            """
        )

        return cursor.fetchall()

    finally:
        cursor.close()
        connection.close()


@app.post("/students")
def create_student(
    student_name: str,
    roll_number: str,
    email: str,
    semester: int,
    department_id: int,
    batch_id: int
):
    connection = get_db_connection()
    cursor = connection.cursor(dictionary=True)

    try:

        # Verify batch
        cursor.execute(
            """
            SELECT
                batch_id,
                department_id,
                semester
            FROM batches
            WHERE batch_id = %s
            """,
            (batch_id,)
        )

        batch = cursor.fetchone()

        if not batch:
            raise HTTPException(
                status_code=404,
                detail="Batch not found"
            )

        if batch["department_id"] != department_id:
            raise HTTPException(
                status_code=400,
                detail="Batch does not belong to selected department"
            )

        if int(batch["semester"]) != int(semester):
            raise HTTPException(
                status_code=400,
                detail="Student semester does not match batch semester"
            )

        # Duplicate roll number
        cursor.execute(
            """
            SELECT student_id
            FROM students
            WHERE roll_number = %s
            """,
            (roll_number,)
        )

        if cursor.fetchone():
            raise HTTPException(
                status_code=400,
                detail="Roll number already exists"
            )

        # Duplicate email
        cursor.execute(
            """
            SELECT student_id
            FROM students
            WHERE email = %s
            """,
            (email,)
        )

        if cursor.fetchone():
            raise HTTPException(
                status_code=400,
                detail="Email already exists"
            )

        cursor.execute(
            """
            INSERT INTO students
            (
                student_name,
                roll_number,
                email,
                semester,
                department_id,
                batch_id
            )
            VALUES
            (%s, %s, %s, %s, %s, %s)
            """,
            (
                student_name,
                roll_number,
                email,
                semester,
                department_id,
                batch_id
            )
        )

        connection.commit()

        student_id = cursor.lastrowid

        return {
            "message": "Student created successfully",
            "student_id": student_id,
            "student_name": student_name,
            "roll_number": roll_number,
            "email": email,
            "semester": semester,
            "department_id": department_id,
            "batch_id": batch_id
        }

    except HTTPException:
        connection.rollback()
        raise

    except Exception as e:
        connection.rollback()

        raise HTTPException(
            status_code=400,
            detail=str(e)
        )

    finally:
        cursor.close()
        connection.close()


@app.put("/students/{student_id}")
def update_student(
    student_id: int,
    student_name: str,
    roll_number: str,
    email: str,
    semester: int,
    department_id: int
):
    connection = get_db_connection()
    cursor = connection.cursor()

    try:
        cursor.execute(
            """
            UPDATE students
            SET student_name = %s,
                roll_number = %s,
                email = %s,
                semester = %s,
                department_id = %s
            WHERE student_id = %s
            """,
            (
                student_name,
                roll_number,
                email,
                semester,
                department_id,
                student_id
            )
        )

        if cursor.rowcount == 0:
            raise HTTPException(
                status_code=404,
                detail="Student not found"
            )

        connection.commit()

        return {
            "message": "Student updated successfully",
            "student_id": student_id,
            "student_name": student_name,
            "roll_number": roll_number,
            "email": email,
            "semester": semester,
            "department_id": department_id
        }

    except HTTPException:
        connection.rollback()
        raise

    except Exception as e:
        connection.rollback()
        raise HTTPException(
            status_code=400,
            detail=str(e)
        )

    finally:
        cursor.close()
        connection.close()


@app.delete("/students/{student_id}")
def delete_student(student_id: int):
    connection = get_db_connection()
    cursor = connection.cursor()

    try:
        cursor.execute(
            "DELETE FROM students WHERE student_id = %s",
            (student_id,)
        )

        if cursor.rowcount == 0:
            raise HTTPException(
                status_code=404,
                detail="Student not found"
            )

        connection.commit()

        return {
            "message": "Student deleted successfully",
            "student_id": student_id
        }

    except HTTPException:
        connection.rollback()
        raise

    except Exception as e:
        connection.rollback()
        raise HTTPException(
            status_code=400,
            detail=str(e)
        )

    finally:
        cursor.close()
        connection.close()

# ============================================================
# BULK STUDENT IMPORT
# ============================================================

STUDENT_IMPORT_COLUMNS = [
    "roll_number",
    "student_name",
    "email",
    "batch_name",
    "semester",
    "section",
]


def validate_email_format(email: str) -> bool:
    """
    Basic email validation.
    """
    pattern = r"^[^@\s]+@[^@\s]+\.[^@\s]+$"
    return bool(re.match(pattern, email))


def parse_student_csv(file_bytes: bytes):
    """
    Parse CSV file and return list of dictionaries.
    """
    try:
        text = file_bytes.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = file_bytes.decode("latin-1")

    reader = csv.DictReader(io.StringIO(text))

    if not reader.fieldnames:
        raise HTTPException(
            status_code=400,
            detail="CSV file is empty or has no header row"
        )

    headers = [h.strip() for h in reader.fieldnames]

    missing_columns = [
        column
        for column in STUDENT_IMPORT_COLUMNS
        if column not in headers
    ]

    if missing_columns:
        raise HTTPException(
            status_code=400,
            detail=f"Missing required columns: {', '.join(missing_columns)}"
        )

    rows = []

    for row in reader:
        cleaned = {}

        for column in STUDENT_IMPORT_COLUMNS:
            value = row.get(column)
            cleaned[column] = str(value).strip() if value is not None else ""

        rows.append(cleaned)

    return rows


def parse_student_xlsx(file_bytes: bytes):
    """
    Parse XLSX file using openpyxl.
    """
    try:
        from openpyxl import load_workbook
    except ImportError:
        raise HTTPException(
            status_code=500,
            detail="openpyxl is not installed. Run: pip install openpyxl"
        )

    try:
        workbook = load_workbook(
            filename=io.BytesIO(file_bytes),
            read_only=True,
            data_only=True
        )
    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=f"Could not read Excel file: {str(e)}"
        )

    worksheet = workbook.active

    rows_data = list(
        worksheet.iter_rows(values_only=True)
    )

    workbook.close()

    if not rows_data:
        raise HTTPException(
            status_code=400,
            detail="Excel file is empty"
        )

    headers = [
        str(value).strip()
        if value is not None
        else ""
        for value in rows_data[0]
    ]

    missing_columns = [
        column
        for column in STUDENT_IMPORT_COLUMNS
        if column not in headers
    ]

    if missing_columns:
        raise HTTPException(
            status_code=400,
            detail=f"Missing required columns: {', '.join(missing_columns)}"
        )

    header_indexes = {
        header: index
        for index, header in enumerate(headers)
    }

    rows = []

    for excel_row in rows_data[1:]:
        cleaned = {}

        for column in STUDENT_IMPORT_COLUMNS:
            index = header_indexes[column]

            value = (
                excel_row[index]
                if index < len(excel_row)
                else None
            )

            if value is None:
                cleaned[column] = ""
            else:
                cleaned[column] = str(value).strip()

        rows.append(cleaned)

    return rows


def parse_student_file(filename: str, file_bytes: bytes):
    """
    Detect CSV/XLSX and parse accordingly.
    """
    filename = filename.lower()

    if filename.endswith(".csv"):
        return parse_student_csv(file_bytes)

    if filename.endswith(".xlsx"):
        return parse_student_xlsx(file_bytes)

    raise HTTPException(
        status_code=400,
        detail="Only CSV and XLSX files are supported"
    )


def validate_student_rows(connection, rows):
    """
    Validate all student rows before insertion.
    """

    cursor = connection.cursor(dictionary=True)

    results = []

    seen_roll_numbers = set()
    seen_emails = set()

    try:
        for index, row in enumerate(rows, start=2):

            errors = []

            roll_number = row["roll_number"].strip()
            student_name = row["student_name"].strip()
            email = row["email"].strip().lower()
            batch_name = row["batch_name"].strip()
            semester_raw = row["semester"].strip()
            section = row["section"].strip()

            # ---------------------------
            # Required fields
            # ---------------------------

            if not roll_number:
                errors.append("Roll number is required")

            if not student_name:
                errors.append("Student name is required")

            if not email:
                errors.append("Email is required")

            if not batch_name:
                errors.append("Batch name is required")

            if not semester_raw:
                errors.append("Semester is required")

            if not section:
                errors.append("Section is required")

            # ---------------------------
            # Email
            # ---------------------------

            if email and not validate_email_format(email):
                errors.append("Invalid email format")

            # ---------------------------
            # Semester
            # ---------------------------

            semester = None

            if semester_raw:
                try:
                    semester = int(float(semester_raw))

                    if semester < 1 or semester > 8:
                        errors.append(
                            "Semester must be between 1 and 8"
                        )

                except ValueError:
                    errors.append(
                        "Semester must be a valid number"
                    )

            # ---------------------------
            # Duplicate inside uploaded file
            # ---------------------------

            if roll_number:
                if roll_number.lower() in seen_roll_numbers:
                    errors.append(
                        "Duplicate roll number in uploaded file"
                    )

                seen_roll_numbers.add(
                    roll_number.lower()
                )

            if email:
                if email in seen_emails:
                    errors.append(
                        "Duplicate email in uploaded file"
                    )

                seen_emails.add(email)

            # ---------------------------
            # Check batch
            # ---------------------------

            batch = None

            if batch_name:
                cursor.execute(
                    """
                    SELECT
                        batch_id,
                        batch_name,
                        department_id,
                        semester,
                        section
                    FROM batches
                    WHERE LOWER(batch_name) = LOWER(%s)
                    LIMIT 1
                    """,
                    (batch_name,)
                )

                batch = cursor.fetchone()

                if not batch:
                    errors.append(
                        f"Batch '{batch_name}' does not exist"
                    )

                elif semester is not None:

                    if int(batch["semester"]) != semester:
                        errors.append(
                            f"Semester does not match batch '{batch_name}'"
                        )

            # ---------------------------
            # Check existing roll number
            # ---------------------------

            if roll_number:

                cursor.execute(
                    """
                    SELECT student_id
                    FROM students
                    WHERE LOWER(roll_number) = LOWER(%s)
                    LIMIT 1
                    """,
                    (roll_number,)
                )

                if cursor.fetchone():
                    errors.append(
                        f"Roll number '{roll_number}' already exists"
                    )

            # ---------------------------
            # Check existing email
            # ---------------------------

            if email:

                cursor.execute(
                    """
                    SELECT student_id
                    FROM students
                    WHERE LOWER(email) = LOWER(%s)
                    LIMIT 1
                    """,
                    (email,)
                )

                if cursor.fetchone():
                    errors.append(
                        f"Email '{email}' already exists"
                    )

            # ---------------------------
            # Result
            # ---------------------------

            results.append(
                {
                    "row_number": index,
                    "roll_number": roll_number,
                    "student_name": student_name,
                    "email": email,
                    "batch_name": batch_name,
                    "semester": semester,
                    "section": section,
                    "batch_id": (
                        batch["batch_id"]
                        if batch
                        else None
                    ),
                    "department_id": (
                        batch["department_id"]
                        if batch
                        else None
                    ),
                    "valid": len(errors) == 0,
                    "errors": errors,
                }
            )

        return results

    finally:
        cursor.close()


# ============================================================
# PREVIEW BULK IMPORT
# ============================================================

@app.post("/students/bulk-import/preview")
async def preview_bulk_student_import(
    file: UploadFile = File(...)
):
    """
    Upload CSV/XLSX and validate it WITHOUT inserting students.
    """

    if not file.filename:
        raise HTTPException(
            status_code=400,
            detail="File name is required"
        )

    file_bytes = await file.read()

    if not file_bytes:
        raise HTTPException(
            status_code=400,
            detail="Uploaded file is empty"
        )

    rows = parse_student_file(
        file.filename,
        file_bytes
    )

    if not rows:
        raise HTTPException(
            status_code=400,
            detail="No student records found in file"
        )

    connection = get_db_connection()

    try:

        results = validate_student_rows(
            connection,
            rows
        )

        valid_count = sum(
            1 for row in results
            if row["valid"]
        )

        invalid_count = len(results) - valid_count

        return {
            "success": True,
            "total_rows": len(results),
            "valid_rows": valid_count,
            "invalid_rows": invalid_count,
            "rows": results,
        }

    finally:
        connection.close()


# ============================================================
# ACTUAL BULK IMPORT
# ============================================================

@app.post("/students/bulk-import")
async def bulk_import_students(
    file: UploadFile = File(...)
):
    """
    Import valid students from CSV/XLSX.
    """

    if not file.filename:
        raise HTTPException(
            status_code=400,
            detail="File name is required"
        )

    file_bytes = await file.read()

    if not file_bytes:
        raise HTTPException(
            status_code=400,
            detail="Uploaded file is empty"
        )

    rows = parse_student_file(
        file.filename,
        file_bytes
    )

    if not rows:
        raise HTTPException(
            status_code=400,
            detail="No student records found"
        )

    connection = get_db_connection()

    try:

        validation_results = validate_student_rows(
            connection,
            rows
        )

        valid_rows = [
            row
            for row in validation_results
            if row["valid"]
        ]

        invalid_rows = [
            row
            for row in validation_results
            if not row["valid"]
        ]

        if not valid_rows:
            return {
                "success": False,
                "message": "No valid students to import",
                "total_rows": len(rows),
                "imported": 0,
                "skipped": len(invalid_rows),
                "errors": invalid_rows,
            }

        cursor = connection.cursor()

        imported_count = 0

        try:

            for row in valid_rows:

                cursor.execute(
                    """
                    INSERT INTO students
                    (
                        student_name,
                        roll_number,
                        email,
                        semester,
                        department_id,
                        batch_id
                    )
                    VALUES
                    (
                        %s,
                        %s,
                        %s,
                        %s,
                        %s,
                        %s
                    )
                    """,
                    (
                        row["student_name"],
                        row["roll_number"],
                        row["email"],
                        row["semester"],
                        row["department_id"],
                        row["batch_id"],
                    )
                )

                imported_count += 1

            connection.commit()

        except Exception:
            connection.rollback()
            raise

        finally:
            cursor.close()

        return {
            "success": True,
            "message": "Students imported successfully",
            "total_rows": len(rows),
            "imported": imported_count,
            "skipped": len(invalid_rows),
            "errors": invalid_rows,
        }

    except Exception as e:

        connection.rollback()

        raise HTTPException(
            status_code=400,
            detail=f"Bulk student import failed: {str(e)}"
        )

    finally:
        connection.close()


# ============================================================
# DOWNLOAD CSV TEMPLATE
# ============================================================

@app.get("/students/bulk-import/template")
def download_student_import_template():

    output = io.StringIO()

    writer = csv.writer(output)

    writer.writerow(
        STUDENT_IMPORT_COLUMNS
    )

    writer.writerow(
        [
            "BCA001",
            "Student 1",
            "student1@example.com",
            "BCA-5A",
            "5",
            "A",
        ]
    )

    writer.writerow(
        [
            "BCA002",
            "Student 2",
            "student2@example.com",
            "BCA-5A",
            "5",
            "A",
        ]
    )

    csv_bytes = output.getvalue().encode("utf-8")

    return StreamingResponse(
        io.BytesIO(csv_bytes),
        media_type="text/csv",
        headers={
            "Content-Disposition":
                "attachment; filename=student_import_template.csv"
        }
    )


# ============================================================
# GET STUDENTS WITH BATCH INFORMATION
# ============================================================

@app.get("/students-with-batch")
def get_students_with_batch():

    connection = get_db_connection()
    cursor = connection.cursor(dictionary=True)

    try:

        cursor.execute(
            """
            SELECT
                s.student_id,
                s.student_name,
                s.roll_number,
                s.email,
                s.semester,
                s.department_id,
                d.department_name,
                s.batch_id,
                b.batch_name,
                b.section AS batch_section
            FROM students s

            LEFT JOIN departments d
                ON s.department_id = d.department_id

            LEFT JOIN batches b
                ON s.batch_id = b.batch_id

            ORDER BY
                b.batch_name,
                s.roll_number
            """
        )

        return cursor.fetchall()

    finally:

        cursor.close()
        connection.close()


@app.get("/timetables")
def get_timetables():
    connection = get_db_connection()
    cursor = connection.cursor(dictionary=True)

    cursor.execute("""
        SELECT
            t.timetable_id,
            t.day_of_week,
            t.start_time,
            t.end_time,
            s.subject_id,
            s.subject_name,
            s.subject_code,
            te.teacher_id,
            te.teacher_name,
            r.room_id,
            r.room_name,
            r.room_type,
            t.semester,
            t.batch_id,
            b.batch_name,
            b.section
        FROM timetables t
        JOIN subjects s
            ON t.subject_id = s.subject_id
        JOIN teachers te
            ON t.teacher_id = te.teacher_id
        JOIN rooms r
            ON t.room_id = r.room_id
        LEFT JOIN batches b
            ON t.batch_id = b.batch_id
        ORDER BY
            FIELD(
                t.day_of_week,
                'Monday',
                'Tuesday',
                'Wednesday',
                'Thursday',
                'Friday',
                'Saturday'
            ),
            t.start_time
    """)

    timetables = cursor.fetchall()

    cursor.close()
    connection.close()

    return timetables


@app.post("/timetables")
def create_timetable(
    day_of_week: str,
    start_time: str,
    end_time: str,
    subject_id: int,
    teacher_id: int,
    room_id: int,
    semester: int
):
    connection = get_db_connection()
    cursor = connection.cursor()

    try:
        cursor.execute(
            """
            INSERT INTO timetables
            (day_of_week, start_time, end_time,subject_id, teacher_id, room_id, semester)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            """,
            (
                day_of_week,
                start_time,
                end_time,
                subject_id,
                teacher_id,
                room_id,
                semester
            )
        )

        connection.commit()

        timetable_id = cursor.lastrowid

        return {
            "message": "Timetable created successfully",
            "timetable_id": timetable_id,
            "day_of_week": day_of_week,
            "start_time": start_time,
            "end_time": end_time,
            "subject_id": subject_id,
            "teacher_id": teacher_id,
            "room_id": room_id,
            "semester": semester
        }

    except Exception as e:
        connection.rollback()
        raise HTTPException(
            status_code=400,
            detail=str(e)
        )

    finally:
        cursor.close()
        connection.close()


@app.put("/timetables/{timetable_id}")
def update_timetable(
    timetable_id: int,
    day_of_week: str,
    start_time: str,
    end_time: str,
    subject_id: int,
    teacher_id: int,
    room_id: int,
    semester: int
):
    connection = get_db_connection()
    cursor = connection.cursor()

    try:
        cursor.execute(
            """
            UPDATE timetables
            SET day_of_week = %s,
                start_time = %s,
                end_time = %s,
                subject_id = %s,
                teacher_id = %s,
                room_id = %s,
                semester = %s
            WHERE timetable_id = %s
            """,
            (
                day_of_week,
                start_time,
                end_time,
                subject_id,
                teacher_id,
                room_id,
                semester,
                timetable_id
            )
        )

        if cursor.rowcount == 0:
            raise HTTPException(
                status_code=404,
                detail="Timetable not found"
            )

        connection.commit()

        return {
            "message": "Timetable updated successfully",
            "timetable_id": timetable_id,
            "day_of_week": day_of_week,
            "start_time": start_time,
            "end_time": end_time,
            "subject_id": subject_id,
            "teacher_id": teacher_id,
            "room_id": room_id,
            "semester": semester
        }

    except HTTPException:
        connection.rollback()
        raise

    except Exception as e:
        connection.rollback()
        raise HTTPException(
            status_code=400,
            detail=str(e)
        )

    finally:
        cursor.close()
        connection.close()


@app.delete("/timetables/{timetable_id}")
def delete_timetable(timetable_id: int):
    connection = get_db_connection()
    cursor = connection.cursor()

    try:
        cursor.execute(
            "DELETE FROM timetables WHERE timetable_id = %s",
            (timetable_id,)
        )

        if cursor.rowcount == 0:
            raise HTTPException(
                status_code=404,
                detail="Timetable not found"
            )

        connection.commit()

        return {
            "message": "Timetable deleted successfully",
            "timetable_id": timetable_id
        }

    except HTTPException:
        connection.rollback()
        raise

    except Exception as e:
        connection.rollback()
        raise HTTPException(
            status_code=400,
            detail=str(e)
        )

    finally:
        cursor.close()
        connection.close()




# ==================== AI TIMETABLE GENERATOR (ALL BATCHES) ====================

def _generate_all_sync(auto_publish: bool, time_limit_seconds: int):
    connection = get_db_connection()
    cursor = connection.cursor(dictionary=True)
    try:
        cursor.execute("SELECT batch_id, batch_name, department_id, semester FROM batches ORDER BY batch_id")
        batch_rows = cursor.fetchall()
        if not batch_rows:
            raise HTTPException(status_code=400, detail="No batches found.")

        cursor.execute("SELECT batch_id, COUNT(*) AS c FROM students GROUP BY batch_id")
        sizes = {r["batch_id"]: r["c"] for r in cursor.fetchall()}
        batches = [{
            "batch_id": b["batch_id"], "batch_name": b["batch_name"],
            "size": max(sizes.get(b["batch_id"], 0), 1),
            "department_id": b["department_id"], "semester": b["semester"],
        } for b in batch_rows]

        cursor.execute("""SELECT subject_id, subject_name, department_id, batch_id, semester,
                            sessions_per_week, room_type_required FROM subjects""")
        all_subjects = cursor.fetchall()

        cursor.execute("SELECT teacher_id, subject_id FROM teacher_skills")
        skills = {}
        for r in cursor.fetchall():
            skills.setdefault(r["subject_id"], []).append(r["teacher_id"])

        cursor.execute("SELECT * FROM teachers")
        teachers = {}
        for t in cursor.fetchall():
            if t.get("status") == "inactive":
                continue
            teachers[t["teacher_id"]] = {
                "name": t["teacher_name"],
                "max_daily": int(t.get("max_daily_classes") or DEFAULT_MAX_CLASSES_PER_TEACHER_PER_DAY),
            }

        cursor.execute("SELECT * FROM rooms")
        rooms = [r for r in cursor.fetchall() if r.get("is_available", 1) in (1, True, None)]
        if not rooms:
            raise HTTPException(status_code=400, detail="No rooms found.")

        subjects_by_batch = {}
        for b in batches:
            subjects_by_batch[b["batch_id"]] = [{
                "subject_id": s["subject_id"], "subject_name": s["subject_name"],
                "sessions_per_week": int(s["sessions_per_week"] or 0),
                "room_type_required": s["room_type_required"],
                "eligible_teacher_ids": [t for t in skills.get(s["subject_id"], []) if t in teachers],
            } for s in all_subjects
              if s["department_id"] == b["department_id"]
              and s["semester"] == b["semester"]
              and (s["batch_id"] is None or s["batch_id"] == b["batch_id"])]

        # skip batches that have no syllabus / no teacher skills yet
        skipped = []
        active_batches = []
        for b in batches:
            subs = [x for x in subjects_by_batch[b["batch_id"]] if x["sessions_per_week"] > 0]
            if not subs:
                skipped.append({"batch_name": b["batch_name"], "reason": "no subjects (syllabus) added"})
            elif not any(x["eligible_teacher_ids"] for x in subs):
                skipped.append({"batch_name": b["batch_name"], "reason": "no teacher skills mapped"})
            else:
                active_batches.append(b)
        batches = active_batches
        if not batches:
            raise HTTPException(status_code=400,
                                detail="No batch is ready: add subjects and teacher skills first.")

        # solve first -> old timetable is deleted ONLY if a solution exists
        result = generate_all(batches, subjects_by_batch, rooms, teachers,
                            time_limit_seconds=time_limit_seconds)
        if result["status"] != "ok":
            return result

        status = "published" if auto_publish else "draft"
        sem_by_batch = {b["batch_id"]: b["semester"] for b in batches}

        cursor.execute("DELETE FROM substitutions")   # they point to old timetable rows
        cursor.execute("DELETE FROM timetables")

        ins = connection.cursor()
        ins.executemany(
            """INSERT INTO timetables
                (batch_id, day_of_week, start_time, end_time, subject_id,
                teacher_id, room_id, semester, status)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
            [(e["batch_id"], e["day_of_week"], e["start_time"], e["end_time"],
                e["subject_id"], e["teacher_id"], e["room_id"],
                sem_by_batch[e["batch_id"]], status) for e in result["schedule"]],
        )
        ins.close()
        connection.commit()

        result["status_saved"] = status
        result["batches"] = len(batches)
        result["skipped"] = skipped
        result["teacher_names"] = {tid: t["name"] for tid, t in teachers.items()}
        return result

    except HTTPException:
        connection.rollback()
        raise
    except Exception as e:
        connection.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        cursor.close()
        connection.close()


@app.post("/generate-timetable")
async def generate_timetable_endpoint(
    batch_id: Optional[int] = None,          # ignored, kept so old button still works
    auto_publish: bool = True,
    time_limit_seconds: int = 60,
):
    result = await run_in_threadpool(_generate_all_sync, auto_publish, time_limit_seconds)

    if result["status"] != "ok":
        lines = [f"{p['message']} -> {p['suggestion']}" for p in result["problems"]]
        raise HTTPException(
            status_code=409,
            detail="Timetable could not be generated with the current constraints.\n- "
                + "\n- ".join(lines)
        )

    skipped_text = ""
    if result["skipped"]:
        skipped_text = " Skipped: " + ", ".join(x["batch_name"] for x in result["skipped"]) + "."

    await create_notification(
        title="Timetable Published" if result["status_saved"] == "published" else "Timetable Draft Ready",
        message=f"The new timetable is ready for {result['batches']} batches." + skipped_text,
        audience="all" if result["status_saved"] == "published" else "admin",
        notif_type="success",
    )

    names = result.pop("teacher_names")
    stats = result["stats"]
    stats["teacher_weekly_load"] = {names.get(k, str(k)): v for k, v in stats["teacher_weekly_load"].items()}
    return {
        "success": True,
        "message": "Timetable generated successfully",
        "batches": result["batches"],
        "skipped_batches": result["skipped"],
        "sessions_created": len(result["schedule"]),
        "conflicts": stats["conflicts"],
        "stats": stats,
    }

@app.get("/teacher-workload")
def get_teacher_workload():
    """
    Per-teacher, per-day class counts across EVERY batch — the numbers the
    'max 5 classes/day' rule is enforced against, and what an admin-facing
    workload chart should render.

    Returns one row per (teacher, day_of_week) that has at least one class,
    plus each teacher's total weekly class count.
    """
    connection = get_db_connection()
    cursor = connection.cursor(dictionary=True)

    try:
        cursor.execute("""
            SELECT
                te.teacher_id,
                te.teacher_name,
                t.day_of_week,
                COUNT(*) AS classes_that_day
            FROM timetables t
            JOIN teachers te ON t.teacher_id = te.teacher_id
            GROUP BY te.teacher_id, te.teacher_name, t.day_of_week
            ORDER BY te.teacher_name,
                FIELD(
                    t.day_of_week,
                    'Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'
                )
        """)
        by_day = cursor.fetchall()

        cursor.execute("""
            SELECT
                te.teacher_id,
                te.teacher_name,
                COUNT(*) AS total_weekly_classes
            FROM timetables t
            JOIN teachers te ON t.teacher_id = te.teacher_id
            GROUP BY te.teacher_id, te.teacher_name
            ORDER BY total_weekly_classes DESC
        """)
        totals = cursor.fetchall()

        return {
            "max_classes_per_teacher_per_day": DEFAULT_MAX_CLASSES_PER_TEACHER_PER_DAY,
            "by_day": by_day,
            "totals": totals,
        }
    finally:
        cursor.close()
        connection.close()
        
@app.get("/admin/dashboard-stats")
def get_admin_dashboard_stats():
    """
    One call for every number the Admin Dashboard cards need.
    """
    connection = get_db_connection()
    cursor = connection.cursor(dictionary=True)

    try:
        today = datetime.now()
        today_date = today.strftime("%Y-%m-%d")
        today_day_name = today.strftime("%A")

        def scalar(query, params=()):
            cursor.execute(query, params)
            row = cursor.fetchone()
            return list(row.values())[0] if row else 0

        total_teachers = scalar("SELECT COUNT(*) AS c FROM teachers")
        total_students = scalar("SELECT COUNT(*) AS c FROM students")
        total_batches = scalar("SELECT COUNT(*) AS c FROM batches")
        total_subjects = scalar("SELECT COUNT(*) AS c FROM subjects")
        total_rooms = scalar("SELECT COUNT(*) AS c FROM rooms")

        todays_classes = scalar(
            "SELECT COUNT(*) AS c FROM timetables WHERE day_of_week = %s",
            (today_day_name,)
        )

        cursor.execute(
            """
            SELECT t.teacher_id, t.teacher_name, a.reason
            FROM teacher_absences a
            JOIN teachers t ON a.teacher_id = t.teacher_id
            WHERE a.absence_date = %s
            """,
            (today_date,)
        )
        absent_today = cursor.fetchall()

        cursor.execute(
            """
            SELECT
                sub.substitution_id,
                sub.status,
                absent_teacher.teacher_name AS absent_teacher,
                substitute_teacher.teacher_name AS substitute_teacher,
                s.subject_name,
                t.start_time
            FROM substitutions sub
            JOIN teacher_absences a ON sub.absence_id = a.absence_id
            JOIN teachers absent_teacher ON a.teacher_id = absent_teacher.teacher_id
            JOIN teachers substitute_teacher ON sub.substitute_teacher_id = substitute_teacher.teacher_id
            JOIN timetables t ON sub.timetable_id = t.timetable_id
            JOIN subjects s ON t.subject_id = s.subject_id
            WHERE sub.substitution_date = %s
            ORDER BY t.start_time
            """,
            (today_date,)
        )
        substitutions_today = cursor.fetchall()
        for row in substitutions_today:
            row["start_time"] = _normalize_time_str(row["start_time"])

        pending_substitutions = len(
            [s for s in substitutions_today if s["status"] == "auto-assigned"]
        )

        cursor.execute("SELECT COUNT(DISTINCT batch_id) AS c FROM timetables WHERE batch_id IS NOT NULL")
        batches_with_timetable = cursor.fetchone()["c"]
        batches_without_timetable = max(total_batches - batches_with_timetable, 0)

        cursor.execute(
            "SELECT total_units, completed_units FROM syllabus_progress"
        )
        syllabus_rows = cursor.fetchall()
        if syllabus_rows:
            pct_values = [
                (r["completed_units"] / r["total_units"] * 100)
                for r in syllabus_rows
                if r["total_units"]
            ]
            avg_syllabus_progress = round(sum(pct_values) / len(pct_values), 1) if pct_values else 0
        else:
            avg_syllabus_progress = 0

        total_students_with_guide = scalar("SELECT COUNT(DISTINCT student_id) AS c FROM project_guides")

        return {
            "generated_at": today.strftime("%Y-%m-%d %H:%M:%S"),
            "today_day_name": today_day_name,
            "totals": {
                "teachers": total_teachers,
                "students": total_students,
                "batches": total_batches,
                "subjects": total_subjects,
                "rooms": total_rooms,
            },
            "today": {
                "classes_scheduled": todays_classes,
                "teachers_absent": len(absent_today),
                "absent_teachers": absent_today,
                "substitutions": substitutions_today,
                "pending_substitutions": pending_substitutions,
            },
            "timetable_status": {
                "batches_with_timetable": batches_with_timetable,
                "batches_without_timetable": batches_without_timetable,
                "total_batches": total_batches,
            },
            "syllabus": {
                "average_progress_percent": avg_syllabus_progress,
                "subjects_tracked": len(syllabus_rows),
            },
            "project_guides": {
                "students_with_guide": total_students_with_guide,
                "students_total": total_students,
            },
        }

    finally:
        cursor.close()
        connection.close()


@app.get("/teacher-absences")
def get_teacher_absences():
    connection = get_db_connection()
    cursor = connection.cursor(dictionary=True)

    cursor.execute("""
        SELECT
            a.absence_id,
            a.absence_date,
            a.reason,
            t.teacher_id,
            t.teacher_name
        FROM teacher_absences a
        JOIN teachers t
            ON a.teacher_id = t.teacher_id
        ORDER BY a.absence_date DESC
    """)

    absences = cursor.fetchall()

    cursor.close()
    connection.close()

    return absences


@app.post("/teacher-absences")
def create_teacher_absence(
    teacher_id: int,
    absence_date: str,
    reason: str
):
    connection = get_db_connection()
    cursor = connection.cursor()

    try:
        cursor.execute(
            """
            INSERT INTO teacher_absences
            (teacher_id, absence_date, reason)
            VALUES (%s, %s, %s)
            """,
            (
                teacher_id,
                absence_date,
                reason
            )
        )

        connection.commit()

        absence_id = cursor.lastrowid

        return {
            "message": "Teacher absence created successfully",
            "absence_id": absence_id,
            "teacher_id": teacher_id,
            "absence_date": absence_date,
            "reason": reason
        }

    except Exception as e:
        connection.rollback()
        raise HTTPException(
            status_code=400,
            detail=str(e)
        )

    finally:
        cursor.close()
        connection.close()


@app.put("/teacher-absences/{absence_id}")
def update_teacher_absence(
    absence_id: int,
    teacher_id: int,
    absence_date: str,
    reason: str
):
    connection = get_db_connection()
    cursor = connection.cursor()

    try:
        cursor.execute(
            """
            UPDATE teacher_absences
            SET teacher_id = %s,
                absence_date = %s,
                reason = %s
            WHERE absence_id = %s
            """,
            (
                teacher_id,
                absence_date,
                reason,
                absence_id
            )
        )

        if cursor.rowcount == 0:
            raise HTTPException(
                status_code=404,
                detail="Teacher absence not found"
            )

        connection.commit()

        return {
            "message": "Teacher absence updated successfully",
            "absence_id": absence_id,
            "teacher_id": teacher_id,
            "absence_date": absence_date,
            "reason": reason
        }

    except HTTPException:
        connection.rollback()
        raise

    except Exception as e:
        connection.rollback()
        raise HTTPException(
            status_code=400,
            detail=str(e)
        )

    finally:
        cursor.close()
        connection.close()


@app.delete("/teacher-absences/{absence_id}")
def delete_teacher_absence(absence_id: int):
    connection = get_db_connection()
    cursor = connection.cursor()

    try:
        cursor.execute(
            "DELETE FROM teacher_absences WHERE absence_id = %s",
            (absence_id,)
        )

        if cursor.rowcount == 0:
            raise HTTPException(
                status_code=404,
                detail="Teacher absence not found"
            )

        connection.commit()

        return {
            "message": "Teacher absence deleted successfully",
            "absence_id": absence_id
        }

    except HTTPException:
        connection.rollback()
        raise

    except Exception as e:
        connection.rollback()
        raise HTTPException(
            status_code=400,
            detail=str(e)
        )

    finally:
        cursor.close()
        connection.close()


# ==================== AUTO-SUBSTITUTE ENGINE (ONE-CLICK) ====================
#
# This is the core "dynamic substitution" feature from the project plan:
# Teacher Marks Absent -> Affected Classes Identified -> Available Teachers
# Fetched -> Constraints Checked -> Best Substitute Selected -> Timetable
# Updated. One POST call does the whole flow.

@app.post("/auto-substitute")
async def auto_substitute(teacher_id: int, absence_date: str, reason: str = "Not specified"):
    """
    One-click substitute engine.

    Input:  teacher_id (who's absent), absence_date ("YYYY-MM-DD"), reason
    Output: for every class that teacher had that day, either an
            auto-assigned substitute or a clear reason none was available.

    Call this from the "Mark Absent" button in the UI — nothing else needs
    to be selected manually.
    """
    try:
        parsed_date = datetime.strptime(absence_date, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail="absence_date must be in YYYY-MM-DD format"
        )
    day_of_week = parsed_date.strftime("%A")  # e.g. "Monday"

    connection = get_db_connection()
    cursor = connection.cursor(dictionary=True)

    try:
        # 1. Confirm the teacher exists and grab their department (used as
        #    a fallback if a class's own department can't be found).
        cursor.execute(
            "SELECT teacher_id, teacher_name, department_id FROM teachers WHERE teacher_id = %s",
            (teacher_id,)
        )
        absent_teacher = cursor.fetchone()
        if not absent_teacher:
            raise HTTPException(status_code=404, detail="Teacher not found")

        # 2. Record the absence.
        cursor.execute(
            "INSERT INTO teacher_absences (teacher_id, absence_date, reason) VALUES (%s, %s, %s)",
            (teacher_id, absence_date, reason)
        )
        connection.commit()
        absence_id = cursor.lastrowid

        # 3. Affected classes: everything this teacher teaches on that
        #    weekday, with the subject's department for skill-matching.
        cursor.execute(
            """
            SELECT
                t.timetable_id, t.subject_id, t.day_of_week,
                t.start_time, t.end_time, t.room_id,
                s.department_id
            FROM timetables t
            JOIN subjects s ON t.subject_id = s.subject_id
            WHERE t.teacher_id = %s AND t.day_of_week = %s
            """,
            (teacher_id, day_of_week)
        )
        affected_classes = cursor.fetchall()

        if not affected_classes:
            return {
                "message": f"{absent_teacher['teacher_name']} has no classes on {day_of_week}. Absence logged, nothing to substitute.",
                "absence_id": absence_id,
                "day_of_week": day_of_week,
                "assigned": [],
                "unassigned": [],
            }

        # 4. Every other teacher who could possibly substitute.
        cursor.execute(
            "SELECT teacher_id, teacher_name, department_id FROM teachers WHERE teacher_id != %s",
            (teacher_id,)
        )
        candidate_teachers = cursor.fetchall()

        # 5. Busy slots: every (teacher, day, start_time) already occupied
        #    by their OWN regular timetable on that weekday...
        cursor.execute(
            "SELECT teacher_id, day_of_week, start_time FROM timetables WHERE day_of_week = %s",
            (day_of_week,)
        )
        busy_slots = {
            (row["teacher_id"], row["day_of_week"], str(row["start_time"]))
            for row in cursor.fetchall()
        }
        # ...plus anyone already covering a substitution on this exact date,
        # so the engine doesn't double-book a substitute across two classes.
        cursor.execute(
            """
            SELECT sub.substitute_teacher_id, t.day_of_week, t.start_time
            FROM substitutions sub
            JOIN timetables t ON sub.timetable_id = t.timetable_id
            WHERE sub.substitution_date = %s AND sub.status != 'cancelled'
            """,
            (absence_date,)
        )
        for row in cursor.fetchall():
            busy_slots.add((row["substitute_teacher_id"], row["day_of_week"], str(row["start_time"])))

        # 6. Weekly workload per teacher, for load-balancing picks.
        cursor.execute(
            "SELECT teacher_id, COUNT(*) AS cnt FROM timetables GROUP BY teacher_id"
        )
        teacher_workload = {row["teacher_id"]: row["cnt"] for row in cursor.fetchall()}

        # Normalize start_time to string (MySQL returns timedelta sometimes)
        for cls in affected_classes:
            cls["start_time"] = str(cls["start_time"])
            cls["end_time"] = str(cls["end_time"])

        # 7. Run the engine.
        results = auto_assign_substitutes(
            affected_classes=affected_classes,
            candidate_teachers=candidate_teachers,
            busy_slots=busy_slots,
            teacher_workload=teacher_workload,
            absent_teacher_id=teacher_id,
        )

        # 8. Persist every successful assignment.
        insert_cursor = connection.cursor()
        assigned, unassigned = [], []
        for r in results:
            if r["status"] == "assigned":
                insert_cursor.execute(
                    """
                    INSERT INTO substitutions
                    (absence_id, substitute_teacher_id, timetable_id, substitution_date, status)
                    VALUES (%s, %s, %s, %s, %s)
                    """,
                    (absence_id, r["substitute_teacher_id"], r["timetable_id"], absence_date, "auto-assigned")
                )
                assigned.append(r)
            else:
                unassigned.append(r)
        connection.commit()
        insert_cursor.close()

        await create_notification(
            title="Timetable Published",
            message=("A new timetable has been generated successfully."),
            audience="all",
            notif_type="success",
        )

        return {
            "message": (
                f"{len(assigned)}/{len(affected_classes)} classes covered automatically"
                + (f", {len(unassigned)} need manual attention" if unassigned else "")
            ),
            "absence_id": absence_id,
            "day_of_week": day_of_week,
            "assigned": assigned,
            "unassigned": unassigned,
        }

    except HTTPException:
        connection.rollback()
        raise
    except Exception as e:
        connection.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        cursor.close()
        connection.close()



@app.get("/substitutions")
def get_substitutions():
    connection = get_db_connection()
    cursor = connection.cursor(dictionary=True)

    cursor.execute("""
        SELECT
            sub.substitution_id,
            sub.substitution_date,
            sub.status,
            absent_teacher.teacher_name AS absent_teacher,
            substitute_teacher.teacher_name AS substitute_teacher,
            s.subject_name,
            t.day_of_week,
            t.start_time,
            t.end_time,
            r.room_name
        FROM substitutions sub
        JOIN teacher_absences a
            ON sub.absence_id = a.absence_id
        JOIN teachers absent_teacher
            ON a.teacher_id = absent_teacher.teacher_id
        JOIN teachers substitute_teacher
            ON sub.substitute_teacher_id = substitute_teacher.teacher_id
        JOIN timetables t
            ON sub.timetable_id = t.timetable_id
        JOIN subjects s
            ON t.subject_id = s.subject_id
        JOIN rooms r
            ON t.room_id = r.room_id
        ORDER BY sub.substitution_date, t.start_time
    """)

    substitutions = cursor.fetchall()

    cursor.close()
    connection.close()

    return substitutions


@app.post("/substitutions")
def create_substitution(
    absence_id: int,
    substitute_teacher_id: int,
    timetable_id: int,
    substitution_date: str,
    status: str
):
    connection = get_db_connection()
    cursor = connection.cursor()

    try:
        cursor.execute(
            """
            INSERT INTO substitutions
            (absence_id, substitute_teacher_id, timetable_id,
             substitution_date, status)
            VALUES (%s, %s, %s, %s, %s)
            """,
            (
                absence_id,
                substitute_teacher_id,
                timetable_id,
                substitution_date,
                status
            )
        )

        connection.commit()

        substitution_id = cursor.lastrowid

        return {
            "message": "Substitution created successfully",
            "substitution_id": substitution_id,
            "absence_id": absence_id,
            "substitute_teacher_id": substitute_teacher_id,
            "timetable_id": timetable_id,
            "substitution_date": substitution_date,
            "status": status
        }

    except Exception as e:
        connection.rollback()
        raise HTTPException(
            status_code=400,
            detail=str(e)
        )

    finally:
        cursor.close()
        connection.close()


@app.put("/substitutions/{substitution_id}")
def update_substitution(
    substitution_id: int,
    absence_id: int,
    substitute_teacher_id: int,
    timetable_id: int,
    substitution_date: str,
    status: str
):
    connection = get_db_connection()
    cursor = connection.cursor()

    try:
        cursor.execute(
            """
            UPDATE substitutions
            SET absence_id = %s,
                substitute_teacher_id = %s,
                timetable_id = %s,
                substitution_date = %s,
                status = %s
            WHERE substitution_id = %s
            """,
            (
                absence_id,
                substitute_teacher_id,
                timetable_id,
                substitution_date,
                status,
                substitution_id
            )
        )

        if cursor.rowcount == 0:
            raise HTTPException(
                status_code=404,
                detail="Substitution not found"
            )

        connection.commit()

        return {
            "message": "Substitution updated successfully",
            "substitution_id": substitution_id,
            "absence_id": absence_id,
            "substitute_teacher_id": substitute_teacher_id,
            "timetable_id": timetable_id,
            "substitution_date": substitution_date,
            "status": status
        }

    except HTTPException:
        connection.rollback()
        raise

    except Exception as e:
        connection.rollback()
        raise HTTPException(
            status_code=400,
            detail=str(e)
        )

    finally:
        cursor.close()
        connection.close()


@app.delete("/substitutions/{substitution_id}")
def delete_substitution(substitution_id: int):
    connection = get_db_connection()
    cursor = connection.cursor()

    try:
        cursor.execute(
            "DELETE FROM substitutions WHERE substitution_id = %s",
            (substitution_id,)
        )

        if cursor.rowcount == 0:
            raise HTTPException(
                status_code=404,
                detail="Substitution not found"
            )

        connection.commit()

        return {
            "message": "Substitution deleted successfully",
            "substitution_id": substitution_id
        }

    except HTTPException:
        connection.rollback()
        raise

    except Exception as e:
        connection.rollback()
        raise HTTPException(
            status_code=400,
            detail=str(e)
        )

    finally:
        cursor.close()
        connection.close()


# ============================================================
# NOTES
# ============================================================

@app.get("/notes")
def get_notes(
    batch_id: Optional[int] = None,
    subject_id: Optional[int] = None,
    current_user: dict = Depends(get_current_user)
):
    connection = get_db_connection()
    cursor = connection.cursor(dictionary=True)

    try:
        role = str(current_user.get("role", "")).lower()

        if role not in ("admin", "teacher", "student"):
            raise HTTPException(
                status_code=403,
                detail="You are not authorized to view notes"
            )

        # Students can see ONLY their own batch notes.
        if role == "student":

            student_id = current_user.get("student_id")

            if not student_id:
                raise HTTPException(
                    status_code=403,
                    detail="Student account is not linked to a student record"
                )

            cursor.execute(
                """
                SELECT batch_id
                FROM students
                WHERE student_id = %s
                """,
                (student_id,)
            )

            student = cursor.fetchone()

            if not student:
                raise HTTPException(
                    status_code=404,
                    detail="Student record not found"
                )

            batch_id = student["batch_id"]

        query = """
            SELECT
                n.note_id,
                n.subject_id,
                s.subject_name,
                s.subject_code,
                n.batch_id,
                b.batch_name,
                b.section,
                n.title,
                n.description,
                n.file_name,
                n.file_path,
                n.uploaded_by,
                n.uploaded_at
            FROM notes n
            JOIN subjects s
                ON n.subject_id = s.subject_id
            JOIN batches b
                ON n.batch_id = b.batch_id
            WHERE 1 = 1
        """

        params = []

        if batch_id is not None:
            query += " AND n.batch_id = %s"
            params.append(batch_id)

        if subject_id is not None:
            query += " AND n.subject_id = %s"
            params.append(subject_id)

        query += """
            ORDER BY
                n.uploaded_at DESC,
                n.title ASC
        """

        cursor.execute(query, tuple(params))
        return cursor.fetchall()

    finally:
        cursor.close()
        connection.close()


@app.post("/notes/upload")
async def upload_note(
    subject_id: int,
    batch_id: int,
    title: str,
    description: Optional[str] = None,
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    connection = get_db_connection()
    cursor = connection.cursor(dictionary=True)

    try:
        role = str(current_user.get("role", "")).lower()

        # Only Admin and Teacher can upload notes.
        if role not in ("admin", "teacher"):
            raise HTTPException(
                status_code=403,
                detail="Only Admin or Teacher can upload notes"
            )

        if not file.filename:
            raise HTTPException(
                status_code=400,
                detail="No file selected"
            )

        original_filename = Path(file.filename).name

        if Path(original_filename).suffix.lower() != ".pdf":
            raise HTTPException(
                status_code=400,
                detail="Only PDF files are allowed"
            )

        # Check subject.
        cursor.execute(
            """
            SELECT subject_id
            FROM subjects
            WHERE subject_id = %s
            """,
            (subject_id,)
        )

        subject = cursor.fetchone()

        if not subject:
            raise HTTPException(
                status_code=404,
                detail="Subject not found"
            )

        # Check batch.
        cursor.execute(
            """
            SELECT batch_id
            FROM batches
            WHERE batch_id = %s
            """,
            (batch_id,)
        )

        batch = cursor.fetchone()

        if not batch:
            raise HTTPException(
                status_code=404,
                detail="Batch not found"
            )

        # If teacher is uploading, verify they are eligible for the subject.
        if role == "teacher":

            teacher_id = current_user.get("teacher_id")

            if not teacher_id:
                raise HTTPException(
                    status_code=403,
                    detail="Teacher account is not linked to a teacher record"
                )

            cursor.execute(
                """
                SELECT 1
                FROM teacher_skills
                WHERE teacher_id = %s
                  AND subject_id = %s
                """,
                (teacher_id, subject_id)
            )

            if not cursor.fetchone():
                raise HTTPException(
                    status_code=403,
                    detail="You are not mapped to this subject"
                )

        file_content = await file.read()

        if not file_content:
            raise HTTPException(
                status_code=400,
                detail="Uploaded PDF is empty"
            )

        # Unique filename prevents accidental overwriting.
        stored_filename = (
            f"{uuid.uuid4().hex}_{original_filename}"
        )

        stored_path = NOTES_UPLOAD_DIR / stored_filename

        with open(stored_path, "wb") as output_file:
            output_file.write(file_content)

        uploaded_by = current_user.get("user_id")

        cursor_insert = connection.cursor()

        try:
            cursor_insert.execute(
                """
                INSERT INTO notes
                (
                    subject_id,
                    batch_id,
                    title,
                    description,
                    file_name,
                    file_path,
                    uploaded_by
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    subject_id,
                    batch_id,
                    title.strip(),
                    description.strip() if description else None,
                    original_filename,
                    str(stored_path),
                    uploaded_by
                )
            )

            connection.commit()

            note_id = cursor_insert.lastrowid

        except Exception:
            connection.rollback()

            if stored_path.exists():
                stored_path.unlink()

            raise

        finally:
            cursor_insert.close()

        return {
            "message": "Note uploaded successfully",
            "note_id": note_id,
            "subject_id": subject_id,
            "batch_id": batch_id,
            "title": title.strip(),
            "file_name": original_filename
        }

    except HTTPException:
        raise

    except Exception as e:
        connection.rollback()
        raise HTTPException(
            status_code=400,
            detail=str(e)
        )

    finally:
        cursor.close()
        connection.close()


@app.get("/notes/{note_id}/download")
def download_note(
    note_id: int,
    current_user: dict = Depends(get_current_user)
):
    connection = get_db_connection()
    cursor = connection.cursor(dictionary=True)

    try:
        role = str(current_user.get("role", "")).lower()

        if role not in ("admin", "teacher", "student"):
            raise HTTPException(
                status_code=403,
                detail="You are not authorized to download notes"
            )

        cursor.execute(
            """
            SELECT
                n.note_id,
                n.batch_id,
                n.file_name,
                n.file_path
            FROM notes n
            WHERE n.note_id = %s
            """,
            (note_id,)
        )

        note = cursor.fetchone()

        if not note:
            raise HTTPException(
                status_code=404,
                detail="Note not found"
            )

        # Student can download only their own batch notes.
        if role == "student":

            student_id = current_user.get("student_id")

            cursor.execute(
                """
                SELECT batch_id
                FROM students
                WHERE student_id = %s
                """,
                (student_id,)
            )

            student = cursor.fetchone()

            if not student:
                raise HTTPException(
                    status_code=404,
                    detail="Student record not found"
                )

            if student["batch_id"] != note["batch_id"]:
                raise HTTPException(
                    status_code=403,
                    detail="You cannot access this note"
                )

        file_path = Path(note["file_path"]).resolve()
        upload_root = NOTES_UPLOAD_DIR.resolve()

        # Prevent paths outside the notes folder.
        if upload_root not in file_path.parents:
            raise HTTPException(
                status_code=400,
                detail="Invalid file path"
            )

        if not file_path.is_file():
            raise HTTPException(
                status_code=404,
                detail="Note PDF file not found"
            )

        return FileResponse(
            path=str(file_path),
            media_type="application/pdf",
            filename=note["file_name"]
        )

    finally:
        cursor.close()
        connection.close()


# ============================================================
# PYQs
# ============================================================

@app.get("/pyqs")
def get_pyqs(
    batch_id: Optional[int] = None,
    subject_id: Optional[int] = None,
    exam_year: Optional[int] = None,
    current_user: dict = Depends(get_current_user)
):
    connection = get_db_connection()
    cursor = connection.cursor(dictionary=True)

    try:
        role = str(current_user.get("role", "")).lower()

        if role not in ("admin", "teacher", "student"):
            raise HTTPException(
                status_code=403,
                detail="You are not authorized to view PYQs"
            )

        # Students can see ONLY their own batch PYQs.
        if role == "student":

            student_id = current_user.get("student_id")

            if not student_id:
                raise HTTPException(
                    status_code=403,
                    detail="Student account is not linked to a student record"
                )

            cursor.execute(
                """
                SELECT batch_id
                FROM students
                WHERE student_id = %s
                """,
                (student_id,)
            )

            student = cursor.fetchone()

            if not student:
                raise HTTPException(
                    status_code=404,
                    detail="Student record not found"
                )

            batch_id = student["batch_id"]

        query = """
            SELECT
                p.pyq_id,
                p.subject_id,
                s.subject_name,
                s.subject_code,
                p.batch_id,
                b.batch_name,
                b.section,
                p.title,
                p.exam_year,
                p.description,
                p.file_name,
                p.file_path,
                p.uploaded_by,
                p.uploaded_at
            FROM pyqs p
            JOIN subjects s
                ON p.subject_id = s.subject_id
            JOIN batches b
                ON p.batch_id = b.batch_id
            WHERE 1 = 1
        """

        params = []

        if batch_id is not None:
            query += " AND p.batch_id = %s"
            params.append(batch_id)

        if subject_id is not None:
            query += " AND p.subject_id = %s"
            params.append(subject_id)

        if exam_year is not None:
            query += " AND p.exam_year = %s"
            params.append(exam_year)

        query += """
            ORDER BY
                p.exam_year DESC,
                p.uploaded_at DESC,
                p.title ASC
        """

        cursor.execute(query, tuple(params))
        return cursor.fetchall()

    finally:
        cursor.close()
        connection.close()


@app.post("/pyqs/upload")
async def upload_pyq(
    subject_id: int,
    batch_id: int,
    title: str,
    exam_year: Optional[int] = None,
    description: Optional[str] = None,
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    connection = get_db_connection()
    cursor = connection.cursor(dictionary=True)

    try:
        role = str(current_user.get("role", "")).lower()

        # Only Admin and Teacher can upload PYQs.
        if role not in ("admin", "teacher"):
            raise HTTPException(
                status_code=403,
                detail="Only Admin or Teacher can upload PYQs"
            )

        if not file.filename:
            raise HTTPException(
                status_code=400,
                detail="No file selected"
            )

        original_filename = Path(file.filename).name

        if Path(original_filename).suffix.lower() != ".pdf":
            raise HTTPException(
                status_code=400,
                detail="Only PDF files are allowed"
            )

        if exam_year is not None and (
            exam_year < 1900 or exam_year > 2100
        ):
            raise HTTPException(
                status_code=400,
                detail="Invalid exam year"
            )

        # Check subject.
        cursor.execute(
            """
            SELECT subject_id
            FROM subjects
            WHERE subject_id = %s
            """,
            (subject_id,)
        )

        subject = cursor.fetchone()

        if not subject:
            raise HTTPException(
                status_code=404,
                detail="Subject not found"
            )

        # Check batch.
        cursor.execute(
            """
            SELECT batch_id
            FROM batches
            WHERE batch_id = %s
            """,
            (batch_id,)
        )

        batch = cursor.fetchone()

        if not batch:
            raise HTTPException(
                status_code=404,
                detail="Batch not found"
            )

        # If teacher is uploading, verify subject mapping.
        if role == "teacher":

            teacher_id = current_user.get("teacher_id")

            if not teacher_id:
                raise HTTPException(
                    status_code=403,
                    detail="Teacher account is not linked to a teacher record"
                )

            cursor.execute(
                """
                SELECT 1
                FROM teacher_skills
                WHERE teacher_id = %s
                  AND subject_id = %s
                """,
                (teacher_id, subject_id)
            )

            if not cursor.fetchone():
                raise HTTPException(
                    status_code=403,
                    detail="You are not mapped to this subject"
                )

        file_content = await file.read()

        if not file_content:
            raise HTTPException(
                status_code=400,
                detail="Uploaded PDF is empty"
            )

        stored_filename = (
            f"{uuid.uuid4().hex}_{original_filename}"
        )

        stored_path = PYQS_UPLOAD_DIR / stored_filename

        with open(stored_path, "wb") as output_file:
            output_file.write(file_content)

        uploaded_by = current_user.get("user_id")

        cursor_insert = connection.cursor()

        try:
            cursor_insert.execute(
                """
                INSERT INTO pyqs
                (
                    subject_id,
                    batch_id,
                    title,
                    exam_year,
                    description,
                    file_name,
                    file_path,
                    uploaded_by
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    subject_id,
                    batch_id,
                    title.strip(),
                    exam_year,
                    description.strip() if description else None,
                    original_filename,
                    str(stored_path),
                    uploaded_by
                )
            )

            connection.commit()

            pyq_id = cursor_insert.lastrowid

        except Exception:
            connection.rollback()

            if stored_path.exists():
                stored_path.unlink()

            raise

        finally:
            cursor_insert.close()

        return {
            "message": "PYQ uploaded successfully",
            "pyq_id": pyq_id,
            "subject_id": subject_id,
            "batch_id": batch_id,
            "title": title.strip(),
            "exam_year": exam_year,
            "file_name": original_filename
        }

    except HTTPException:
        raise

    except Exception as e:
        connection.rollback()
        raise HTTPException(
            status_code=400,
            detail=str(e)
        )

    finally:
        cursor.close()
        connection.close()


@app.get("/pyqs/{pyq_id}/download")
def download_pyq(
    pyq_id: int,
    current_user: dict = Depends(get_current_user)
):
    connection = get_db_connection()
    cursor = connection.cursor(dictionary=True)

    try:
        role = str(current_user.get("role", "")).lower()

        if role not in ("admin", "teacher", "student"):
            raise HTTPException(
                status_code=403,
                detail="You are not authorized to download PYQs"
            )

        cursor.execute(
            """
            SELECT
                p.pyq_id,
                p.batch_id,
                p.file_name,
                p.file_path
            FROM pyqs p
            WHERE p.pyq_id = %s
            """,
            (pyq_id,)
        )

        pyq = cursor.fetchone()

        if not pyq:
            raise HTTPException(
                status_code=404,
                detail="PYQ not found"
            )

        # Student can download only their own batch PYQs.
        if role == "student":

            student_id = current_user.get("student_id")

            cursor.execute(
                """
                SELECT batch_id
                FROM students
                WHERE student_id = %s
                """,
                (student_id,)
            )

            student = cursor.fetchone()

            if not student:
                raise HTTPException(
                    status_code=404,
                    detail="Student record not found"
                )

            if student["batch_id"] != pyq["batch_id"]:
                raise HTTPException(
                    status_code=403,
                    detail="You cannot access this PYQ"
                )

        file_path = Path(pyq["file_path"]).resolve()
        upload_root = PYQS_UPLOAD_DIR.resolve()

        # Prevent paths outside the PYQ folder.
        if upload_root not in file_path.parents:
            raise HTTPException(
                status_code=400,
                detail="Invalid file path"
            )

        if not file_path.is_file():
            raise HTTPException(
                status_code=404,
                detail="PYQ PDF file not found"
            )

        return FileResponse(
            path=str(file_path),
            media_type="application/pdf",
            filename=pyq["file_name"]
        )

    finally:
        cursor.close()
        connection.close()


# ==================== SYLLABUS PROGRESS ====================

@app.get("/syllabus-progress")
def get_syllabus_progress():
    connection = get_db_connection()
    cursor = connection.cursor(dictionary=True)

    cursor.execute("""
        SELECT
            sp.progress_id,
            sp.semester,
            sp.total_units,
            sp.completed_units,
            sp.last_updated,
            s.subject_id,
            s.subject_name,
            s.subject_code,
            t.teacher_id,
            t.teacher_name
        FROM syllabus_progress sp
        JOIN subjects s
            ON sp.subject_id = s.subject_id
        JOIN teachers t
            ON sp.teacher_id = t.teacher_id
        ORDER BY sp.semester, s.subject_name
    """)

    progress = cursor.fetchall()

    cursor.close()
    connection.close()

    return progress


@app.post("/syllabus-progress")
def create_syllabus_progress(
    subject_id: int,
    teacher_id: int,
    semester: int,
    total_units: int,
    completed_units: int,
    last_updated: str
):
    connection = get_db_connection()
    cursor = connection.cursor()

    try:
        cursor.execute(
            """
            INSERT INTO syllabus_progress
            (subject_id, teacher_id, semester, total_units,
             completed_units, last_updated)
            VALUES (%s, %s, %s, %s, %s, %s)
            """,
            (
                subject_id,
                teacher_id,
                semester,
                total_units,
                completed_units,
                last_updated
            )
        )

        connection.commit()

        progress_id = cursor.lastrowid

        return {
            "message": "Syllabus progress created successfully",
            "progress_id": progress_id,
            "subject_id": subject_id,
            "teacher_id": teacher_id,
            "semester": semester,
            "total_units": total_units,
            "completed_units": completed_units,
            "last_updated": last_updated
        }

    except Exception as e:
        connection.rollback()
        raise HTTPException(
            status_code=400,
            detail=str(e)
        )

    finally:
        cursor.close()
        connection.close()


@app.put("/syllabus-progress/{progress_id}")
def update_syllabus_progress(
    progress_id: int,
    subject_id: int,
    teacher_id: int,
    semester: int,
    total_units: int,
    completed_units: int,
    last_updated: str
):
    connection = get_db_connection()
    cursor = connection.cursor()

    try:
        cursor.execute(
            """
            UPDATE syllabus_progress
            SET subject_id = %s,
                teacher_id = %s,
                semester = %s,
                total_units = %s,
                completed_units = %s,
                last_updated = %s
            WHERE progress_id = %s
            """,
            (
                subject_id,
                teacher_id,
                semester,
                total_units,
                completed_units,
                last_updated,
                progress_id
            )
        )

        if cursor.rowcount == 0:
            raise HTTPException(
                status_code=404,
                detail="Syllabus progress not found"
            )

        connection.commit()

        return {
            "message": "Syllabus progress updated successfully",
            "progress_id": progress_id,
            "subject_id": subject_id,
            "teacher_id": teacher_id,
            "semester": semester,
            "total_units": total_units,
            "completed_units": completed_units,
            "last_updated": last_updated
        }

    except HTTPException:
        connection.rollback()
        raise

    except Exception as e:
        connection.rollback()
        raise HTTPException(
            status_code=400,
            detail=str(e)
        )

    finally:
        cursor.close()
        connection.close()


@app.delete("/syllabus-progress/{progress_id}")
def delete_syllabus_progress(progress_id: int):
    connection = get_db_connection()
    cursor = connection.cursor()

    try:
        cursor.execute(
            "DELETE FROM syllabus_progress WHERE progress_id = %s",
            (progress_id,)
        )

        if cursor.rowcount == 0:
            raise HTTPException(
                status_code=404,
                detail="Syllabus progress not found"
            )

        connection.commit()

        return {
            "message": "Syllabus progress deleted successfully",
            "progress_id": progress_id
        }

    except HTTPException:
        connection.rollback()
        raise

    except Exception as e:
        connection.rollback()
        raise HTTPException(
            status_code=400,
            detail=str(e)
        )

    finally:
        cursor.close()
        connection.close()


# ==================== PROJECT GUIDES ====================

@app.get("/project-guides")
def get_project_guides():
    connection = get_db_connection()
    cursor = connection.cursor(dictionary=True)

    cursor.execute("""
        SELECT
            pg.project_id,
            pg.project_title,
            pg.project_status,
            pg.assigned_date,
            s.student_id,
            s.student_name,
            s.roll_number,
            t.teacher_id AS guide_teacher_id,
            t.teacher_name AS guide_teacher
        FROM project_guides pg
        JOIN students s
            ON pg.student_id = s.student_id
        JOIN teachers t
            ON pg.guide_teacher_id = t.teacher_id
        ORDER BY pg.assigned_date DESC
    """)

    projects = cursor.fetchall()

    cursor.close()
    connection.close()

    return projects


@app.post("/project-guides")
def create_project_guide(
    student_id: int,
    guide_teacher_id: int,
    project_title: str,
    project_status: str,
    assigned_date: str
):
    connection = get_db_connection()
    cursor = connection.cursor()

    try:
        cursor.execute(
            """
            INSERT INTO project_guides
            (
                student_id,
                guide_teacher_id,
                project_title,
                project_status,
                assigned_date
            )
            VALUES (%s, %s, %s, %s, %s)
            """,
            (
                student_id,
                guide_teacher_id,
                project_title,
                project_status,
                assigned_date
            )
        )

        connection.commit()

        project_id = cursor.lastrowid

        return {
            "message": "Project guide created successfully",
            "project_id": project_id,
            "student_id": student_id,
            "guide_teacher_id": guide_teacher_id,
            "project_title": project_title,
            "project_status": project_status,
            "assigned_date": assigned_date
        }

    except Exception as e:
        connection.rollback()
        raise HTTPException(
            status_code=400,
            detail=str(e)
        )

    finally:
        cursor.close()
        connection.close()


@app.put("/project-guides/{project_id}")
def update_project_guide(
    project_id: int,
    student_id: int,
    guide_teacher_id: int,
    project_title: str,
    project_status: str,
    assigned_date: str
):
    connection = get_db_connection()
    cursor = connection.cursor()

    try:
        cursor.execute(
            """
            UPDATE project_guides
            SET student_id = %s,
                guide_teacher_id = %s,
                project_title = %s,
                project_status = %s,
                assigned_date = %s
            WHERE project_id = %s
            """,
            (
                student_id,
                guide_teacher_id,
                project_title,
                project_status,
                assigned_date,
                project_id
            )
        )

        if cursor.rowcount == 0:
            raise HTTPException(
                status_code=404,
                detail="Project guide not found"
            )

        connection.commit()

        return {
            "message": "Project guide updated successfully",
            "project_id": project_id,
            "student_id": student_id,
            "guide_teacher_id": guide_teacher_id,
            "project_title": project_title,
            "project_status": project_status,
            "assigned_date": assigned_date
        }

    except HTTPException:
        connection.rollback()
        raise

    except Exception as e:
        connection.rollback()
        raise HTTPException(
            status_code=400,
            detail=str(e)
        )

    finally:
        cursor.close()
        connection.close()


@app.delete("/project-guides/{project_id}")
def delete_project_guide(project_id: int):
    connection = get_db_connection()
    cursor = connection.cursor()

    try:
        cursor.execute(
            "DELETE FROM project_guides WHERE project_id = %s",
            (project_id,)
        )

        if cursor.rowcount == 0:
            raise HTTPException(
                status_code=404,
                detail="Project guide not found"
            )

        connection.commit()

        return {
            "message": "Project guide deleted successfully",
            "project_id": project_id
        }

    except HTTPException:
        connection.rollback()
        raise

    except Exception as e:
        connection.rollback()
        raise HTTPException(
            status_code=400,
            detail=str(e)
        )

    finally:
        cursor.close()
        connection.close()

# ==================== BATCHES ====================

@app.get("/batches")
def get_batches():
    connection = get_db_connection()
    cursor = connection.cursor(dictionary=True)

    try:
        cursor.execute("""
            SELECT
                b.batch_id,
                b.batch_name,
                b.department_id,
                d.department_name,
                b.semester,
                b.section
            FROM batches b
            JOIN departments d
                ON b.department_id = d.department_id
            ORDER BY b.batch_id
        """)

        batches = cursor.fetchall()

        return batches

    finally:
        cursor.close()
        connection.close()


@app.get("/batches/{batch_id}")
def get_batch(batch_id: int):
    connection = get_db_connection()
    cursor = connection.cursor(dictionary=True)

    try:
        cursor.execute("""
            SELECT
                b.batch_id,
                b.batch_name,
                b.department_id,
                d.department_name,
                b.semester,
                b.section
            FROM batches b
            JOIN departments d
                ON b.department_id = d.department_id
            WHERE b.batch_id = %s
        """, (batch_id,))

        batch = cursor.fetchone()

        if not batch:
            raise HTTPException(
                status_code=404,
                detail="Batch not found"
            )

        return batch

    finally:
        cursor.close()
        connection.close()


@app.post("/batches")
def create_batch(
    batch_name: str,
    department_id: int,
    semester: int,
    section: str = None
):
    connection = get_db_connection()
    cursor = connection.cursor()

    try:
        cursor.execute(
            """
            INSERT INTO batches
            (batch_name, department_id, semester, section)
            VALUES (%s, %s, %s, %s)
            """,
            (
                batch_name,
                department_id,
                semester,
                section
            )
        )

        connection.commit()

        batch_id = cursor.lastrowid

        return {
            "message": "Batch created successfully",
            "batch_id": batch_id,
            "batch_name": batch_name,
            "department_id": department_id,
            "semester": semester,
            "section": section
        }

    except Exception as e:
        connection.rollback()

        raise HTTPException(
            status_code=400,
            detail=str(e)
        )

    finally:
        cursor.close()
        connection.close()


@app.put("/batches/{batch_id}")
def update_batch(
    batch_id: int,
    batch_name: str,
    department_id: int,
    semester: int,
    section: str = None
):
    connection = get_db_connection()
    cursor = connection.cursor()

    try:
        cursor.execute(
            """
            UPDATE batches
            SET batch_name = %s,
                department_id = %s,
                semester = %s,
                section = %s
            WHERE batch_id = %s
            """,
            (
                batch_name,
                department_id,
                semester,
                section,
                batch_id
            )
        )

        if cursor.rowcount == 0:
            raise HTTPException(
                status_code=404,
                detail="Batch not found"
            )

        connection.commit()

        return {
            "message": "Batch updated successfully",
            "batch_id": batch_id,
            "batch_name": batch_name,
            "department_id": department_id,
            "semester": semester,
            "section": section
        }

    except HTTPException:
        connection.rollback()
        raise

    except Exception as e:
        connection.rollback()

        raise HTTPException(
            status_code=400,
            detail=str(e)
        )

    finally:
        cursor.close()
        connection.close()


@app.delete("/batches/{batch_id}")
def delete_batch(batch_id: int):
    connection = get_db_connection()
    cursor = connection.cursor()

    try:
        cursor.execute(
            "DELETE FROM batches WHERE batch_id = %s",
            (batch_id,)
        )

        if cursor.rowcount == 0:
            raise HTTPException(
                status_code=404,
                detail="Batch not found"
            )

        connection.commit()

        return {
            "message": "Batch deleted successfully",
            "batch_id": batch_id
        }

    except HTTPException:
        connection.rollback()
        raise

    except Exception as e:
        connection.rollback()

        raise HTTPException(
            status_code=400,
            detail=str(e)
        )

    finally:
        cursor.close()
        connection.close()



# ==================== HOLIDAYS ====================

@app.get("/holidays")
def get_holidays():
    connection = get_db_connection()
    cursor = connection.cursor(dictionary=True)

    try:
        cursor.execute("SELECT * FROM holidays ORDER BY holiday_date ASC")
        holidays = cursor.fetchall()
        return holidays
    finally:
        cursor.close()
        connection.close()


@app.get("/holidays/notifications")
def get_holiday_notifications(upcoming_days: int = 7):
    """
    Powers the auto-detect banner on every dashboard:
      - today: holiday(s) covering today (holiday_date <= today <= end_date,
               where a single-day holiday's end_date is treated as equal
               to its holiday_date)
      - upcoming: holidays whose holiday_date falls in the next
                  `upcoming_days` days (today's own holidays excluded —
                  those are already in `today`)
    """
    connection = get_db_connection()
    cursor = connection.cursor(dictionary=True)

    try:
        today = datetime.now().date()
        horizon = today + timedelta(days=upcoming_days)

        cursor.execute(
            """
            SELECT * FROM holidays
            WHERE %s BETWEEN holiday_date AND COALESCE(end_date, holiday_date)
            ORDER BY holiday_date
            """,
            (today,)
        )
        today_holidays = cursor.fetchall()

        cursor.execute(
            """
            SELECT * FROM holidays
            WHERE holiday_date > %s AND holiday_date <= %s
            ORDER BY holiday_date
            """,
            (today, horizon)
        )
        upcoming_holidays = cursor.fetchall()

        for h in today_holidays + upcoming_holidays:
            h["holiday_date"] = h["holiday_date"].strftime("%Y-%m-%d")
            if h.get("end_date"):
                h["end_date"] = h["end_date"].strftime("%Y-%m-%d")
            days_until = (
                datetime.strptime(h["holiday_date"], "%Y-%m-%d").date() - today
            ).days
            h["days_until"] = days_until

        return {
            "today_date": today.strftime("%Y-%m-%d"),
            "today_holidays": today_holidays,
            "upcoming_holidays": upcoming_holidays,
        }
    finally:
        cursor.close()
        connection.close()


@app.post("/holidays")
async def create_holiday(
    holiday_name: str,
    holiday_date: str,
    end_date: Optional[str] = None,
    description: str = None
):
    connection = get_db_connection()
    cursor = connection.cursor()

    try:
        cursor.execute(
            """
            INSERT INTO holidays
            (holiday_name, holiday_date, end_date, description)
            VALUES (%s, %s, %s, %s)
            """,
            (holiday_name, holiday_date, end_date, description)
        )

        connection.commit()

        holiday_id = cursor.lastrowid
        await create_notification("Holiday Announced", f"{holiday_name} on {holiday_date}",
                 audience="all", notif_type="info")

        return {
            "message": "Holiday created successfully",
            "holiday_id": holiday_id,
            "holiday_name": holiday_name,
            "holiday_date": holiday_date,
            "end_date": end_date,
            "description": description
        }

    except Exception as e:
        connection.rollback()
        raise HTTPException(status_code=400, detail=str(e))

    finally:
        cursor.close()
        connection.close()


@app.put("/holidays/{holiday_id}")
def update_holiday(
    holiday_id: int,
    holiday_name: str,
    holiday_date: str,
    end_date: Optional[str] = None,
    description: str = None
):
    """
    end_date is optional here on purpose: your existing Holidays.jsx form
    doesn't send it, so a plain edit from that page won't accidentally
    wipe out a multi-day range that was set via SQL or a future
    date-range-aware form — it just leaves end_date as whatever it
    already was.
    """
    connection = get_db_connection()
    cursor = connection.cursor()

    try:
        if end_date is not None:
            cursor.execute(
                """
                UPDATE holidays
                SET holiday_name = %s,
                    holiday_date = %s,
                    end_date = %s,
                    description = %s
                WHERE holiday_id = %s
                """,
                (holiday_name, holiday_date, end_date, description, holiday_id)
            )
        else:
            cursor.execute(
                """
                UPDATE holidays
                SET holiday_name = %s,
                    holiday_date = %s,
                    description = %s
                WHERE holiday_id = %s
                """,
                (holiday_name, holiday_date, description, holiday_id)
            )

        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Holiday not found")

        connection.commit()

        return {
            "message": "Holiday updated successfully",
            "holiday_id": holiday_id,
            "holiday_name": holiday_name,
            "holiday_date": holiday_date,
            "description": description
        }

    except HTTPException:
        connection.rollback()
        raise

    except Exception as e:
        connection.rollback()
        raise HTTPException(status_code=400, detail=str(e))

    finally:
        cursor.close()
        connection.close()


@app.delete("/holidays/{holiday_id}")
def delete_holiday(holiday_id: int):
    connection = get_db_connection()
    cursor = connection.cursor()

    try:
        cursor.execute(
            "DELETE FROM holidays WHERE holiday_id = %s",
            (holiday_id,)
        )

        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Holiday not found")

        connection.commit()

        return {
            "message": "Holiday deleted successfully",
            "holiday_id": holiday_id
        }

    except HTTPException:
        connection.rollback()
        raise

    except Exception as e:
        connection.rollback()
        raise HTTPException(status_code=400, detail=str(e))

    finally:
        cursor.close()
        connection.close()


# ==================== EVENTS ====================

@app.get("/events")
def get_events():
    connection = get_db_connection()
    cursor = connection.cursor(dictionary=True)

    try:
        cursor.execute("SELECT * FROM events ORDER BY event_date ASC")
        events = cursor.fetchall()
        return events
    finally:
        cursor.close()
        connection.close()


@app.post("/events")
async def create_event(
    event_name: str,
    event_date: str,
    event_time: str = None,
    location: str = None,
    description: str = None
):
    connection = get_db_connection()
    cursor = connection.cursor()

    try:
        cursor.execute(
            """
            INSERT INTO events
            (event_name, event_date, event_time, location, description)
            VALUES (%s, %s, %s, %s, %s)
            """,
            (event_name, event_date, event_time, location, description)
        )

        connection.commit()

        event_id = cursor.lastrowid        
        await create_notification("Event Announced", f"{event_name} on {event_date}",
                 audience="all", notif_type="info")
                

        return {
            "message": "Event created successfully",
            "event_id": event_id,
            "event_name": event_name,
            "event_date": event_date,
            "event_time": event_time,
            "location": location,
            "description": description
        }

    except Exception as e:
        connection.rollback()
        raise HTTPException(status_code=400, detail=str(e))

    finally:
        cursor.close()
        connection.close()


@app.put("/events/{event_id}")
def update_event(
    event_id: int,
    event_name: str,
    event_date: str,
    event_time: str = None,
    location: str = None,
    description: str = None
):
    connection = get_db_connection()
    cursor = connection.cursor()

    try:
        cursor.execute(
            """
            UPDATE events
            SET event_name = %s,
                event_date = %s,
                event_time = %s,
                location = %s,
                description = %s
            WHERE event_id = %s
            """,
            (event_name, event_date, event_time, location, description, event_id)
        )

        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Event not found")

        connection.commit()

        return {
            "message": "Event updated successfully",
            "event_id": event_id,
            "event_name": event_name,
            "event_date": event_date,
            "event_time": event_time,
            "location": location,
            "description": description
        }

    except HTTPException:
        connection.rollback()
        raise

    except Exception as e:
        connection.rollback()
        raise HTTPException(status_code=400, detail=str(e))

    finally:
        cursor.close()
        connection.close()


@app.delete("/events/{event_id}")
def delete_event(event_id: int):
    connection = get_db_connection()
    cursor = connection.cursor()

    try:
        cursor.execute(
            "DELETE FROM events WHERE event_id = %s",
            (event_id,)
        )

        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Event not found")

        connection.commit()

        return {
            "message": "Event deleted successfully",
            "event_id": event_id
        }

    except HTTPException:
        connection.rollback()
        raise

    except Exception as e:
        connection.rollback()
        raise HTTPException(status_code=400, detail=str(e))

    finally:
        cursor.close()
        connection.close()

# ==================== Notification history ====================

@app.get("/notifications")
def get_notifications(role: str = "all", limit: int = 30):
    """
    Returns recent notifications for the selected role.
    """
    connection = get_db_connection()
    cursor = connection.cursor(dictionary=True)

    try:
        if role == "all":
            cursor.execute(
                """
                SELECT *
                FROM notifications
                ORDER BY created_at DESC
                LIMIT %s
                """,
                (limit,)
            )
        else:
            cursor.execute(
                """
                SELECT *
                FROM notifications
                WHERE audience IN ('all', %s)
                ORDER BY created_at DESC
                LIMIT %s
                """,
                (role, limit)
            )

        rows = cursor.fetchall()

        for r in rows:
            if r["created_at"]:
                r["created_at"] = r["created_at"].strftime(
                    "%Y-%m-%d %H:%M:%S"
                )

        return rows

    finally:
        cursor.close()
        connection.close()


# ==================== AUTH: request models ====================

class SignupRequest(BaseModel):
    name: str
    email: str
    password: str
    role: str
    teacher_id: int | None = None
    student_id: int | None = None
    roll_number: str | None = None

class LoginRequest(BaseModel):
    email: str
    password: str

# ==================== AUTH: endpoints ====================

@app.post("/signup")
def signup(payload: SignupRequest):
    if payload.role not in ("admin", "teacher", "student"):
        raise HTTPException(status_code=400, detail="Invalid role")

    # Teacher account
    if payload.role == "teacher" and not payload.teacher_id:
        raise HTTPException(
            status_code=400,
            detail="teacher_id is required for a teacher account"
        )

    # Student account
    if payload.role == "student" and not payload.roll_number:
        raise HTTPException(
            status_code=400,
            detail="roll_number is required for a student account"
        )

    connection = get_db_connection()
    cursor = connection.cursor(dictionary=True)

    try:
        # Check email
        cursor.execute(
            "SELECT user_id FROM users WHERE email = %s",
            (payload.email,)
        )

        if cursor.fetchone():
            raise HTTPException(
                status_code=400,
                detail="Email already registered"
            )

        # Student: find student_id using roll_number
        student_id = None

        if payload.role == "student":
            cursor.execute(
                """
                SELECT student_id
                FROM students
                WHERE roll_number = %s
                """,
                (payload.roll_number.strip(),)
            )

            student = cursor.fetchone()

            if not student:
                raise HTTPException(
                    status_code=400,
                    detail="No student found with this roll number"
                )

            student_id = student["student_id"]

            # Check whether this student already has an account
            cursor.execute(
                """
                SELECT user_id
                FROM users
                WHERE student_id = %s
                """,
                (student_id,)
            )

            if cursor.fetchone():
                raise HTTPException(
                    status_code=400,
                    detail="This student already has an account"
                )

        # Teacher: check whether teacher already has an account
        if payload.role == "teacher":
            cursor.execute(
                """
                SELECT user_id
                FROM users
                WHERE teacher_id = %s
                """,
                (payload.teacher_id,)
            )

            if cursor.fetchone():
                raise HTTPException(
                    status_code=400,
                    detail="This teacher already has an account"
                )

        hashed = hash_password(payload.password)

        insert_cursor = connection.cursor()

        insert_cursor.execute(
            """
            INSERT INTO users
            (name, email, password_hash, role, teacher_id, student_id)
            VALUES (%s, %s, %s, %s, %s, %s)
            """,
            (
                payload.name.strip(),
                payload.email.strip(),
                hashed,
                payload.role,
                payload.teacher_id if payload.role == "teacher" else None,
                student_id if payload.role == "student" else None,
            )
        )

        connection.commit()

        return {
            "message": "Account created successfully"
        }

    except HTTPException:
        connection.rollback()
        raise

    except Exception as e:
        connection.rollback()
        print("Signup error:", e)

        raise HTTPException(
            status_code=500,
            detail="Unable to create account"
        )

    finally:
        cursor.close()
        connection.close()

@app.post("/login")
def login(payload: LoginRequest):
    connection = get_db_connection()
    cursor = connection.cursor(dictionary=True)

    cursor.execute("SELECT * FROM users WHERE email = %s", (payload.email,))
    user = cursor.fetchone()

    cursor.close()
    connection.close()

    if not user or not verify_password(payload.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Incorrect email or password")

    token = create_access_token({"user_id": user["user_id"], "role": user["role"]})

    return {
        "access_token": token,
        "token_type": "bearer",
        "role": user["role"],
        "name": user["name"],
        "user_id": user["user_id"],
        "teacher_id": user["teacher_id"],
        "student_id": user["student_id"],
    }


@app.get("/me")
def get_me(current_user: dict = Depends(get_current_user)):
    """Quick way to check if a token is valid and who it belongs to."""
    return current_user
