import re
from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.database import get_db_connection
from app.auth import get_current_user, require_role

router = APIRouter(prefix="/project-guides", tags=["Project Guides"])

# ------------------------------------------------------------
# RULES (sirf yahin badalna hai)
# ------------------------------------------------------------
# Kis batch ko project milta hai
PROJECT_RULES = {
    "BCA": {5: "mini", 6: "major"},
}

# Ye teachers guide nahi bante. Naam mein ye shabd aaye to bahar.
# (spelling ka farq na pade isliye sirf pehla naam rakha hai)
EXCLUDED_GUIDE_KEYWORDS = ["shivangi", "sunny"]


def program_of(batch_name: str):
    """'BCA-5A' -> 'BCA', 'BCA DS 5A' -> 'BCA DS'."""
    c = re.sub(r"[^A-Z0-9]", "", (batch_name or "").upper())
    if c.startswith("BCADS"):
        return "BCA DS"
    if c.startswith("BCA"):
        return "BCA"
    if c.startswith("MCADS"):
        return "MCA DS"
    if c.startswith("MCA"):
        return "MCA"
    return None


def project_type_for(batch_name: str, semester):
    """'mini' / 'major', ya None agar is batch mein project nahi hota."""
    try:
        sem = int(semester)
    except (TypeError, ValueError):
        return None
    return PROJECT_RULES.get(program_of(batch_name), {}).get(sem)


def is_excluded_guide(teacher_name: str) -> bool:
    n = (teacher_name or "").lower()
    return any(k in n for k in EXCLUDED_GUIDE_KEYWORDS)


def get_eligible_guides(cur):
    """Saare teachers, sif excluded wale chhodkar."""
    cur.execute("SELECT teacher_id, teacher_name FROM teachers ORDER BY teacher_id")
    return [t for t in cur.fetchall() if not is_excluded_guide(t["teacher_name"])]


# ------------------------------------------------------------
# CORE: batch ke students ko eligible guides mein barabar baantna
# ------------------------------------------------------------
def auto_assign_for_batch(conn, batch_id: int, reset: bool = False):
    """
    - Batch eligible nahi (BCA 5/6 ke alawa)  -> None
    - Koi eligible guide nahi                  -> {"skipped": "..."}
    - reset=False: sirf bina-guide wale students; kam load wale guide ko pehle.
    - reset=True : poore batch ko dobara barabar baantta hai (title/status safe).
    """
    cur = conn.cursor(dictionary=True)
    try:
        cur.execute(
            "SELECT batch_id, batch_name, semester FROM batches WHERE batch_id = %s",
            (batch_id,))
        b = cur.fetchone()
        if not b:
            return None
        ptype = project_type_for(b["batch_name"], b["semester"])
        if not ptype:
            return None

        guides = get_eligible_guides(cur)
        if not guides:
            return {"skipped": "No eligible guide teacher found."}
        names = {g["teacher_id"]: g["teacher_name"] for g in guides}

        cur.execute(
            """SELECT s.student_id, s.student_name, pg.project_id, pg.guide_teacher_id
               FROM students s
               LEFT JOIN project_guides pg
                      ON pg.student_id = s.student_id AND pg.semester = %s
               WHERE s.batch_id = %s
               ORDER BY s.roll_number""", (b["semester"], batch_id))
        students = cur.fetchall()

        load = {tid: 0 for tid in names}
        if not reset:
            for s in students:
                if s["project_id"] and s["guide_teacher_id"] in load:
                    load[s["guide_teacher_id"]] += 1

        w = conn.cursor()
        assigned = 0
        for s in students:
            if s["project_id"] and not reset:
                # pehle se guide hai. Sirf tab chhodo jab wo eligible ho.
                if s["guide_teacher_id"] in names:
                    continue
            tid = min(load, key=lambda t: (load[t], t))   # sabse kam load wala
            load[tid] += 1
            if s["project_id"]:
                w.execute("UPDATE project_guides SET guide_teacher_id=%s WHERE project_id=%s",
                          (tid, s["project_id"]))
            else:
                w.execute(
                    """INSERT INTO project_guides
                       (student_id, guide_teacher_id, project_title, project_status,
                        assigned_date, project_type, semester, batch_id)
                       VALUES (%s,%s,%s,%s,%s,%s,%s,%s)""",
                    (s["student_id"], tid, "Title not decided yet", "Assigned",
                     date.today().isoformat(), ptype, b["semester"], batch_id))
            assigned += 1
        conn.commit()
        w.close()
        return {
            "batch_name": b["batch_name"],
            "project_type": ptype,
            "assigned_now": assigned,
            "per_guide": {names[t]: n for t, n in load.items()},
        }
    finally:
        cur.close()


