import os
from pathlib import Path

import mysql.connector
from dotenv import load_dotenv

# loads backend/.env  (one folder above app/)
load_dotenv(Path(__file__).resolve().parents[1] / ".env")


def get_db_connection():
    return mysql.connector.connect(
        host=os.getenv("MYSQL_HOST", "localhost"),
        port=int(os.getenv("MYSQL_PORT", "3306")),
        user=os.getenv("MYSQL_USER", "root"),
        password=os.getenv("MYSQL_PASSWORD", ""),
        database=os.getenv("MYSQL_DATABASE", "university_scheduler"),
    )