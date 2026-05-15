export function toInputDate(value: Date): string {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}

export function toInputTime(value: Date): string {
  return `${String(value.getHours()).padStart(2, '0')}:${String(value.getMinutes()).padStart(2, '0')}`;
}

export function parseInputDate(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function dateWithInputTime(dateValue: string, timeValue: string): Date | null {
  const [year, month, day] = dateValue.split('-').map(Number);
  const [hours, minutes] = timeValue.split(':').map(Number);
  if (![year, month, day, hours, minutes].every(Number.isFinite)) {
    return null;
  }
  return new Date(year, month - 1, day, hours, minutes, 0, 0);
}

export function inputDateTimeRange(dateValue: string, startTime: string, endTime: string): { startedAt: Date; endedAt: Date } | null {
  const startedAt = dateWithInputTime(dateValue, startTime);
  const endedAt = dateWithInputTime(dateValue, endTime);
  if (!startedAt || !endedAt || Number.isNaN(startedAt.getTime()) || Number.isNaN(endedAt.getTime())) {
    return null;
  }
  if (endedAt.getTime() === startedAt.getTime()) {
    return null;
  }
  if (endedAt < startedAt) {
    endedAt.setDate(endedAt.getDate() + 1);
  }
  return { startedAt, endedAt };
}