# ------------------------------------------------------------
# Request models
# ------------------------------------------------------------
class AutoAllocateIn(BaseModel):
    batch_id: int
    reset: bool = False


class ReassignIn(BaseModel):
    guide_teacher_id: int


class DetailsIn(BaseModel):
    project_title: Optional[str] = None
    project_domain: Optional[str] = None
    project_status: Optional[str] = None


# ------------------------------------------------------------
# Read endpoints
# ------------------------------------------------------------
@router.get("/rules")
def get_rules(user: dict = Depends(get_current_user)):
    return {"rules": PROJECT_RULES, "excluded_guide_keywords": EXCLUDED_GUIDE_KEYWORDS}


@router.get("/overview")
def overview(user: dict = Depends(require_role("admin"))):
    """Admin dashboard: har eligible batch -> guides -> unke students."""
    conn = get_db_connection()
    cur = conn.cursor(dictionary=True)
    try:
        eligible = get_eligible_guides(cur)

        cur.execute("SELECT batch_id, batch_name, semester FROM batches ORDER BY batch_name")
        result = []
        for b in cur.fetchall():
            ptype = project_type_for(b["batch_name"], b["semester"])
            if not ptype:
                continue

            guides = {g["teacher_id"]: {**g, "students": []} for g in eligible}

            cur.execute(
                """SELECT s.student_id, s.student_name, s.roll_number,
                          pg.project_id, pg.project_title, pg.project_status,
                          pg.guide_teacher_id, t.teacher_name AS guide_name
                   FROM students s
                   LEFT JOIN project_guides pg
                          ON pg.student_id = s.student_id AND pg.semester = %s
                   LEFT JOIN teachers t ON pg.guide_teacher_id = t.teacher_id
                   WHERE s.batch_id = %s ORDER BY s.roll_number""",
                (b["semester"], b["batch_id"]))
            students = cur.fetchall()

            unassigned = []
            for s in students:
                gid = s["guide_teacher_id"]
                if not gid:
                    unassigned.append(s)
                    continue
                if gid not in guides:   # guide ab eligible nahi (Re-balance se theek hoga)
                    guides[gid] = {"teacher_id": gid, "teacher_name": s["guide_name"],
                                   "students": [], "not_eligible": True}
                guides[gid]["students"].append(s)

            glist = list(guides.values())
            for g in glist:
                g["count"] = len(g["students"])
            result.append({
                "batch_id": b["batch_id"], "batch_name": b["batch_name"],
                "semester": b["semester"], "project_type": ptype,
                "total_students": len(students),
                "assigned": len(students) - len(unassigned),
                "guides": glist, "unassigned": unassigned,
                "eligible_guides": eligible,
            })
        return result
    finally:
        cur.close(); conn.close()


@router.get("/me")
def my_guide(user: dict = Depends(require_role("student"))):
    """Student dashboard: mera guide kaun hai."""
    conn = get_db_connection()
    cur = conn.cursor(dictionary=True)
    try:
        cur.execute(
            """SELECT pg.project_id, pg.project_title, pg.project_status, pg.project_type,
                      pg.project_domain, pg.assigned_date,
                      t.teacher_id, t.teacher_name, t.email AS teacher_email
               FROM project_guides pg JOIN teachers t ON pg.guide_teacher_id = t.teacher_id
               WHERE pg.student_id = %s ORDER BY pg.semester DESC LIMIT 1""",
            (user["student_id"],))
        row = cur.fetchone()
        if row:
            row["assigned_date"] = str(row["assigned_date"]) if row["assigned_date"] else None
            return {"assigned": True, "project": row}

        cur.execute(
            """SELECT b.batch_name, b.semester FROM students s
               JOIN batches b ON s.batch_id = b.batch_id WHERE s.student_id = %s""",
            (user["student_id"],))
        b = cur.fetchone()
        eligible = bool(b and project_type_for(b["batch_name"], b["semester"]))
        return {"assigned": False, "eligible": eligible,
                "message": "A guide has not been assigned yet. The admin will assign one soon."
                           if eligible else "There is no project in your semester."}
    finally:
        cur.close(); conn.close()


