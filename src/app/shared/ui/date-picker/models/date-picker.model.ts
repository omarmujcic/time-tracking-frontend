export type DatePickerMode = 'date' | 'datetime' | 'week' | 'month' | 'year';

export interface CalendarDay {
  date: Date;
  label: number;
  outside: boolean;
  selected: boolean;
  weekSelected: boolean;
  weekHovered: boolean;
}
