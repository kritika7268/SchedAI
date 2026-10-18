from pathlib import Path
import uuid

from fastapi import HTTPException, UploadFile

MAX_UPLOAD_MB = 20
_CHUNK = 1024 * 1024


async def read_valid_pdf(file: UploadFile):
    """Returns (original_filename, bytes). Raises 400 if the file is not a real PDF."""
    if not file or not file.filename:
        raise HTTPException(status_code=400, detail="No file selected")

    original = Path(file.filename).name
    if Path(original).suffix.lower() != ".pdf":
        raise HTTPException(status_code=400, detail="Only PDF files are allowed")

    limit = MAX_UPLOAD_MB * 1024 * 1024
    data = bytearray()
    while True:
        chunk = await file.read(_CHUNK)
        if not chunk:
            break
        data.extend(chunk)
        if len(data) > limit:
            raise HTTPException(
                status_code=400, detail=f"File is larger than {MAX_UPLOAD_MB} MB")

    if not data:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")
    if not data.startswith(b"%PDF-"):
        raise HTTPException(
            status_code=400, detail="This file is not a valid PDF (it only has a .pdf name)")

    return original, bytes(data)


def save_pdf(data: bytes, dest_dir: Path) -> Path:
    path = dest_dir / f"{uuid.uuid4().hex}.pdf"
    path.write_bytes(data)
    return path


def check_subject_matches_batch(cursor, subject_id: int, batch_id: int):
    """404 if missing; 400 if the subject does not belong to this batch's semester/department."""
    cursor.execute(
        "SELECT * FROM subjects WHERE subject_id = %s", (subject_id,))
    subject = cursor.fetchone()
    if not subject:
        raise HTTPException(status_code=404, detail="Subject not found")

    cursor.execute(
        "SELECT batch_id, batch_name, department_id, semester FROM batches WHERE batch_id = %s",
        (batch_id,))
    batch = cursor.fetchone()
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")

    s_sem, b_sem = subject.get("semester"), batch.get("semester")
    if s_sem is not None and b_sem is not None and int(s_sem) != int(b_sem):
        raise HTTPException(
            status_code=400,
            detail=f"This subject is for Semester {s_sem}, but {batch['batch_name']} is Semester {b_sem}.")

    s_dep, b_dep = subject.get("department_id"), batch.get("department_id")
    if s_dep is not None and b_dep is not None and s_dep != b_dep:
        raise HTTPException(
            status_code=400, detail="This subject belongs to a different department than the batch.")

    s_batch = subject.get("batch_id")
    if s_batch is not None and s_batch != batch_id:
        raise HTTPException(
            status_code=400, detail="This subject is assigned to a different batch.")

    return subject, batch


def check_teacher_owns_subject(cursor, teacher_id: int, subject_id: int):
    cursor.execute(
        "SELECT 1 FROM teacher_skills WHERE teacher_id = %s AND subject_id = %s",
        (teacher_id, subject_id))
    if not cursor.fetchone():
        raise HTTPException(status_code=403, detail="You can upload only for your own subjects")