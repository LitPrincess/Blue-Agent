export function formatDurationLabel(startTime: string, endTime: string) {
  const start = parseClock(startTime);
  const end = parseClock(endTime);
  if (start == null || end == null) return "";
  const mins = end - start;
  if (mins <= 0) return "";
  if (mins < 60) return `${mins}分钟`;
  const hours = Math.floor(mins / 60);
  const remain = mins % 60;
  return remain ? `${hours}小时${remain}分` : `${hours}小时`;
}

export function formatTimeRange(startTime: string, endTime: string) {
  if (!startTime || !endTime) return startTime || endTime || "";
  return `${startTime}-${endTime}`;
}

function parseClock(value: string) {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}
