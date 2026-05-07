export type DatePickerMode = 'date' | 'datetime' | 'month';

export interface CalendarDay {
  date: Date;
  label: number;
  outside: boolean;
  selected: boolean;
}
