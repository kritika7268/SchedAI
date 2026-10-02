"""
SchedAI - substitute_engine.py  (REPLACE your old file with this one)

Pure function (no DB / FastAPI). Picks the best substitute for every class
of an absent teacher.

A candidate is ELIGIBLE only if ALL of these are true:
  1. not the absent teacher, and not absent himself on that date
  2. FREE at that exact day + start time (own timetable + earlier subs)
  3. daily classes (regular + substitutions) < his max per day (default 5)

Among eligible teachers the best is chosen by:
  tier 1: has this subject in teacher_skills
  tier 2: (fallback) same department as the subject
  then : fewest classes TODAY, then fewest classes this WEEK, then name
"""

DEFAULT_MAX_DAILY = 5


def auto_assign_substitutes(
    affected_classes,
    candidate_teachers,
    busy_slots,
    teacher_workload,
    absent_teacher_id,
    skills_by_subject=None,      # {subject_id: set(teacher_id)}
    daily_count=None,            # {teacher_id: classes already that day}
    teacher_max_daily=None,      # {teacher_id: max classes/day}
    unavailable_teacher_ids=None # teachers absent on the same date
):
    skills_by_subject = skills_by_subject or {}
    daily_count = daily_count if daily_count is not None else {}
    teacher_max_daily = teacher_max_daily or {}
    blocked = set(unavailable_teacher_ids or [])
    blocked.add(absent_teacher_id)

    pool_all = [t for t in candidate_teachers if t["teacher_id"] not in blocked]
    results = []

    for cls in affected_classes:
        day, start = cls["day_of_week"], cls["start_time"]
        skilled_ids = skills_by_subject.get(cls["subject_id"], set())

        free = [t for t in pool_all
                if (t["teacher_id"], day, start) not in busy_slots]

        under_cap = [
            t for t in free
            if daily_count.get(t["teacher_id"], 0)
            < teacher_max_daily.get(t["teacher_id"], DEFAULT_MAX_DAILY)
        ]

        skilled = [t for t in under_cap if t["teacher_id"] in skilled_ids]
        same_dept = [t for t in under_cap
                     if t.get("department_id") == cls.get("department_id")]

        if skilled:
            pool, match = skilled, "skill"
        elif same_dept:
            pool, match = same_dept, "department"
        else:
            pool, match = [], None

        base = {
            "timetable_id": cls["timetable_id"],
            "subject_id": cls["subject_id"],
            "day_of_week": day,
            "start_time": start,
            "end_time": cls["end_time"],
        }

        if not pool:
            if not free:
                reason = "No teacher is free at this time."
            elif not under_cap:
                reason = "Every free teacher has already reached the daily class limit."
            else:
                reason = "No free teacher has this subject skill or is from the same department."
            results.append({**base, "status": "no_substitute_found",
                            "substitute_teacher_id": None,
                            "substitute_teacher_name": None,
                            "match": None, "classes_today_after": None,
                            "reason": reason})
            continue

        pool.sort(key=lambda t: (
            daily_count.get(t["teacher_id"], 0),
            teacher_workload.get(t["teacher_id"], 0),
            t.get("teacher_name") or "",
        ))
        chosen = pool[0]
        tid = chosen["teacher_id"]

        # lock him in so he is not picked twice for the same slot / over the limit
        busy_slots.add((tid, day, start))
        daily_count[tid] = daily_count.get(tid, 0) + 1
        teacher_workload[tid] = teacher_workload.get(tid, 0) + 1

        results.append({**base, "status": "assigned",
                        "substitute_teacher_id": tid,
                        "substitute_teacher_name": chosen.get("teacher_name"),
                        "match": match,
                        "classes_today_after": daily_count[tid],
                        "reason": ""})

    return results