import { Component, EventEmitter, HostListener, Input, Output, computed, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { formatUserDate, formatUserMonth } from '../../utils/user-formatting';
import { FieldOverlayCoordinatorService } from '../field-overlay-coordinator.service';
import { CalendarDay, DatePickerMode } from './models/date-picker.model';

@Component({
  selector: 'app-date-picker',
  imports: [MatIconModule],
  templateUrl: './date-picker.component.html',
  styleUrl: './date-picker.component.scss'
})
export class DatePickerComponent {
  @Input() mode: DatePickerMode = 'date';
  @Input() placeholder = 'Select date';
  @Input() disabled = false;
  @Input() set dateFormat(value: string) {
    this.dateFormatState.set(value || 'YYYY-MM-DD');
  }
  @Input() set value(value: string) {
    this.valueState.set(value || '');
    this.viewDate.set(this.parseValue(value) ?? new Date());
  }
  @Output() readonly valueChange = new EventEmitter<string>();

  private readonly overlayId = Symbol('date-picker');
  protected readonly open = computed(() => this.fieldOverlayCoordinator.isOpen(this.overlayId));
  protected readonly valueState = signal('');
  protected readonly viewDate = signal(new Date());
  protected readonly hoveredWeekStart = signal<Date | null>(null);
  protected readonly dateFormatState = signal('YYYY-MM-DD');
  protected readonly weekDays = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
  protected readonly monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  protected readonly displayValue = computed(() => this.formatDisplayValue());
  protected readonly headerLabel = computed(() => {
    if (this.mode === 'year') {
      const start = this.yearGridStart(this.viewDate().getFullYear());
      return `${start} - ${start + 11}`;
    }
    return this.viewDate().toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  });
  protected readonly calendarDays = computed(() => this.buildCalendarDays());

  constructor(private readonly fieldOverlayCoordinator: FieldOverlayCoordinatorService) {}

  @HostListener('document:click')
  protected close(): void {
    this.closePicker();
  }

  protected toggle(event: MouseEvent): void {
    event.stopPropagation();
    if (this.disabled) {
      return;
    }
    this.fieldOverlayCoordinator.toggle(this.overlayId);
  }

  protected keepOpen(event: MouseEvent): void {
    event.stopPropagation();
  }

  protected previous(): void {
    this.shiftView(-1);
  }

  protected next(): void {
    this.shiftView(1);
  }

  protected selectMonth(monthIndex: number): void {
    const next = new Date(this.viewDate());
    next.setMonth(monthIndex, 1);
    this.viewDate.set(next);
    this.emitValue(this.mode === 'month' ? this.formatMonth(next) : this.formatDate(next));
    this.closePicker();
  }

  protected selectYear(year: number): void {
    const next = new Date(this.viewDate());
    next.setFullYear(year, 0, 1);
    this.viewDate.set(next);
    this.emitValue(String(year));
    this.closePicker();
  }

  protected selectDay(day: CalendarDay): void {
    const selected = this.mode === 'week' ? this.startOfWeek(day.date) : this.withCurrentTime(day.date);
    this.viewDate.set(selected);
    this.emitValue(this.mode === 'datetime' ? this.formatDateTime(selected) : this.formatDate(selected));
    if (this.mode === 'date' || this.mode === 'week') {
      this.closePicker();
    }
  }

  protected hoverDay(day: CalendarDay): void {
    if (this.mode === 'week') {
      this.hoveredWeekStart.set(this.startOfWeek(day.date));
    }
  }

  protected clearHover(): void {
    this.hoveredWeekStart.set(null);
  }

  protected updateTime(part: 'hours' | 'minutes' | 'seconds', event: Event): void {
    const input = event.target as HTMLInputElement;
    const value = Math.max(0, Math.min(part === 'hours' ? 23 : 59, Number(input.value) || 0));
    const selected = this.parseValue(this.valueState()) ?? new Date(this.viewDate());
    if (part === 'hours') {
      selected.setHours(value);
    } else if (part === 'minutes') {
      selected.setMinutes(value);
    } else {
      selected.setSeconds(value);
    }
    this.emitValue(this.formatDateTime(selected));
  }

  protected timePart(part: 'hours' | 'minutes' | 'seconds'): string {
    const selected = this.parseValue(this.valueState()) ?? new Date(this.viewDate());
    const value = part === 'hours' ? selected.getHours() : part === 'minutes' ? selected.getMinutes() : selected.getSeconds();
    return String(value).padStart(2, '0');
  }

  protected isSelectedMonth(monthIndex: number): boolean {
    const selected = this.parseValue(this.valueState());
    return !!selected && selected.getFullYear() === this.viewDate().getFullYear() && selected.getMonth() === monthIndex;
  }

  protected years(): number[] {
    const start = this.yearGridStart(this.viewDate().getFullYear());
    return Array.from({ length: 12 }, (_, index) => start + index);
  }

  protected isSelectedYear(year: number): boolean {
    const selected = this.parseValue(this.valueState());
    return !!selected && selected.getFullYear() === year;
  }

  private buildCalendarDays(): CalendarDay[] {
    const view = this.viewDate();
    const first = new Date(view.getFullYear(), view.getMonth(), 1);
    const offset = (first.getDay() + 6) % 7;
    const start = new Date(first);
    start.setDate(first.getDate() - offset);
    const selected = this.parseValue(this.valueState());
    const hoveredWeekStart = this.hoveredWeekStart();

    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      const weekSelected = !!selected && this.mode === 'week' && this.isSameWeek(date, selected);
      return {
        date,
        label: date.getDate(),
        outside: date.getMonth() !== view.getMonth(),
        selected: !!selected && this.isSameDate(date, selected),
        weekSelected,
        weekHovered: !!hoveredWeekStart && this.mode === 'week' && this.isSameWeek(date, hoveredWeekStart)
      };
    });
  }

  private shiftView(direction: number): void {
    const next = new Date(this.viewDate());
    if (this.mode === 'month') {
      next.setFullYear(next.getFullYear() + direction);
    } else if (this.mode === 'year') {
      next.setFullYear(next.getFullYear() + direction * 12);
    } else {
      next.setMonth(next.getMonth() + direction);
    }
    this.viewDate.set(next);
  }

  private withCurrentTime(date: Date): Date {
    const selected = this.parseValue(this.valueState()) ?? new Date();
    const next = new Date(date);
    next.setHours(selected.getHours(), selected.getMinutes(), selected.getSeconds(), 0);
    return next;
  }

  private parseValue(value: string): Date | null {
    if (!value) {
      return null;
    }
    if (this.mode === 'month') {
      const [year, month] = value.split('-').map(Number);
      return new Date(year, month - 1, 1);
    }
    if (this.mode === 'year') {
      return new Date(Number(value), 0, 1);
    }
    if (this.mode === 'date' || this.mode === 'week') {
      const [year, month, day] = value.split('-').map(Number);
      return new Date(year, month - 1, day);
    }
    return new Date(value);
  }

  private emitValue(value: string): void {
    this.valueState.set(value);
    this.valueChange.emit(value);
  }

  private closePicker(): void {
    this.fieldOverlayCoordinator.close(this.overlayId);
  }

  private formatDisplayValue(): string {
    const selected = this.parseValue(this.valueState());
    if (!selected) {
      return this.placeholder;
    }
    if (this.mode === 'month') {
      return formatUserMonth(selected, this.dateFormatState());
    }
    if (this.mode === 'year') {
      return String(selected.getFullYear());
    }
    if (this.mode === 'week') {
      const end = new Date(selected);
      end.setDate(selected.getDate() + 6);
      return `${formatUserDate(selected, this.dateFormatState())} - ${formatUserDate(end, this.dateFormatState())}`;
    }
    if (this.mode === 'datetime') {
      return `${formatUserDate(selected, this.dateFormatState())}, ${this.pad(selected.getHours())}:${this.pad(selected.getMinutes())}:${this.pad(selected.getSeconds())}`;
    }
    return formatUserDate(selected, this.dateFormatState());
  }

  private formatDate(date: Date): string {
    return `${date.getFullYear()}-${this.pad(date.getMonth() + 1)}-${this.pad(date.getDate())}`;
  }

  private formatMonth(date: Date): string {
    return `${date.getFullYear()}-${this.pad(date.getMonth() + 1)}`;
  }

  private formatDateTime(date: Date): string {
    return `${this.formatDate(date)}T${this.pad(date.getHours())}:${this.pad(date.getMinutes())}:${this.pad(date.getSeconds())}`;
  }

  private isSameDate(first: Date, second: Date): boolean {
    return first.getFullYear() === second.getFullYear()
      && first.getMonth() === second.getMonth()
      && first.getDate() === second.getDate();
  }

  private isSameWeek(first: Date, second: Date): boolean {
    return this.isSameDate(this.startOfWeek(first), this.startOfWeek(second));
  }

  private startOfWeek(date: Date): Date {
    const start = new Date(date);
    const day = (start.getDay() + 6) % 7;
    start.setDate(start.getDate() - day);
    start.setHours(0, 0, 0, 0);
    return start;
  }

  private yearGridStart(year: number): number {
    return year - (year % 12);
  }

  private pad(value: number): string {
    return String(value).padStart(2, '0');
  }
}
