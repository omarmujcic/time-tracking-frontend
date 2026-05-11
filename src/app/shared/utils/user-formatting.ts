import { DecimalSeparator, UserPreference } from '../../features/settings/models/settings.model';

export function formatUserDateTime(value: string, preferences: UserPreference): string {
  const date = new Date(value);
  const dateLabel = formatUserDate(date, preferences.dateFormat, preferences.timezone || undefined);
  const timeLabel = new Intl.DateTimeFormat('en', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZone: preferences.timezone || undefined
  }).format(date);
  return `${dateLabel}, ${timeLabel}`;
}

export function formatUserDate(value: Date, dateFormat: string, timeZone?: string): string {
  const parts = dateParts(value, timeZone);

  if (dateFormat === 'DD.MM.YYYY') {
    return `${parts.day}.${parts.month}.${parts.year}`;
  }
  if (dateFormat === 'MM/DD/YYYY') {
    return `${parts.month}/${parts.day}/${parts.year}`;
  }
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function formatUserMonth(value: Date, dateFormat: string): string {
  const year = String(value.getFullYear());
  const month = String(value.getMonth() + 1).padStart(2, '0');

  if (dateFormat === 'DD.MM.YYYY') {
    return `${month}.${year}`;
  }
  if (dateFormat === 'MM/DD/YYYY') {
    return `${month}/${year}`;
  }
  return `${year}-${month}`;
}

export function formatUserCurrency(value: number, preferences: UserPreference): string {
  const amount = formatUserNumber(value, preferences.decimalSeparator, 2);
  return preferences.decimalSeparator === 'COMMA' ? `${amount} €` : `€${amount}`;
}

export function formatUserRateInput(value: number | null | undefined, preferences: UserPreference): string {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) {
    return '';
  }
  return formatUserNumber(Number(value), preferences.decimalSeparator, 2);
}

export function formatUserNumber(value: number, decimalSeparator: DecimalSeparator, digits = 2): string {
  const normalized = Number.isFinite(value) ? value : 0;
  const formatted = normalized.toFixed(digits);
  return decimalSeparator === 'COMMA' ? formatted.replace('.', ',') : formatted;
}

export function parseUserDecimal(
  value: string | number | null | undefined,
  decimalSeparator: DecimalSeparator
): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const raw = String(value).trim().replace(/\s/g, '');
  if (!raw) {
    return null;
  }

  let normalized = raw;
  if (decimalSeparator === 'COMMA') {
    normalized = raw.includes(',')
      ? raw.replace(/\./g, '').replace(',', '.')
      : raw;
  } else {
    normalized = raw.includes('.') ? raw.replace(/,/g, '') : raw.replace(',', '.');
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function dateParts(value: Date, timeZone?: string): { year: string; month: string; day: string } {
  if (!timeZone) {
    return {
      year: String(value.getFullYear()),
      month: String(value.getMonth() + 1).padStart(2, '0'),
      day: String(value.getDate()).padStart(2, '0')
    };
  }

  const parts = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone
  }).formatToParts(value);

  return {
    year: parts.find((part) => part.type === 'year')?.value ?? String(value.getFullYear()),
    month: parts.find((part) => part.type === 'month')?.value ?? String(value.getMonth() + 1).padStart(2, '0'),
    day: parts.find((part) => part.type === 'day')?.value ?? String(value.getDate()).padStart(2, '0')
  };
}
