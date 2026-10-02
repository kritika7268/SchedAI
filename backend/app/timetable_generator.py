"""
SchedAI - timetable_generator.py  (REPLACE your old file with this one)

All-batches-at-once timetable generator (OR-Tools CP-SAT).

ONE model contains every batch, so teacher / room / batch clashes are
impossible by construction (no more "generate batch A, then squeeze batch B
around it").

Slots: 50-minute classes, 1-hour lunch (12:20 - 13:20).
"""

import math
from collections import defaultdict

from ortools.sat.python import cp_model

DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]

DEFAULT_SLOTS = [
    ("09:00:00", "09:50:00"),
    ("09:50:00", "10:40:00"),
    ("10:40:00", "11:30:00"),
    ("11:30:00", "12:20:00"),
    # ---- lunch 12:20 PM - 1:20 PM (1 hour) ----
    ("13:20:00", "14:10:00"),
    ("14:10:00", "15:00:00"),
    ("15:00:00", "15:50:00"),
]

DEFAULT_MAX_DAILY = 5
# main.py imports this name, so keep it
DEFAULT_MAX_CLASSES_PER_TEACHER_PER_DAY = DEFAULT_MAX_DAILY


def time_label(value):
    """
    DB keeps 24-hour TIME (13:20:00) so sorting works.
    For SCREEN use this: 13:20:00 -> "1:20 PM", 09:00:00 -> "9:00 AM".
    Accepts timedelta (what mysql-connector returns), seconds, or "HH:MM[:SS]".
    """
    from datetime import timedelta
    if isinstance(value, timedelta):
        secs = int(value.total_seconds())
    elif isinstance(value, (int, float)):
        secs = int(value)
    else:
        p = str(value).split(":")
        secs = int(p[0]) * 3600 + int(p[1] if len(p) > 1 else 0) * 60
    h = (secs // 3600) % 24
    m = (secs % 3600) // 60
    return f"{(h % 12) or 12}:{m:02d} {'AM' if h < 12 else 'PM'}"


def _is_lab(room_type):
    return "lab" in str(room_type or "").lower()


def _capacity(room):
    cap = room.get("capacity")
    return int(cap) if cap is not None else 10**6


def rooms_for(subject, size, rooms):
    fits = [r for r in rooms if _capacity(r) >= size]
    if _is_lab(subject.get("room_type_required")):
        return [r for r in fits if _is_lab(r.get("room_type"))]
    return fits  # theory may use any room that fits (labs are penalised)


# ------------------------------------------------------------------
# Pre-checks: explain WHY it is impossible before even running solver
# ------------------------------------------------------------------
def precheck(batches, subjects_by_batch, rooms, teachers, days, slots):
    problems = []
    D, T = len(days), len(slots)
    total_slots = D * T

    lab_sessions = 0
    all_sessions = 0
    sole_teacher_load = defaultdict(int)

    for b in batches:
        bid = b["batch_id"]
        batch_total = 0
        for s in subjects_by_batch.get(bid, []):
            n = s["sessions_per_week"]
            if n <= 0:
                continue
            batch_total += n
            all_sessions += n
            name = s.get("subject_name", s["subject_id"])

            if not s["eligible_teacher_ids"]:
                problems.append({
                    "type": "teacher",
                    "message": f"{b['batch_name']}: no teacher is mapped to '{name}'.",
                    "suggestion": "Add this subject to a teacher in teacher_skills.",
                })
            elif len(s["eligible_teacher_ids"]) == 1:
                sole_teacher_load[s["eligible_teacher_ids"][0]] += n

            ok = rooms_for(s, b["size"], rooms)
            if not ok:
                problems.append({
                    "type": "room",
                    "message": (f"{b['batch_name']}: no room fits '{name}' "
                                f"({b['size']} students"
                                f"{', lab required' if _is_lab(s.get('room_type_required')) else ''})."),
                    "suggestion": "Add a bigger room / lab or reduce batch size.",
                })
            if _is_lab(s.get("room_type_required")):
                lab_sessions += n

        if batch_total > total_slots:
            problems.append({
                "type": "batch",
                "message": (f"{b['batch_name']} needs {batch_total} classes/week "
                            f"but only {total_slots} slots exist."),
                "suggestion": "Reduce sessions_per_week for this batch's subjects.",
            })

    if rooms and all_sessions > len(rooms) * total_slots:
        problems.append({
            "type": "room",
            "message": (f"Total {all_sessions} classes/week but {len(rooms)} rooms "
                        f"give only {len(rooms) * total_slots} room-slots."),
            "suggestion": "Add rooms or reduce sessions_per_week.",
        })

    lab_rooms = [r for r in rooms if _is_lab(r.get("room_type"))]
    if lab_sessions and lab_sessions > len(lab_rooms) * total_slots:
        problems.append({
            "type": "room",
            "message": (f"{lab_sessions} lab classes/week but {len(lab_rooms)} lab(s) "
                        f"give only {len(lab_rooms) * total_slots} lab-slots."),
            "suggestion": "Add a lab or reduce lab sessions.",
        })

    for tid, load in sole_teacher_load.items():
        info = teachers.get(tid, {})
        cap = min(total_slots, D * info.get("max_daily", DEFAULT_MAX_DAILY))
        if load > cap:
            problems.append({
                "type": "workload",
                "message": (f"{info.get('name', tid)} is the only teacher for subjects "
                            f"needing {load} classes/week, but max is {cap} "
                            f"({info.get('max_daily', DEFAULT_MAX_DAILY)}/day)."),
                "suggestion": "Map another teacher to these subjects in teacher_skills.",
            })

    return problems


# ------------------------------------------------------------------
# Independent conflict counter (so the "0 conflicts" you show is real)
# ------------------------------------------------------------------
def count_conflicts(schedule):
    seen_t, seen_r, seen_b = defaultdict(int), defaultdict(int), defaultdict(int)
    for e in schedule:
        slot = (e["day_of_week"], e["start_time"])
        seen_t[(e["teacher_id"],) + slot] += 1
        seen_r[(e["room_id"],) + slot] += 1
        seen_b[(e["batch_id"],) + slot] += 1
    f = lambda d: sum(c - 1 for c in d.values() if c > 1)
    return {"teacher": f(seen_t), "room": f(seen_r), "batch": f(seen_b)}


# ------------------------------------------------------------------
# Main
# ------------------------------------------------------------------
def generate_all(batches, subjects_by_batch, rooms, teachers,
                 unavailable=None, days=None, slots=None,
                 time_limit_seconds=60,
                 busy_rooms=None, existing_daily=None, existing_weekly=None):
    """
    batches:          [{batch_id, batch_name, size}]
    subjects_by_batch:{batch_id: [{subject_id, subject_name, sessions_per_week,
                                   room_type_required, eligible_teacher_ids}]}
    rooms:            [{room_id, room_type, capacity}]
    teachers:         {teacher_id: {name, max_daily}}
    unavailable:      set of (teacher_id, day_index, slot_index)

    Returns {"status": "ok", "schedule": [...], "stats": {...}}
         or {"status": "infeasible", "problems": [...]}
    """
    days = days or DAYS
    slots = slots or DEFAULT_SLOTS
    unavailable = unavailable or set()
    # --- used when generating ONE batch while other batches are already fixed ---
    busy_rooms = busy_rooms or set()            # {(room_id, day_idx, slot_idx)}
    existing_daily = existing_daily or {}       # {(teacher_id, day_idx): classes already that day}
    existing_weekly = existing_weekly or {}     # {teacher_id: classes already this week}
    D, T = len(days), len(slots)

    problems = precheck(batches, subjects_by_batch, rooms, teachers, days, slots)
    if problems:
        return {"status": "infeasible", "problems": problems}

    model = cp_model.CpModel()

    a = {}                        # (bid, sid, tid)      teacher chosen
    x = {}                        # (bid, sid, d, t)     class happens
    room_choice = {}              # (bid, sid, d, t) -> [(room_id, var)]
    batch_slot = defaultdict(list)
    room_slot = defaultdict(list)
    teacher_slot = defaultdict(list)
    teacher_day = defaultdict(list)
    teacher_all = defaultdict(list)
    lab_penalty = []
    gap_vars = []
    spread_vars = []

    for b in batches:
        bid = b["batch_id"]
        day_items = defaultdict(list)

        for s in subjects_by_batch.get(bid, []):
            n = s["sessions_per_week"]
            if n <= 0:
                continue
            sid = s["subject_id"]
            elig = s["eligible_teacher_ids"]
            ok_rooms = rooms_for(s, b["size"], rooms)
            needs_lab = _is_lab(s.get("room_type_required"))

            for tid in elig:
                a[bid, sid, tid] = model.NewBoolVar(f"a_{bid}_{sid}_{tid}")
            model.AddExactlyOne([a[bid, sid, tid] for tid in elig])

            per_day = 1 if n <= D else math.ceil(n / D)
            subj_vars = []

            for d in range(D):
                day_vars = []
                for t in range(T):
                    v = model.NewBoolVar(f"x_{bid}_{sid}_{d}_{t}")
                    x[bid, sid, d, t] = v
                    day_vars.append(v)
                    subj_vars.append(v)
                    batch_slot[bid, d, t].append(v)
                    day_items[d].append((t, v))

                    rvs = []
                    room_choice[bid, sid, d, t] = []
                    for r in ok_rooms:
                        if (r["room_id"], d, t) in busy_rooms:
                            continue            # room taken by another batch
                        rv = model.NewBoolVar(f"r_{bid}_{sid}_{d}_{t}_{r['room_id']}")
                        rvs.append(rv)
                        room_choice[bid, sid, d, t].append((r["room_id"], rv))
                        room_slot[r["room_id"], d, t].append(rv)
                        if not needs_lab and _is_lab(r.get("room_type")):
                            lab_penalty.append(rv)
                    model.Add(sum(rvs) == v)

                    for tid in elig:
                        z = model.NewBoolVar(f"z_{bid}_{sid}_{tid}_{d}_{t}")
                        model.Add(z <= v)
                        model.Add(z <= a[bid, sid, tid])
                        model.Add(z >= v + a[bid, sid, tid] - 1)
                        if (tid, d, t) in unavailable:
                            model.Add(z == 0)
                        teacher_slot[tid, d, t].append(z)
                        teacher_day[tid, d].append(z)
                        teacher_all[tid].append(z)

                model.Add(sum(day_vars) <= per_day)   # spread across the week

            model.Add(sum(subj_vars) == n)

        # compactness: penalise free periods between first and last class
        for d, items in day_items.items():
            first = model.NewIntVar(0, T - 1, f"first_{bid}_{d}")
            last = model.NewIntVar(0, T - 1, f"last_{bid}_{d}")
            has = model.NewBoolVar(f"has_{bid}_{d}")
            cnt = sum(v for _, v in items)
            for t, v in items:
                model.Add(last >= t).OnlyEnforceIf(v)
                model.Add(first <= t).OnlyEnforceIf(v)
            model.Add(cnt >= 1).OnlyEnforceIf(has)
            model.Add(cnt == 0).OnlyEnforceIf(has.Not())
            gap = model.NewIntVar(0, T, f"gap_{bid}_{d}")
            model.Add(gap >= last - first + 1 - cnt).OnlyEnforceIf(has)
            gap_vars.append(gap)

        # balance: every batch should have (almost) the same number of
        # classes on every working day  (spread = busiest day - lightest day)
        day_cnt = []
        for d in range(D):
            c = model.NewIntVar(0, T, f"cnt_{bid}_{d}")
            model.Add(c == sum(v for _, v in day_items.get(d, [])))
            day_cnt.append(c)
        mx = model.NewIntVar(0, T, f"mx_{bid}")
        mn = model.NewIntVar(0, T, f"mn_{bid}")
        for c in day_cnt:
            model.Add(mx >= c)
            model.Add(mn <= c)
        spread = model.NewIntVar(0, T, f"spread_{bid}")
        model.Add(spread == mx - mn)
        spread_vars.append(spread)

    # ---- hard: no double booking ----
    for vs in batch_slot.values():
        model.Add(sum(vs) <= 1)
    for vs in room_slot.values():
        model.Add(sum(vs) <= 1)
    for vs in teacher_slot.values():
        model.Add(sum(vs) <= 1)

    # ---- hard: max classes per teacher per day ----
    max_daily_load = model.NewIntVar(0, T, "max_daily_load")
    for (tid, d), vs in teacher_day.items():
        cap = teachers.get(tid, {}).get("max_daily", DEFAULT_MAX_DAILY)
        ex = existing_daily.get((tid, d), 0)
        model.Add(sum(vs) + ex <= cap)
        model.Add(sum(vs) + ex <= max_daily_load)

    # ---- soft: workload fairness (minimise busiest teacher) ----
    max_weekly_load = model.NewIntVar(0, D * T, "max_weekly_load")
    for tid, vs in teacher_all.items():
        model.Add(sum(vs) + existing_weekly.get(tid, 0) <= max_weekly_load)

    model.Minimize(
        20 * max_weekly_load
        + 10 * max_daily_load
        + 30 * sum(spread_vars)
        + 5 * sum(gap_vars)
        + 3 * sum(lab_penalty)
    )

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = time_limit_seconds
    solver.parameters.num_search_workers = 8
    status = solver.Solve(model)

    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        reason = ("The solver proved the constraints are contradictory."
                  if status == cp_model.INFEASIBLE
                  else f"No solution found within {time_limit_seconds}s.")
        return {"status": "infeasible", "problems": [{
            "type": "solver",
            "message": "Timetable could not be generated with the current constraints. " + reason,
            "suggestion": ("Add rooms/teachers, reduce sessions_per_week, "
                           "or relax teacher availability."),
        }]}

    # ---- build result ----
    schedule = []
    for (bid, sid, d, t), v in x.items():
        if solver.Value(v) != 1:
            continue
        tid = next(tid for (b2, s2, tid) in a
                   if b2 == bid and s2 == sid and solver.Value(a[b2, s2, tid]) == 1)
        rid = next(r for r, rv in room_choice[bid, sid, d, t] if solver.Value(rv) == 1)
        schedule.append({
            "batch_id": bid,
            "subject_id": sid,
            "teacher_id": tid,
            "room_id": rid,
            "day_of_week": days[d],
            "start_time": slots[t][0],
            "end_time": slots[t][1],
        })

    schedule.sort(key=lambda e: (e["batch_id"], days.index(e["day_of_week"]), e["start_time"]))

    weekly = defaultdict(int)
    for e in schedule:
        weekly[e["teacher_id"]] += 1

    return {
        "status": "ok",
        "schedule": schedule,
        "stats": {
            "optimal": status == cp_model.OPTIMAL,
            "conflicts": count_conflicts(schedule),
            "teacher_weekly_load": dict(weekly),
            "max_weekly_load": max(weekly.values()) if weekly else 0,
            "solve_seconds": round(solver.WallTime(), 2),
        },
    }