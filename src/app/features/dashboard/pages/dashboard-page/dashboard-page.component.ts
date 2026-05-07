import { CurrencyPipe, DatePipe, NgTemplateOutlet } from '@angular/common';
import { Component, OnDestroy, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { AuthStateFacade } from '../../../../shared/state/auth/auth-state.facade';
import { DatePickerComponent } from '../../../../shared/ui/date-picker/date-picker.component';
import {
  CreateTimeEntryRequest,
  TimeEntry,
  TimeEntryFilters,
  UpdateTimeEntryRequest
} from '../../models/time-entry.model';
import { FiltersForm, ManualForm, TimerForm } from '../../models/dashboard-form.model';
import { TimeEntryService } from '../../services/time-entry.service';

const emptyTimerForm: TimerForm = {
  projectName: '',
  description: '',
  hourlyRate: null
};

@Component({
  selector: 'app-dashboard-page',
  imports: [CurrencyPipe, DatePipe, FormsModule, MatIconModule, NgTemplateOutlet, DatePickerComponent, TranslatePipe],
  templateUrl: './dashboard-page.component.html',
  styleUrl: './dashboard-page.component.scss'
})
export class DashboardPageComponent implements OnDestroy {
  protected readonly translationPath = 'features.dashboard.';
  protected readonly entries = signal<TimeEntry[]>([]);
  protected readonly loading = signal(false);
  protected readonly loadError = signal<string | null>(null);
  protected readonly timerError = signal<string | null>(null);
  protected readonly manualEntryError = signal<string | null>(null);
  protected readonly filtersError = signal<string | null>(null);
  protected readonly entriesError = signal<string | null>(null);
  protected readonly currentTime = signal(new Date());
  protected readonly user;

  protected timerForm: TimerForm = { ...emptyTimerForm };
  protected manualForm: ManualForm = this.defaultManualForm();
  protected filters: FiltersForm;
  protected editingEntryId = signal<string | null>(null);
  protected editForm: ManualForm = this.defaultManualForm();

  protected readonly activeEntry = computed(() => this.entries().find((entry) => entry.active) ?? null);
  protected readonly completedEntries = computed(() => this.entries().filter((entry) => !entry.active));
  protected readonly totalSeconds = computed(() =>
    this.entries().reduce((totalSeconds, entry) => totalSeconds + this.liveDuration(entry), 0)
  );
  protected readonly totalAmount = computed(() =>
    this.entries().reduce((totalAmount, entry) => totalAmount + this.amountFor(entry), 0)
  );
  protected readonly entryCount = computed(() => this.entries().length);

  private readonly timer = window.setInterval(() => this.currentTime.set(new Date()), 1000);

  constructor(
    private readonly authState: AuthStateFacade,
    private readonly timeEntryService: TimeEntryService,
    private readonly translateService: TranslateService
  ) {
    this.user = this.authState.user;
    this.filters = {
      month: this.currentMonth(),
      day: '',
      project: '',
      userId: this.user()?.id ?? ''
    };
    this.loadDashboard();
  }

  ngOnDestroy(): void {
    window.clearInterval(this.timer);
  }

  protected async loadDashboard(): Promise<void> {
    this.loading.set(true);
    this.loadError.set(null);
    try {
      const filters = this.requestFilters();
      const entries = await this.timeEntryService.list(filters);
      this.entries.set(entries);
    } catch {
      this.loadError.set(this.translation('error.load'));
    } finally {
      this.loading.set(false);
    }
  }

  protected async startTimer(): Promise<void> {
    this.timerError.set(null);
    const hourlyRate = this.timerForm.hourlyRate;
    if (!this.timerForm.projectName.trim() || !hourlyRate) {
      this.timerError.set(this.translation('error.timerRequired'));
      return;
    }

    await this.runAction(this.timerError, async () => {
      await this.timeEntryService.start({
        projectName: this.timerForm.projectName,
        description: this.timerForm.description || null,
        hourlyRate
      });
      this.timerForm = { ...emptyTimerForm };
    });
  }

  protected async stopTimer(entry: TimeEntry): Promise<void> {
    await this.runAction(this.entriesError, () => this.timeEntryService.stop(entry.id));
  }

  protected async createManualEntry(): Promise<void> {
    this.manualEntryError.set(null);
    const request = this.manualRequest();
    if (!request) {
      return;
    }

    await this.runAction(this.manualEntryError, async () => {
      await this.timeEntryService.create(request);
      this.manualForm = this.defaultManualForm();
    });
  }

  protected startEdit(entry: TimeEntry): void {
    this.entriesError.set(null);
    this.editingEntryId.set(entry.id);
    this.editForm = {
      projectName: entry.projectName,
      description: entry.description ?? '',
      hourlyRate: Number(entry.hourlyRate),
      startedAt: this.toInputDateTime(entry.startedAt),
      endedAt: entry.endedAt ? this.toInputDateTime(entry.endedAt) : ''
    };
  }

  protected cancelEdit(): void {
    this.editingEntryId.set(null);
  }

  protected async saveEdit(entry: TimeEntry): Promise<void> {
    this.entriesError.set(null);
    const request = this.updateRequest(entry.active);
    if (!request) {
      return;
    }

    await this.runAction(this.entriesError, async () => {
      await this.timeEntryService.update(entry.id, request);
      this.editingEntryId.set(null);
    });
  }

  protected async deleteEntry(entry: TimeEntry): Promise<void> {
    if (!window.confirm(this.translation('entry.deleteConfirm', { projectName: entry.projectName }))) {
      return;
    }
    await this.runAction(this.entriesError, () => this.timeEntryService.delete(entry.id));
  }

  protected applyFilters(): void {
    this.filtersError.set(null);
    this.loadDashboard();
  }

  protected clearFilters(): void {
    this.filtersError.set(null);
    this.filters = {
      month: this.currentMonth(),
      day: '',
      project: '',
      userId: this.user()?.id ?? ''
    };
    this.loadDashboard();
  }

  protected durationLabel(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = seconds % 60;
    return `${hours}h ${minutes}m ${remainingSeconds}s`;
  }

  protected liveDuration(entry: TimeEntry): number {
    const startedAt = new Date(entry.startedAt).getTime();
    const endedAt = entry.endedAt ? new Date(entry.endedAt).getTime() : this.currentTime().getTime();
    return Math.max(0, Math.floor((endedAt - startedAt) / 1000));
  }

  protected amountFor(entry: TimeEntry): number {
    return Number(entry.hourlyRate) * (this.liveDuration(entry) / 3600);
  }

  private async runAction(errorState: ReturnType<typeof signal<string | null>>, action: () => Promise<unknown>): Promise<void> {
    this.loading.set(true);
    errorState.set(null);
    try {
      await action();
      await this.loadDashboard();
    } catch {
      errorState.set(this.translation('error.actionFailed'));
    } finally {
      this.loading.set(false);
    }
  }

  private manualRequest(): CreateTimeEntryRequest | null {
    if (!this.manualForm.projectName.trim() || !this.manualForm.hourlyRate || !this.manualForm.startedAt || !this.manualForm.endedAt) {
      this.manualEntryError.set(this.translation('error.manualRequired'));
      return null;
    }

    return {
      projectName: this.manualForm.projectName,
      description: this.manualForm.description || null,
      hourlyRate: this.manualForm.hourlyRate,
      startedAt: this.toIsoDateTime(this.manualForm.startedAt),
      endedAt: this.toIsoDateTime(this.manualForm.endedAt)
    };
  }

  private updateRequest(isActive: boolean): UpdateTimeEntryRequest | null {
    if (!this.editForm.projectName.trim() || !this.editForm.hourlyRate || !this.editForm.startedAt) {
      this.entriesError.set(this.translation('error.editRequired'));
      return null;
    }
    if (!isActive && !this.editForm.endedAt) {
      this.entriesError.set(this.translation('error.editEndRequired'));
      return null;
    }

    return {
      projectName: this.editForm.projectName,
      description: this.editForm.description || null,
      hourlyRate: this.editForm.hourlyRate,
      startedAt: this.toIsoDateTime(this.editForm.startedAt),
      endedAt: this.editForm.endedAt ? this.toIsoDateTime(this.editForm.endedAt) : null
    };
  }

  private requestFilters(): TimeEntryFilters {
    return {
      month: this.filters.day ? undefined : this.filters.month || undefined,
      day: this.filters.day || undefined,
      project: this.filters.project.trim() || undefined,
      userId: this.filters.userId || undefined
    };
  }

  private defaultManualForm(): ManualForm {
    const now = new Date();
    const end = new Date(now.getTime());
    const start = new Date(now.getTime() - 60 * 60 * 1000);
    return {
      projectName: '',
      description: '',
      hourlyRate: null,
      startedAt: this.toInputDateTime(start.toISOString()),
      endedAt: this.toInputDateTime(end.toISOString())
    };
  }

  private currentMonth(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }

  private toIsoDateTime(value: string): string {
    return new Date(value).toISOString();
  }

  private toInputDateTime(value: string): string {
    const date = new Date(value);
    date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
    return date.toISOString().slice(0, 19);
  }

  private translation(key: string, params: Record<string, string> = {}): string {
    return this.translateService.instant(`${this.translationPath}${key}`, params);
  }
}
