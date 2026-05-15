import { Component, EventEmitter, HostListener, Input, Output, computed, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { FieldOverlayCoordinatorService } from '../field-overlay-coordinator.service';
import { TimePreset } from './models/time-picker.model';

@Component({
  selector: 'app-time-picker',
  imports: [MatIconModule],
  templateUrl: './time-picker.component.html',
  styleUrl: './time-picker.component.scss'
})
export class TimePickerComponent {
  @Input() label = 'Time';
  @Input() placeholder = 'Select time';
  @Input() disabled = false;
  @Input() set value(value: string) {
    this.valueState.set(this.normalizeTime(value));
  }
  @Output() readonly valueChange = new EventEmitter<string>();

  protected readonly presets: TimePreset[] = [
    { label: '08:00', value: '08:00' },
    { label: '09:00', value: '09:00' },
    { label: '12:00', value: '12:00' },
    { label: '13:00', value: '13:00' },
    { label: '17:00', value: '17:00' },
    { label: '18:00', value: '18:00' }
  ];
  private readonly overlayId = Symbol('time-picker');
  protected readonly open = computed(() => this.fieldOverlayCoordinator.isOpen(this.overlayId));
  protected readonly valueState = signal('');
  protected readonly displayValue = computed(() => this.valueState() || this.placeholder);

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

  protected selectPreset(preset: TimePreset): void {
    this.setValue(preset.value);
    this.closePicker();
  }

  protected adjustMinutes(delta: number): void {
    const minutes = this.valueToMinutes(this.valueState() || '09:00');
    this.setValue(this.minutesToValue(minutes + delta));
  }

  protected updatePart(part: 'hours' | 'minutes', event: Event): void {
    const input = event.target as HTMLInputElement;
    const current = this.valueState() || '09:00';
    const [hours, minutes] = current.split(':').map(Number);
    const nextHours = part === 'hours' ? this.clamp(Number(input.value), 0, 23) : hours;
    const nextMinutes = part === 'minutes' ? this.clamp(Number(input.value), 0, 59) : minutes;
    this.setValue(`${this.pad(nextHours)}:${this.pad(nextMinutes)}`);
  }

  protected timePart(part: 'hours' | 'minutes'): string {
    const [hours, minutes] = (this.valueState() || '09:00').split(':');
    return part === 'hours' ? hours : minutes;
  }

  protected isPresetSelected(preset: TimePreset): boolean {
    return this.valueState() === preset.value;
  }

  private setValue(value: string): void {
    const next = this.normalizeTime(value);
    this.valueState.set(next);
    this.valueChange.emit(next);
  }

  private closePicker(): void {
    this.fieldOverlayCoordinator.close(this.overlayId);
  }

  private normalizeTime(value: string): string {
    if (!value) {
      return '';
    }
    const [rawHours, rawMinutes] = value.split(':').map(Number);
    const hours = this.clamp(rawHours || 0, 0, 23);
    const minutes = this.clamp(rawMinutes || 0, 0, 59);
    return `${this.pad(hours)}:${this.pad(minutes)}`;
  }

  private valueToMinutes(value: string): number {
    const [hours, minutes] = value.split(':').map(Number);
    return hours * 60 + minutes;
  }

  private minutesToValue(value: number): string {
    const dayMinutes = 24 * 60;
    const wrapped = ((value % dayMinutes) + dayMinutes) % dayMinutes;
    return `${this.pad(Math.floor(wrapped / 60))}:${this.pad(wrapped % 60)}`;
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
  }

  private pad(value: number): string {
    return String(value).padStart(2, '0');
  }
}