@router.get("/my-students")
def my_students(user: dict = Depends(require_role("teacher"))):
    """Teacher dashboard: mere guide ke under kaun-kaun se students."""
    conn = get_db_connection()
    cur = conn.cursor(dictionary=True)
    try:
        cur.execute(
            """SELECT pg.project_id, pg.project_title, pg.project_status, pg.project_type,
                      pg.project_domain, s.student_id, s.student_name, s.roll_number, s.email,
                      b.batch_id, b.batch_name
               FROM project_guides pg
               JOIN students s ON pg.student_id = s.student_id
               LEFT JOIN batches b ON s.batch_id = b.batch_id
               WHERE pg.guide_teacher_id = %s
               ORDER BY b.batch_name, s.roll_number""",
            (user["teacher_id"],))
        return cur.fetchall()
    finally:
        cur.close(); conn.close()


# ------------------------------------------------------------
# Actions
# ------------------------------------------------------------
@router.post("/auto-allocate")
def auto_allocate(body: AutoAllocateIn, user: dict = Depends(require_role("admin"))):
    conn = get_db_connection()
    try:
        res = auto_assign_for_batch(conn, body.batch_id, reset=body.reset)
        if res is None:
            raise HTTPException(400, "This batch has no project (only BCA Semester 5 and 6).")
        if "skipped" in res:
            raise HTTPException(400, res["skipped"])
        return res
    except HTTPException:
        conn.rollback(); raise
    except Exception as e:
        conn.rollback(); raise HTTPException(400, str(e))
    finally:
        conn.close()


@router.put("/{project_id}/guide")
def reassign_guide(project_id: int, body: ReassignIn,
                   user: dict = Depends(require_role("admin"))):
    conn = get_db_connection()
    cur = conn.cursor(dictionary=True)
    try:
        cur.execute("SELECT teacher_name FROM teachers WHERE teacher_id=%s",
                    (body.guide_teacher_id,))
        t = cur.fetchone()
        if not t:
            raise HTTPException(404, "Teacher not found")
        if is_excluded_guide(t["teacher_name"]):
            raise HTTPException(400, f"{t['teacher_name']} cannot be a project guide.")

        w = conn.cursor()
        w.execute("UPDATE project_guides SET guide_teacher_id=%s WHERE project_id=%s",
                  (body.guide_teacher_id, project_id))
        if w.rowcount == 0:
            w.close()
            raise HTTPException(404, "Project not found")
        conn.commit(); w.close()
        return {"message": "Guide changed"}
    except HTTPException:
        conn.rollback(); raise
    finally:
        cur.close(); conn.close()


@router.put("/{project_id}/details")
def update_details(project_id: int, body: DetailsIn,
                   user: dict = Depends(require_role("admin", "teacher"))):
    """Title / domain / status. Teacher sirf apne students ka badal sakta hai."""
    conn = get_db_connection()
    cur = conn.cursor(dictionary=True)
    try:
        cur.execute("SELECT guide_teacher_id FROM project_guides WHERE project_id=%s", (project_id,))
        row = cur.fetchone()
        if not row:
            raise HTTPException(404, "Project not found")
        if user["role"] == "teacher" and row["guide_teacher_id"] != user["teacher_id"]:
            raise HTTPException(403, "This is not your student.")

        sets, vals = [], []
        if body.project_title is not None:
            sets.append("project_title=%s"); vals.append(body.project_title.strip())
        if body.project_domain is not None:
            sets.append("project_domain=%s"); vals.append(body.project_domain.strip())
        if body.project_status is not None:
            sets.append("project_status=%s"); vals.append(body.project_status)
        if not sets:
            raise HTTPException(400, "Nothing to update")
        w = conn.cursor()
        w.execute(f"UPDATE project_guides SET {', '.join(sets)} WHERE project_id=%s",
                  tuple(vals) + (project_id,))
        conn.commit(); w.close()
        return {"message": "Project updated"}
    except HTTPException:
        conn.rollback(); raise
    finally:
        cur.close(); conn.close()


@router.delete("/{project_id}")
def delete_project(project_id: int, user: dict = Depends(require_role("admin"))):
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("DELETE FROM project_guides WHERE project_id=%s", (project_id,))
        if cur.rowcount == 0:
            raise HTTPException(404, "Project not found")
        conn.commit()
        return {"message": "Project deleted"}
    except HTTPException:
        conn.rollback(); raise
    finally:
        cur.close(); conn.close()