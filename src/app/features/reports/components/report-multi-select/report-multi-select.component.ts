import { Component, ElementRef, EventEmitter, HostListener, Input, Output, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

export interface ReportMultiSelectOption {
  value: string;
  label: string;
}

@Component({
  selector: 'app-report-multi-select',
  imports: [MatIconModule],
  templateUrl: './report-multi-select.component.html',
  styleUrl: './report-multi-select.component.scss'
})
export class ReportMultiSelectComponent {
  @Input() label = '';
  @Input() placeholder = '';
  @Input() options: ReportMultiSelectOption[] = [];
  @Input() selectedValues: string[] = [];
  @Output() readonly selectedValuesChange = new EventEmitter<string[]>();

  protected readonly open = signal(false);
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
    }
  }

  protected toggleOpen(): void {
    this.open.update((open) => !open);
  }

  protected toggleValue(value: string): void {
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

  private selectedSet(): Set<string> {
    return new Set(this.selectedValues);
  }
}
