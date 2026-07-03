export function resolveItemDate(startDate: string | null | undefined, day: number): string | null {
  if (!startDate?.trim()) return null;
  const base = new Date(`${startDate.trim()}T00:00:00`);
  if (Number.isNaN(base.getTime())) return null;
  base.setDate(base.getDate() + Math.max(0, day - 1));
  const year = base.getFullYear();
  const month = `${base.getMonth() + 1}`.padStart(2, "0");
  const date = `${base.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${date}`;
}

export function formatItemDateLabel(startDate: string | null | undefined, day: number) {
  const iso = resolveItemDate(startDate, day);
  if (!iso) return `第${day}天`;
  const [, month, date] = iso.split("-");
  return `${Number(month)}/${Number(date)}`;
}

export function formatItemSchedule(
  startDate: string | null | undefined,
  day: number,
  startTime: string,
  endTime: string,
) {
  const dateLabel = formatItemDateLabel(startDate, day);
  const timeLabel = endTime ? `${startTime}-${endTime}` : startTime;
  return `${dateLabel} ${timeLabel}`;
}
