import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.database import get_db_connection
import random
import sys


# ============================================================
# SchedAI Demo Data
# 8 batches × 28 students = 224 students
# ============================================================

STUDENTS_PER_BATCH = 28

BATCHES = [
    {
        "name": "BCA 1 Sem",
        "department_id": 1,
        "semester": 1,
        "section": "A",
        "prefix": "BCA1",
    },
    {
        "name": "BCA 3 Sem",
        "department_id": 1,
        "semester": 3,
        "section": "A",
        "prefix": "BCA3",
    },
    {
        "name": "BCA 5 Sem",
        "department_id": 1,
        "semester": 5,
        "section": "A",
        "prefix": "BCA5",
    },
    {
        "name": "BCA DS 1 Sem",
        "department_id": 1,
        "semester": 1,
        "section": "A",
        "prefix": "BCADS1",
    },
    {
        "name": "BCA DS 3 Sem",
        "department_id": 1,
        "semester": 3,
        "section": "A",
        "prefix": "BCADS3",
    },
    {
        "name": "BCA DS 5 Sem",
        "department_id": 1,
        "semester": 5,
        "section": "A",
        "prefix": "BCADS5",
    },
    {
        "name": "MCA 1 Sem",
        "department_id": 1,
        "semester": 1,
        "section": "A",
        "prefix": "MCA1",
    },
    {
        "name": "MCS DS 1 Sem",
        "department_id": 2,
        "semester": 1,
        "section": "A",
        "prefix": "MCSDS1",
    },
]


FIRST_NAMES = [
    "Aarav",
    "Aditya",
    "Ananya",
    "Arjun",
    "Diya",
    "Ishita",
    "Kavya",
    "Krishna",
    "Meera",
    "Neha",
    "Nisha",
    "Pooja",
    "Priya",
    "Rahul",
    "Riya",
    "Rohan",
    "Sakshi",
    "Shivam",
    "Shreya",
    "Sneha",
    "Tanvi",
    "Varun",
    "Vansh",
    "Yash",
    "Aditi",
    "Ankit",
    "Ayush",
    "Simran",
]

LAST_NAMES = [
    "Sharma",
    "Singh",
    "Gupta",
    "Verma",
    "Srivastava",
    "Mishra",
    "Tiwari",
    "Yadav",
    "Pandey",
    "Tripathi",
]


def get_unique_student_names(count):
    """
    Generate unique student names.
    """
    combinations = [
        f"{first} {last}"
        for first in FIRST_NAMES
        for last in LAST_NAMES
    ]

    random.shuffle(combinations)

    if count > len(combinations):
        raise ValueError("Not enough unique student names available.")

    return combinations[:count]


