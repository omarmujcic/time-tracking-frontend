import { Component, ElementRef, EventEmitter, HostListener, Input, Output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { ReportMultiSelectOption } from './report-multi-select.model';

@Component({
  selector: 'app-report-multi-select',
  imports: [FormsModule, MatIconModule],
  templateUrl: './report-multi-select.component.html',
  styleUrl: './report-multi-select.component.scss'
})
export class ReportMultiSelectComponent {
  @Input() label = '';
  @Input() placeholder = '';
  @Input() options: ReportMultiSelectOption[] = [];
  @Input() selectedValues: string[] = [];
  @Input() multiple = true;
  @Input() createLabel = '';
  @Input() createPlaceholder = 'Name';
  @Output() readonly selectedValuesChange = new EventEmitter<string[]>();
  @Output() readonly createOption = new EventEmitter<string>();

  protected readonly open = signal(false);
  protected readonly creating = signal(false);
  protected createValue = '';
  protected get sortedOptions(): ReportMultiSelectOption[] {
    const selected = this.selectedSet();
    return [...this.options].sort((first, second) => {
      const firstSelected = selected.has(first.value);
      const secondSelected = selected.has(second.value);
      if (firstSelected !== secondSelected) {
        return firstSelected ? -1 : 1;
      }
      return first.label.localeCompare(second.label);
    });
  }

  protected get displayValue(): string {
    if (!this.selectedValues.length) {
      return this.placeholder;
    }

    const labels = this.options
      .filter((option) => this.selectedSet().has(option.value))
      .map((option) => option.label);
    return labels.join(', ');
  }

  constructor(private readonly elementRef: ElementRef<HTMLElement>) {}

  @HostListener('document:click', ['$event'])
  protected closeOnOutsideClick(event: MouseEvent): void {
    if (!this.elementRef.nativeElement.contains(event.target as Node)) {
      this.open.set(false);
      this.creating.set(false);
    }
  }

  protected toggleOpen(): void {
    this.open.update((open) => !open);
    if (this.open()) {
      return;
    }
    this.creating.set(false);
    this.createValue = '';
  }

  protected toggleValue(value: string): void {
    if (!this.multiple) {
      this.selectedValuesChange.emit([value]);
      this.open.set(false);
      this.creating.set(false);
      return;
    }

    const selected = this.selectedSet();
    if (selected.has(value)) {
      selected.delete(value);
    } else {
      selected.add(value);
    }
    this.selectedValuesChange.emit([...selected]);
  }

  protected isSelected(value: string): boolean {
    return this.selectedSet().has(value);
  }

  protected startCreating(event: MouseEvent): void {
    event.stopPropagation();
    this.createValue = '';
    this.creating.set(true);
  }

  protected cancelCreating(): void {
    this.creating.set(false);
    this.createValue = '';
  }

  protected submitCreate(): void {
    const value = this.createValue.trim();
    if (!value) {
      return;
    }
    this.createOption.emit(value);
    this.creating.set(false);
    this.createValue = '';
    this.open.set(false);
  }

  private selectedSet(): Set<string> {
    return new Set(this.selectedValues);
  }
}
