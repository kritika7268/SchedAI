"""
SchedAI - syllabus_logic.py

Pure helpers for syllabus progress (no database, no FastAPI).
Progress is kept PER BATCH:  % = topics covered for that batch / total topics.
"""


def percent(covered, total):
    return round(covered * 100 / total, 1) if total else 0.0


def clean_titles(raw_titles, max_titles=200, max_len=255):
    """Strip, drop blanks, drop duplicates (case-insensitive), keep order."""
    seen, out = set(), []
    for t in raw_titles or []:
        title = " ".join(str(t).split())
        if not title:
            continue
        if len(title) > max_len:
            title = title[:max_len]
        if title.lower() in seen:
            continue
        seen.add(title.lower())
        out.append(title)
        if len(out) >= max_titles:
            break
    return out


def summary(total, covered):
    return {
        "total": total,
        "covered": covered,
        "remaining": max(total - covered, 0),
        "percent": percent(covered, total),
    }


def assemble_progress(batches, subjects, topic_totals, covered_map,
                    teachers_map, timetable_pairs):
    """
    batches:        [{batch_id, batch_name, department_id, semester}]
    subjects:       [{subject_id, subject_name, subject_code, department_id,
                    semester, batch_id, sessions_per_week}]
    topic_totals:   {subject_id: number of topics}
    covered_map:    {(subject_id, batch_id): topics covered}
    teachers_map:   {(subject_id, batch_id): [teacher names]}
    timetable_pairs:{(subject_id, batch_id)} that appear in the timetable

    Returns {batch_id: {"batch_id", "batch_name", "semester", "subjects": [...],
                        "total", "covered", "remaining", "percent"}}
    A subject belongs to a batch when it is that department + semester
    (and either has no batch or this batch) and is part of the timetable
    (sessions_per_week > 0) or already has topics.  Anything actually
    scheduled for the batch in the timetable is included too.
    """
    result = {}

    for b in batches:
        rows, seen = [], set()

        for s in subjects:
            sid = s["subject_id"]
            applies = (
                s["department_id"] == b["department_id"]
                and s["semester"] == b["semester"]
                and (s["batch_id"] is None or s["batch_id"] == b["batch_id"])
                and ((s.get("sessions_per_week") or 0) > 0 or topic_totals.get(sid, 0) > 0)
            )
            if (applies or (sid, b["batch_id"]) in timetable_pairs) and sid not in seen:
                seen.add(sid)
                total = topic_totals.get(sid, 0)
                covered = min(covered_map.get((sid, b["batch_id"]), 0), total)
                rows.append({
                    "subject_id": sid,
                    "subject_name": s["subject_name"],
                    "subject_code": s.get("subject_code"),
                    "teachers": teachers_map.get((sid, b["batch_id"]), []),
                    **summary(total, covered),
                })

        rows.sort(key=lambda r: r["subject_name"].lower())
        total = sum(r["total"] for r in rows)
        covered = sum(r["covered"] for r in rows)
        result[b["batch_id"]] = {
            "batch_id": b["batch_id"],
            "batch_name": b["batch_name"],
            "semester": b["semester"],
            "subjects": rows,
            **summary(total, covered),
        }

    return result


def overall(progress_by_batch):
    """Department-wide totals across every batch that has topics."""
    total = sum(p["total"] for p in progress_by_batch.values())
    covered = sum(p["covered"] for p in progress_by_batch.values())
    tracked = sum(len([s for s in p["subjects"] if s["total"] > 0])
                for p in progress_by_batch.values())
    return {**summary(total, covered), "tracked": tracked}