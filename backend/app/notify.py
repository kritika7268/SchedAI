"""
SchedAI - notify.py

One helper that saves a notification in the database AND pushes it live over
the WebSocket to everyone connected (admin, teachers, students).
"""

from datetime import datetime

from app.database import get_db_connection
from app.websocket_manager import manager


async def notify(title, message, audience="all", notif_type="info"):
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
    except Exception as e:  # a socket problem must never break the API call
        print("WebSocket broadcast failed:", e)