def main():
    connection = None
    cursor = None

    try:
        print("=" * 60)
        print("SchedAI Demo Data Population")
        print("=" * 60)

        print("\nConnecting to MySQL...")

        connection = get_db_connection()
        cursor = connection.cursor()

        print("Database connection successful.")

        # --------------------------------------------------------
        # Safety confirmation
        # --------------------------------------------------------

        print("\nWARNING:")
        print("This script will replace the old demo batches:")
        print("  Batch IDs: 2, 3, 4")
        print("\nIt will remove:")
        print("  - substitutions linked to their timetables")
        print("  - timetable records")
        print("  - old students linked to these batches")
        print("  - the old batch records")
        print("\nThen it will create:")
        print("  - 8 new batches")
        print("  - 28 students per batch")
        print("  - 224 students total")

        confirmation = input(
            "\nType YES to continue: "
        ).strip()

        if confirmation != "YES":
            print("\nOperation cancelled.")
            return

        # --------------------------------------------------------
        # Start transaction
        # --------------------------------------------------------

        print("\nStarting transaction...")

        connection.start_transaction()

        OLD_BATCH_IDS = (2, 3, 4)

        # --------------------------------------------------------
        # 1. Find old timetable IDs
        # --------------------------------------------------------

        print("\n[1/7] Finding old timetable records...")

        placeholders = ",".join(["%s"] * len(OLD_BATCH_IDS))

        cursor.execute(
            f"""
            SELECT timetable_id
            FROM timetables
            WHERE batch_id IN ({placeholders})
            """,
            OLD_BATCH_IDS,
        )

        old_timetable_ids = [
            row[0]
            for row in cursor.fetchall()
        ]

        print(
            f"Found {len(old_timetable_ids)} old timetable records."
        )

        # --------------------------------------------------------
        # 2. Delete substitutions linked to old timetables
        # --------------------------------------------------------

        print("\n[2/7] Removing dependent substitutions...")

        if old_timetable_ids:
            timetable_placeholders = ",".join(
                ["%s"] * len(old_timetable_ids)
            )

            cursor.execute(
                f"""
                DELETE FROM substitutions
                WHERE timetable_id IN ({timetable_placeholders})
                """,
                tuple(old_timetable_ids),
            )

            print(
                f"Removed {cursor.rowcount} substitution records."
            )
        else:
            print("No dependent substitutions found.")

        # --------------------------------------------------------
        # 3. Delete old timetables
        # --------------------------------------------------------

        print("\n[3/7] Removing old timetable records...")

        cursor.execute(
            f"""
            DELETE FROM timetables
            WHERE batch_id IN ({placeholders})
            """,
            OLD_BATCH_IDS,
        )

        print(
            f"Removed {cursor.rowcount} timetable records."
        )

        # --------------------------------------------------------
        # 4. Delete old students
        # --------------------------------------------------------

        print("\n[4/7] Removing old students...")

        cursor.execute(
            f"""
            DELETE FROM students
            WHERE batch_id IN ({placeholders})
            """,
            OLD_BATCH_IDS,
        )

        print(
            f"Removed {cursor.rowcount} old student records."
        )

        # --------------------------------------------------------
        # 5. Delete old batches
        # --------------------------------------------------------

        print("\n[5/7] Removing old batches...")

        cursor.execute(
            f"""
            DELETE FROM batches
            WHERE batch_id IN ({placeholders})
            """,
            OLD_BATCH_IDS,
        )

        print(
            f"Removed {cursor.rowcount} old batch records."
        )

        # --------------------------------------------------------
        # 6. Create new batches
        # --------------------------------------------------------

        print("\n[6/7] Creating new batches...")

        created_batches = []

        for batch in BATCHES:

            # Verify department exists
            cursor.execute(
                """
                SELECT department_id
                FROM departments
                WHERE department_id = %s
                """,
                (batch["department_id"],),
            )

            department = cursor.fetchone()

            if not department:
                raise ValueError(
                    f"Department ID {batch['department_id']} "
                    f"does not exist."
                )

            # Create batch
            cursor.execute(
                """
                INSERT INTO batches
                (
                    batch_name,
                    department_id,
                    semester,
                    section
                )
                VALUES (%s, %s, %s, %s)
                """,
                (
                    batch["name"],
                    batch["department_id"],
                    batch["semester"],
                    batch["section"],
                ),
            )

            batch_id = cursor.lastrowid

            created_batches.append(
                {
                    **batch,
                    "batch_id": batch_id,
                }
            )

            print(
                f"  Created: {batch['name']} "
                f"(ID: {batch_id})"
            )

        # --------------------------------------------------------
        # 7. Create students
        # --------------------------------------------------------

        print("\n[7/7] Creating students...")

        total_students = 0

        for batch in created_batches:

            names = get_unique_student_names(
                STUDENTS_PER_BATCH
            )

            for index, student_name in enumerate(
                names,
                start=1
            ):

                roll_number = (
                    f"{batch['prefix']}"
                    f"{index:03d}"
                )

                email = (
                    f"{batch['prefix'].lower()}"
                    f".{index:03d}"
                    f"@schedai.local"
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
                    VALUES (%s, %s, %s, %s, %s, %s)
                    """,
                    (
                        student_name,
                        roll_number,
                        email,
                        batch["semester"],
                        batch["department_id"],
                        batch["batch_id"],
                    ),
                )

                total_students += 1

            print(
                f"  {batch['name']}: "
                f"{STUDENTS_PER_BATCH} students"
            )

        # --------------------------------------------------------
        # Commit
        # --------------------------------------------------------

        connection.commit()

        print("\n" + "=" * 60)
        print("SUCCESS")
        print("=" * 60)

        print(f"\nBatches created : {len(created_batches)}")
        print(f"Students created: {total_students}")

        print("\nExpected:")
        print("  8 batches")
        print("  224 students")

        # --------------------------------------------------------
        # Final verification
        # --------------------------------------------------------

        print("\nFinal database verification:")

        cursor.execute(
            """
            SELECT
                b.batch_id,
                b.batch_name,
                b.department_id,
                b.semester,
                b.section,
                COUNT(s.student_id) AS student_count
            FROM batches b
            LEFT JOIN students s
                ON s.batch_id = b.batch_id
            GROUP BY
                b.batch_id,
                b.batch_name,
                b.department_id,
                b.semester,
                b.section
            ORDER BY b.batch_id
            """
        )

        rows = cursor.fetchall()

        print("\n")
        print(
            "ID | Batch Name | Dept | Sem | Section | Students"
        )
        print("-" * 65)

        for row in rows:
            print(
                f"{row[0]} | "
                f"{row[1]} | "
                f"{row[2]} | "
                f"{row[3]} | "
                f"{row[4]} | "
                f"{row[5]}"
            )

        print("\nDone.")

    except Exception as error:

        if connection:
            connection.rollback()

        print("\n" + "=" * 60)
        print("ERROR")
        print("=" * 60)

        print(error)

        print(
            "\nNo changes were committed. "
            "The transaction has been rolled back."
        )

        sys.exit(1)

    finally:

        if cursor:
            cursor.close()

        if connection:
            connection.close()


if __name__ == "__main__":
    main()