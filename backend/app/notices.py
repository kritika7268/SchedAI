"""SchedAI - notices.py : teachers post notices (text, links, photo); admin and students read only."""
import uuid
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse

from app.auth import require_role
from app.database import get_db_connection
from app.notify import notify

router = APIRouter(prefix="/notices", tags=["Notices"])

NOTICE_DIR = Path(__file__).resolve().parent.parent / "uploads" / "notices"
NOTICE_DIR.mkdir(parents=True, exist_ok=True)

MAX_IMAGE_MB = 5
IMAGE_TYPES = {
    ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
    ".webp": "image/webp", ".gif": "image/gif",
}


def _looks_like_image(data: bytes, ext: str) -> bool:
    if ext in (".jpg", ".jpeg"):
        return data.startswith(b"\xff\xd8\xff")
    if ext == ".png":
        return data.startswith(b"\x89PNG\r\n\x1a\n")
    if ext == ".gif":
        return data.startswith(b"GIF8")
    if ext == ".webp":
        return data[:4] == b"RIFF" and data[8:12] == b"WEBP"
    return False


@router.post("")
async def create_notice(
    title: str = Form(...),
    body: str = Form(...),
    image: Optional[UploadFile] = File(None),
    user: dict = Depends(require_role("teacher")),
):
    teacher_id = user.get("teacher_id")
    if not teacher_id:
        raise HTTPException(403, "This account is not linked to a teacher record.")

    title, body = title.strip(), body.strip()
    if not title or not body:
        raise HTTPException(400, "Title and notice text are required.")
    if len(title) > 200:
        raise HTTPException(400, "Title can be at most 200 characters.")
    if len(body) > 5000:
        raise HTTPException(400, "Notice text can be at most 5000 characters.")

    stored = None
    if image is not None and image.filename:
        ext = Path(image.filename).suffix.lower()
        if ext not in IMAGE_TYPES:
            raise HTTPException(400, "Only JPG, PNG, WEBP or GIF images are allowed.")
        data = await image.read(MAX_IMAGE_MB * 1024 * 1024 + 1)
        if not data:
            raise HTTPException(400, "The image file is empty.")
        if len(data) > MAX_IMAGE_MB * 1024 * 1024:
            raise HTTPException(400, f"Image is larger than {MAX_IMAGE_MB} MB.")
        if not _looks_like_image(data, ext):
            raise HTTPException(400, "This file is not a valid image.")
        stored = f"{uuid.uuid4().hex}{ext}"
        (NOTICE_DIR / stored).write_bytes(data)

    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute(
            "INSERT INTO notices (teacher_id, title, body, image_file) VALUES (%s, %s, %s, %s)",
            (teacher_id, title, body, stored))
        conn.commit()
        notice_id = cur.lastrowid
    except Exception as e:
        conn.rollback()
        if stored:
            (NOTICE_DIR / stored).unlink(missing_ok=True)
        raise HTTPException(400, str(e))
    finally:
        cur.close()
        conn.close()

    await notify(f"New notice: {title}", f"Posted by {user.get('name', 'a teacher')}.", "all", "info")
    return {"message": "Notice posted", "notice_id": notice_id}


@router.get("")
def list_notices(user: dict = Depends(require_role("teacher", "admin", "student"))):
    conn = get_db_connection()
    cur = conn.cursor(dictionary=True)
    try:
        cur.execute(
            """SELECT n.notice_id, n.teacher_id, t.teacher_name, n.title, n.body,
                      (n.image_file IS NOT NULL) AS has_image, n.created_at
               FROM notices n LEFT JOIN teachers t ON n.teacher_id = t.teacher_id
               ORDER BY n.created_at DESC, n.notice_id DESC LIMIT 100""")
        rows = cur.fetchall()
        for r in rows:
            r["has_image"] = bool(r["has_image"])
            r["created_at"] = r["created_at"].strftime("%Y-%m-%d %H:%M:%S") if r["created_at"] else None
        return rows
    finally:
        cur.close()
        conn.close()


@router.get("/{notice_id}/image")
def notice_image(notice_id: int, user: dict = Depends(require_role("teacher", "admin", "student"))):
    conn = get_db_connection()
    cur = conn.cursor(dictionary=True)
    try:
        cur.execute("SELECT image_file FROM notices WHERE notice_id = %s", (notice_id,))
        row = cur.fetchone()
    finally:
        cur.close()
        conn.close()
    if not row or not row["image_file"]:
        raise HTTPException(404, "No image for this notice.")
    path = NOTICE_DIR / row["image_file"]
    if not path.is_file():
        raise HTTPException(404, "Image file is missing on the server.")
    return FileResponse(str(path), media_type=IMAGE_TYPES.get(path.suffix.lower(), "application/octet-stream"))


@router.delete("/{notice_id}")
def delete_notice(notice_id: int, user: dict = Depends(require_role("teacher"))):
    conn = get_db_connection()
    cur = conn.cursor(dictionary=True)
    try:
        cur.execute("SELECT teacher_id, image_file FROM notices WHERE notice_id = %s", (notice_id,))
        row = cur.fetchone()
        if not row:
            raise HTTPException(404, "Notice not found.")
        if row["teacher_id"] != user.get("teacher_id"):
            raise HTTPException(403, "You can delete only your own notices.")
        cur.execute("DELETE FROM notices WHERE notice_id = %s", (notice_id,))
        conn.commit()
    except HTTPException:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()
    if row["image_file"]:
        (NOTICE_DIR / row["image_file"]).unlink(missing_ok=True)
    return {"message": "Notice deleted"}