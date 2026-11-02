import { useEffect, useState } from "react";

const API_URL = "http://127.0.0.1:8000";

// Returns today's holiday (or null). Uses the same API as the holiday banner.
export default function useTodayHoliday() {
  const [holiday, setHoliday] = useState(null);

  useEffect(() => {
    fetch(`${API_URL}/holidays/notifications`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setHoliday(d?.today_holidays?.[0] || null))
      .catch(() => {});
  }, []);

  return holiday;
}