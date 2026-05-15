import { NgTemplateOutlet } from '@angular/common';
import { Component, OnDestroy, computed, effect, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { AuthStateFacade } from '../../../../shared/state/auth/auth-state.facade';
import { ActiveTimerFacade } from '../../../../shared/state/timer/active-timer.facade';
import { WorkspaceStateFacade } from '../../../../shared/state/workspace/workspace-state.facade';
import { ConfirmationDialogService } from '../../../../shared/ui/confirm-dialog/confirm-dialog.service';
import { DatePickerComponent } from '../../../../shared/ui/date-picker/date-picker.component';
import { NotificationToastService } from '../../../../shared/ui/notification-toast/notification-toast.service';
import { TimePickerComponent } from '../../../../shared/ui/time-picker/time-picker.component';
import { httpErrorMessage } from '../../../../shared/utils/http-error-message';
import {
  formatUserCurrency,
  formatUserDate,
  formatUserDateTime,
  formatUserRateInput,
  parseUserDecimal
} from '../../../../shared/utils/user-formatting';
import {
  dateWithInputTime,
  inputDateTimeRange,
  toInputDate,
  toInputTime
} from '../../../../shared/utils/input-date-time';
import { PreferenceService } from '../../../settings/services/preference.service';
import { OrganizationMember, ProjectTask, UserPreference } from '../../../settings/models/settings.model';
import { ProjectService } from '../../../settings/services/project.service';
import { WorkspaceService } from '../../../settings/services/workspace.service';
import { ReportMultiSelectComponent } from '../../../reports/components/report-multi-select/report-multi-select.component';
import { ReportMultiSelectOption } from '../../../reports/components/report-multi-select/report-multi-select.model';
import {
  CreateTimeEntryRequest,
  TimeEntry,
  TimeEntryFilters,
  TimeEntryPage,
  TimeEntrySummary,
  UpdateTimeEntryRequest
} from '../../models/time-entry.model';
import { DayEntryGroup, ProjectEntryGroup } from '../../models/entry-group.model';
import {
  EditTimeEntryForm,
  EntryDetailsForm,
  FiltersForm,
  ManualEntryTimeFields,
  ManualForm,
  TimerForm
} from '../../models/dashboard-form.model';
import { TimeEntryService } from '../../services/time-entry.service';

const emptyTimerForm: TimerForm = {
  projectId: '',
  taskId: '',
  projectName: '',
  hourlyRate: null
};

const emptySummary: TimeEntrySummary = {
  totalSeconds: 0,
  totalAmount: 0,
  currency: 'EUR',
  entryCount: 0,
  hasActiveTimer: false
};

const defaultPreference: UserPreference = {
  language: 'en',
  themeMode: 'SYSTEM',
  groupedEntriesEnabled: true,
  includeOrganizationEntriesInPersonalReports: true,
  dateFormat: 'YYYY-MM-DD',
  decimalSeparator: 'DOT',
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
};

@Component({
  selector: 'app-dashboard-page',
  imports: [
    FormsModule,
    MatIconModule,
    NgTemplateOutlet,
    DatePickerComponent,
    ReportMultiSelectComponent,
    TimePickerComponent,
    TranslatePipe
  ],
  templateUrl: './dashboard-page.component.html',
  styleUrl: './dashboard-page.component.scss'
})
export class DashboardPageComponent implements OnDestroy {
  protected readonly translationPath = 'features.dashboard.';
  protected readonly entries = signal<TimeEntry[]>([]);
  protected readonly entryPage = signal<TimeEntryPage | null>(null);
  protected readonly summary = signal<TimeEntrySummary>({ ...emptySummary });
  protected readonly loading = signal(false);
  protected readonly loadError = signal<string | null>(null);
  protected readonly timerError = signal<string | null>(null);
  protected readonly manualEntryError = signal<string | null>(null);
  protected readonly filtersError = signal<string | null>(null);
  protected readonly entriesError = signal<string | null>(null);
  protected readonly taskError = signal<string | null>(null);
  protected readonly timerDetailsEditorOpen = signal(false);
  protected readonly currentTime = signal(new Date());
  protected readonly groupedEntriesEnabled = signal(true);
  protected readonly expandedDays = signal<Set<string>>(new Set());
  protected readonly expandedProjects = signal<Set<string>>(new Set());
  protected readonly preferences = signal<UserPreference>({ ...defaultPreference });
  protected readonly organizationMembers = signal<OrganizationMember[]>([]);
  protected readonly pageNumber = signal(1);
  protected readonly hasPreviousPage = signal(false);
  protected readonly user;
  protected readonly projects;

  private readonly manualEntryTimeFieldsSessionKey = 'dashboard.manualEntry.timeFields.v1';
  protected timerForm: TimerForm = { ...emptyTimerForm };
  protected manualForm: ManualForm = this.defaultManualForm();
  protected filters: FiltersForm;
  protected editingEntryId = signal<string | null>(null);
  protected editForm: EditTimeEntryForm = this.defaultEditForm();

  protected readonly sortedEntries = computed(() => this.sortEntries(this.entries()));
  protected readonly activeEntry = computed(() => this.sortedEntries().find((entry) => entry.active) ?? null);
  protected readonly completedEntries = computed(() => this.sortedEntries().filter((entry) => !entry.active));
  protected readonly dayEntryGroups = computed(() => this.entryGroupsByDay(this.entries()));
  protected readonly totalSeconds = computed(() => this.summary().totalSeconds + this.activeSummaryElapsedSeconds());
  protected readonly totalAmount = computed(() => {
    const summary = this.summary();
    const activeEntry = this.activeTimer.activeEntry();
    if (!summary.hasActiveTimer || !activeEntry) {
      return summary.totalAmount;
    }
    return summary.totalAmount + Number(activeEntry.hourlyRate) * (this.activeSummaryElapsedSeconds() / 3600);
  });
  protected readonly entryCount = computed(() => this.summary().entryCount);
  protected readonly shownEntryCount = computed(() => this.entries().length);
  protected readonly hasNextPage = computed(() => this.entryPage()?.hasNext ?? false);
  protected readonly activeProjectOptions = computed<ReportMultiSelectOption[]>(() =>
    this.projects()
      .filter((project) => project.status === 'ACTIVE')
      .map((project) => ({ value: project.id, label: project.name }))
  );
  protected readonly filterProjectOptions = computed<ReportMultiSelectOption[]>(() =>
    this.projects().map((project) => ({ value: project.name, label: project.name }))
  );
  protected readonly userFilterOptions = computed<ReportMultiSelectOption[]>(() => {
    const members = this.organizationMembers();
    if (members.length) {
      return members.map((member) => ({
        value: member.userId,
        label: member.displayName || member.username
      }));
    }
    const currentUser = this.user();
    return currentUser
      ? [{ value: currentUser.id, label: currentUser.displayName || currentUser.username }]
      : [];
  });
  protected readonly activeTimerNeedsDetails = computed(() => {
    const entry = this.activeTimer.activeEntry();
    return Boolean(entry && (!entry.projectId || Number(entry.hourlyRate) <= 0));
  });
  protected readonly showTimerDetailsEditor = computed(() =>
    !this.activeTimer.activeEntry() || this.timerDetailsEditorOpen() || this.activeTimerNeedsDetails()
  );

  private readonly timer = window.setInterval(() => this.currentTime.set(new Date()), 1000);
  private readonly pageSize = 100;
  private readonly summaryLoadedAt = signal<Date | null>(null);
  private readonly cursorHistory: (string | null)[] = [];
  private currentCursor: string | null = null;
  private currentWorkspaceKey = '';

  constructor(
    private readonly authState: AuthStateFacade,
    private readonly workspaceState: WorkspaceStateFacade,
    private readonly workspaceService: WorkspaceService,
    private readonly projectService: ProjectService,
    private readonly timeEntryService: TimeEntryService,
    private readonly preferenceService: PreferenceService,
    protected readonly activeTimer: ActiveTimerFacade,
    private readonly confirmationDialog: ConfirmationDialogService,
    private readonly notifications: NotificationToastService,
    private readonly route: ActivatedRoute,
    private readonly translateService: TranslateService
  ) {
    this.user = this.authState.user;
    this.projects = this.workspaceState.projects;
    this.filters = this.defaultFilters();
    this.timerDetailsEditorOpen.set(this.route.snapshot.queryParamMap.get('editTimer') === 'true');
    this.loadDashboard();
    this.workspaceState.load();
    this.preferenceService.get()
      .then((preferences) => {
        this.preferences.set(preferences);
        this.groupedEntriesEnabled.set(preferences.groupedEntriesEnabled);
        this.resetPagination();
        void this.loadDashboard(null);
      })
      .catch(() => undefined);
    effect(() => {
      const workspaceKey = this.workspaceState.activeWorkspaceKey();
      if (!workspaceKey || workspaceKey === this.currentWorkspaceKey) {
        return;
      }
      this.currentWorkspaceKey = workspaceKey;
      this.resetWorkspaceForms();
      void this.loadOrganizationMembers();
      void this.loadDashboard();
    });
  }

  ngOnDestroy(): void {
    window.clearInterval(this.timer);
  }

  protected async loadDashboard(cursor: string | null = this.currentCursor): Promise<boolean> {
    this.loading.set(true);
    this.loadError.set(null);
    try {
      const filters = this.requestFilters();
      const [page, summary, , activeEntry] = await Promise.all([
        this.timeEntryService.list(this.requestPageFilters(filters, cursor)),
        this.timeEntryService.summary(filters),
        this.loadOrganizationMembers(),
        this.activeTimer.loadActive()
      ]);
      this.entries.set(page.entries);
      this.entryPage.set(page);
      this.summary.set(summary);
      this.summaryLoadedAt.set(new Date());
      this.currentCursor = cursor;
      this.syncTimerForm(activeEntry);
      this.expandEntryGroups();
      return true;
    } catch (error) {
      const message = httpErrorMessage(error, this.translation('error.load'));
      this.loadError.set(message);
      this.notifications.error(message, 'Could not load dashboard');
      return false;
    } finally {
      this.loading.set(false);
    }
  }

  protected async submitTimerForm(): Promise<void> {
    const activeEntry = this.activeTimer.activeEntry();
    if (activeEntry) {
      if (this.showTimerDetailsEditor()) {
        await this.saveActiveTimerDetails(activeEntry);
      } else {
        await this.stopTimerFromForm(activeEntry);
      }
      return;
    }
    await this.startTimer();
  }

  protected async startTimer(): Promise<void> {
    this.timerError.set(null);

    await this.runAction(this.timerError, async () => {
      await this.timeEntryService.start({
        projectId: this.timerForm.projectId || null,
        taskId: this.timerForm.taskId || null,
        projectName: this.timerForm.projectName || null,
        hourlyRate: this.timerForm.hourlyRate
      });
      this.timerForm = { ...emptyTimerForm };
    }, 'Timer started.');
  }

  protected async stopTimerFromForm(entry: TimeEntry): Promise<void> {
    this.timerError.set(null);
    if (!this.timerForm.projectId || !this.timerForm.hourlyRate) {
      this.showFormError(this.timerError, this.translation('error.timerRequired'));
      return;
    }
    const hourlyRate = this.timerForm.hourlyRate;
    const stopped = await this.runAction(this.timerError, async () => {
      await this.timeEntryService.update(entry.id, {
        projectId: this.timerForm.projectId,
        taskId: this.timerForm.taskId || null,
        projectName: this.timerForm.projectName,
        hourlyRate,
        startedAt: entry.startedAt,
        endedAt: null
      });
      await this.timeEntryService.stop(entry.id);
      this.timerForm = { ...emptyTimerForm };
    }, 'Timer stopped.');
    if (stopped) {
      this.timerDetailsEditorOpen.set(false);
    }
  }

  protected openTimerDetailsEditor(): void {
    this.timerDetailsEditorOpen.set(true);
  }

  protected async saveActiveTimerDetails(entry: TimeEntry): Promise<void> {
    this.timerError.set(null);
    if (!this.timerForm.projectId || !this.timerForm.hourlyRate) {
      this.showFormError(this.timerError, this.translation('error.timerRequired'));
      return;
    }
    const hourlyRate = this.timerForm.hourlyRate;
    const saved = await this.runAction(this.timerError, async () => {
      await this.timeEntryService.update(entry.id, {
        projectId: this.timerForm.projectId,
        taskId: this.timerForm.taskId || null,
        projectName: this.timerForm.projectName,
        hourlyRate,
        startedAt: entry.startedAt,
        endedAt: null
      });
    }, 'Timer details saved.');
    if (saved) {
      this.timerDetailsEditorOpen.set(false);
    }
  }

  protected async stopTimer(entry: TimeEntry): Promise<void> {
    if (!this.canStopEntry(entry)) {
      this.showFormError(this.entriesError, 'Select a project and hourly rate before stopping the timer.');
      return;
    }
    await this.runAction(this.entriesError, () => this.timeEntryService.stop(entry.id), 'Timer stopped.');
  }

  protected async continueEntry(entry: TimeEntry): Promise<void> {
    await this.runAction(this.entriesError, async () => {
      await this.timeEntryService.start({
        projectId: entry.projectId,
        taskId: entry.taskId,
        projectName: entry.projectName,
        hourlyRate: Number(entry.hourlyRate)
      });
    }, 'Timer continued.');
  }

  protected async createManualEntry(): Promise<void> {
    this.manualEntryError.set(null);
    const request = this.manualRequest();
    if (!request) {
      return;
    }
    const created = await this.runAction(this.manualEntryError, () => this.timeEntryService.create(request), 'Time entry added.');
    if (created) {
      this.manualForm = this.defaultManualForm();
    }
  }

  protected updateManualDate(value: string): void {
    this.manualForm.date = value;
    this.persistManualEntryTimeFields();
  }

  protected updateManualStartTime(value: string): void {
    this.manualForm.startTime = value;
    this.persistManualEntryTimeFields();
  }

  protected updateManualEndTime(value: string): void {
    this.manualForm.endTime = value;
    this.persistManualEntryTimeFields();
  }

  protected startEdit(entry: TimeEntry): void {
    this.entriesError.set(null);
    const startedAt = new Date(entry.startedAt);
    const endedAt = entry.endedAt ? new Date(entry.endedAt) : null;
    this.editingEntryId.set(entry.id);
    this.editForm = {
      projectName: entry.projectName,
      projectId: entry.projectId ?? '',
      taskId: entry.taskId ?? '',
      hourlyRate: Number(entry.hourlyRate),
      date: toInputDate(startedAt),
      startTime: toInputTime(startedAt),
      endTime: endedAt ? toInputTime(endedAt) : ''
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
    }, 'Time entry updated.');
  }

  protected async deleteEntry(entry: TimeEntry): Promise<void> {
    const confirmed = await this.confirmationDialog.confirm({
      title: this.translation('entry.deleteTitle'),
      message: this.translation('entry.deleteConfirm', { projectName: entry.projectName }),
      confirmText: this.translation('entry.delete'),
      icon: 'delete',
      variant: 'danger'
    });
    if (!confirmed) {
      return;
    }
    await this.runAction(this.entriesError, () => this.timeEntryService.delete(entry.id), 'Time entry deleted.');
  }

  protected applyFilters(): void {
    this.filtersError.set(null);
    this.resetPagination();
    this.loadDashboard(null);
  }

  protected clearFilters(): void {
    this.filtersError.set(null);
    this.filters = this.defaultFilters();
    this.resetPagination();
    this.loadDashboard(null);
  }

  protected async nextPage(): Promise<void> {
    const nextCursor = this.entryPage()?.nextCursor;
    if (!nextCursor) {
      return;
    }
    const previousCursor = this.currentCursor;
    const previousPageNumber = this.pageNumber();
    this.cursorHistory.push(previousCursor);
    this.hasPreviousPage.set(true);
    this.pageNumber.set(previousPageNumber + 1);
    const loaded = await this.loadDashboard(nextCursor);
    if (!loaded) {
      this.cursorHistory.pop();
      this.hasPreviousPage.set(this.cursorHistory.length > 0);
      this.pageNumber.set(previousPageNumber);
    }
  }

  protected async previousPage(): Promise<void> {
    const targetCursor = this.cursorHistory.pop();
    if (targetCursor === undefined) {
      return;
    }
    const previousPageNumber = this.pageNumber();
    this.hasPreviousPage.set(this.cursorHistory.length > 0);
    this.pageNumber.set(Math.max(1, previousPageNumber - 1));
    const loaded = await this.loadDashboard(targetCursor);
    if (!loaded) {
      this.cursorHistory.push(targetCursor);
      this.hasPreviousPage.set(true);
      this.pageNumber.set(previousPageNumber);
    }
  }

  protected onProjectSelected(form: EntryDetailsForm): void {
    const project = this.projects().find((option) => option.id === form.projectId);
    form.projectName = project?.name ?? '';
    form.taskId = '';
    if (project) {
      form.hourlyRate = Number(project.hourlyRate);
    }
    this.syncActiveTimerDetails(form);
  }

  protected tasksFor(projectId: string) {
    return this.projects().find((project) => project.id === projectId)?.tasks ?? [];
  }

  protected taskOptionsFor(projectId: string): ReportMultiSelectOption[] {
    return this.tasksFor(projectId)
      .filter((task) => task.status === 'ACTIVE')
      .map((task) => ({ value: task.id, label: task.name }));
  }

  protected selectedValue(value: string): string[] {
    return value ? [value] : [];
  }

  protected onProjectValuesSelected(form: EntryDetailsForm, values: string[]): void {
    form.projectId = values[0] ?? '';
    this.onProjectSelected(form);
  }

  protected onTaskValuesSelected(form: EntryDetailsForm, values: string[]): void {
    form.taskId = values[0] ?? '';
    this.syncActiveTimerDetails(form);
  }

  protected async createTask(target: 'timer' | 'manual' | 'edit', name: string): Promise<void> {
    this.taskError.set(null);
    const form = this.formForTarget(target);
    if (!form.projectId) {
      this.showFormError(this.taskError, 'Select a project before creating a task.');
      return;
    }
    if (!name.trim()) {
      this.showFormError(this.taskError, 'Task name is required.');
      return;
    }

    this.loading.set(true);
    try {
      const task = await this.projectService.createTask(form.projectId, {
        name: name.trim(),
        status: 'ACTIVE'
      });
      await this.workspaceState.refreshProjects();
      form.taskId = task.id;
      this.syncActiveTimerDetails(form, task);
      this.notifications.success('Task created.');
    } catch (error) {
      const message = httpErrorMessage(error, 'Unable to create task.');
      this.taskError.set(message);
      this.notifications.error(message);
    } finally {
      this.loading.set(false);
    }
  }

  protected toggleDay(dayKey: string): void {
    const expanded = new Set(this.expandedDays());
    if (expanded.has(dayKey)) {
      expanded.delete(dayKey);
    } else {
      expanded.add(dayKey);
    }
    this.expandedDays.set(expanded);
  }

  protected isDayExpanded(dayKey: string): boolean {
    return this.expandedDays().has(dayKey);
  }

  protected expandAllEntryGroups(): void {
    const dayGroups = this.dayEntryGroups();
    this.expandedDays.set(new Set(dayGroups.map((dayGroup) => dayGroup.key)));
    this.expandedProjects.set(new Set(dayGroups.flatMap((dayGroup) =>
      dayGroup.projects.map((projectGroup) => projectGroup.key)
    )));
  }

  protected minimizeAllEntryGroups(): void {
    this.expandedDays.set(new Set());
    this.expandedProjects.set(new Set());
  }

  protected toggleProject(dayKey: string, projectName: string): void {
    const key = this.projectExpansionKey(dayKey, projectName);
    const expanded = new Set(this.expandedProjects());
    if (expanded.has(key)) {
      expanded.delete(key);
    } else {
      expanded.add(key);
    }
    this.expandedProjects.set(expanded);
  }

  protected isProjectExpanded(dayKey: string, projectName: string): boolean {
    return this.expandedProjects().has(this.projectExpansionKey(dayKey, projectName));
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

  protected money(value: number): string {
    return formatUserCurrency(value, this.preferences());
  }

  protected dateTime(value: string): string {
    return formatUserDateTime(value, this.preferences());
  }

  protected rateInput(value: number | null): string {
    return formatUserRateInput(value, this.preferences());
  }

  protected updateRate(form: EntryDetailsForm, value: string): void {
    form.hourlyRate = parseUserDecimal(value, this.preferences().decimalSeparator);
    this.syncActiveTimerDetails(form);
  }

  protected canStopEntry(entry: TimeEntry): boolean {
    return !!entry.projectId && Number(entry.hourlyRate) > 0;
  }

  private async runAction(
    errorState: ReturnType<typeof signal<string | null>>,
    action: () => Promise<unknown>,
    successMessage?: string
  ): Promise<boolean> {
    this.loading.set(true);
    errorState.set(null);
    try {
      await action();
      await this.loadDashboard();
      if (successMessage) {
        this.notifications.success(successMessage);
      }
      return true;
    } catch (error) {
      const message = httpErrorMessage(error, this.translation('error.actionFailed'));
      errorState.set(message);
      this.notifications.error(message);
      return false;
    } finally {
      this.loading.set(false);
    }
  }

  private manualRequest(): CreateTimeEntryRequest | null {
    if (!this.manualForm.projectId || !this.manualForm.hourlyRate || !this.manualForm.date || !this.manualForm.startTime || !this.manualForm.endTime) {
      this.showFormError(this.manualEntryError, this.translation('error.manualRequired'));
      return null;
    }
    const range = inputDateTimeRange(this.manualForm.date, this.manualForm.startTime, this.manualForm.endTime);
    if (!range) {
      this.showFormError(this.manualEntryError, this.translation('error.manualRangeInvalid'));
      return null;
    }

    return {
      projectId: this.manualForm.projectId,
      taskId: this.manualForm.taskId || null,
      projectName: this.manualForm.projectName,
      hourlyRate: this.manualForm.hourlyRate,
      startedAt: range.startedAt.toISOString(),
      endedAt: range.endedAt.toISOString()
    };
  }

  private updateRequest(isActive: boolean): UpdateTimeEntryRequest | null {
    if (!this.editForm.projectId || !this.editForm.hourlyRate || !this.editForm.date || !this.editForm.startTime) {
      this.showFormError(this.entriesError, this.translation('error.editRequired'));
      return null;
    }
    if (!isActive && !this.editForm.endTime) {
      this.showFormError(this.entriesError, this.translation('error.editEndRequired'));
      return null;
    }
    const startedAt = dateWithInputTime(this.editForm.date, this.editForm.startTime);
    if (!startedAt || Number.isNaN(startedAt.getTime())) {
      this.showFormError(this.entriesError, this.translation('error.editRequired'));
      return null;
    }
    const range = isActive ? null : inputDateTimeRange(this.editForm.date, this.editForm.startTime, this.editForm.endTime);
    if (!isActive && !range) {
      this.showFormError(this.entriesError, this.translation('error.manualRangeInvalid'));
      return null;
    }

    return {
      projectId: this.editForm.projectId,
      taskId: this.editForm.taskId || null,
      projectName: this.editForm.projectName,
      hourlyRate: this.editForm.hourlyRate,
      startedAt: (range?.startedAt ?? startedAt).toISOString(),
      endedAt: range?.endedAt.toISOString() ?? null
    };
  }

  private requestFilters(): TimeEntryFilters {
    return {
      month: this.filters.day ? undefined : this.filters.month || undefined,
      day: this.filters.day || undefined,
      projectNames: this.filters.projectNames,
      userIds: this.filters.userIds,
      timezone: this.preferences().timezone || undefined
    };
  }

  private requestPageFilters(filters: TimeEntryFilters, cursor: string | null): TimeEntryFilters {
    return {
      ...filters,
      cursor: cursor || undefined,
      pageSize: this.pageSize
    };
  }

  private showFormError(errorState: ReturnType<typeof signal<string | null>>, message: string): void {
    errorState.set(message);
    this.notifications.error(message, 'Check required fields');
  }

  private entryGroupsByDay(entries: TimeEntry[]): DayEntryGroup[] {
    const groups = new Map<string, DayEntryGroup>();
    this.sortEntries(entries).forEach((entry) => {
      const key = this.dayKey(entry.startedAt);
      const group = groups.get(key) ?? {
        key,
        label: this.dayLabel(entry.startedAt),
        entries: [],
        projects: [],
        totalSeconds: 0,
        totalAmount: 0
      };
      group.entries.push(entry);
      group.totalSeconds += this.liveDuration(entry);
      group.totalAmount += this.amountFor(entry);
      groups.set(key, group);
    });

    return Array.from(groups.values())
      .map((group) => ({
        ...group,
        projects: this.entryGroupsByProject(group.entries, group.key)
      }))
      .sort((first, second) => second.key.localeCompare(first.key));
  }

  private entryGroupsByProject(entries: TimeEntry[], dayKey: string): ProjectEntryGroup[] {
    const groups = new Map<string, ProjectEntryGroup>();
    entries.forEach((entry) => {
      const group = groups.get(entry.projectName) ?? {
        key: this.projectExpansionKey(dayKey, entry.projectName),
        projectName: entry.projectName,
        entries: [],
        totalSeconds: 0,
        totalAmount: 0
      };
      group.entries.push(entry);
      group.totalSeconds += this.liveDuration(entry);
      group.totalAmount += this.amountFor(entry);
      groups.set(entry.projectName, group);
    });
    return Array.from(groups.values()).sort((first, second) =>
      Number(second.entries.some((entry) => entry.active)) - Number(first.entries.some((entry) => entry.active))
      || second.totalSeconds - first.totalSeconds
      || first.projectName.localeCompare(second.projectName)
    );
  }

  private expandEntryGroups(): void {
    if (!this.groupedEntriesEnabled()) {
      this.expandedDays.set(new Set());
      this.expandedProjects.set(new Set());
      return;
    }
    const dayGroups = this.entryGroupsByDay(this.entries());
    const newestDayGroup = dayGroups[0];
    this.expandedDays.set(new Set(newestDayGroup ? [newestDayGroup.key] : []));
    this.expandedProjects.set(new Set(newestDayGroup?.projects.map((projectGroup) => projectGroup.key) ?? []));
  }

  private resetWorkspaceForms(): void {
    this.timerForm = { ...emptyTimerForm };
    this.manualForm = this.defaultManualForm();
    this.editForm = this.defaultEditForm();
    this.editingEntryId.set(null);
    this.filters = this.defaultFilters();
    this.resetPagination();
  }

  private syncTimerForm(entry: TimeEntry | null): void {
    if (!entry) {
      return;
    }
    this.timerForm = {
      projectName: entry.projectName,
      projectId: entry.projectId ?? '',
      taskId: entry.taskId ?? '',
      hourlyRate: Number(entry.hourlyRate)
    };
  }

  private syncActiveTimerDetails(form: EntryDetailsForm, createdTask?: ProjectTask): void {
    if (form !== this.timerForm || !this.activeTimer.activeEntry()) {
      return;
    }
    const task = createdTask ?? this.tasksFor(form.projectId).find((option) => option.id === form.taskId);
    this.activeTimer.updateActiveDetails({
      projectId: form.projectId || null,
      projectName: form.projectName,
      taskId: form.taskId || null,
      taskName: task?.name ?? null,
      hourlyRate: form.hourlyRate ?? 0
    });
  }

  private sortEntries(entries: TimeEntry[]): TimeEntry[] {
    return [...entries].sort((first, second) =>
      Number(second.active) - Number(first.active)
      || new Date(second.startedAt).getTime() - new Date(first.startedAt).getTime()
    );
  }

  private dayKey(value: string): string {
    const parts = new Intl.DateTimeFormat('en-CA', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      timeZone: this.preferences().timezone || undefined
    }).formatToParts(new Date(value));

    const year = parts.find((part) => part.type === 'year')?.value ?? '0000';
    const month = parts.find((part) => part.type === 'month')?.value ?? '01';
    const day = parts.find((part) => part.type === 'day')?.value ?? '01';
    return `${year}-${month}-${day}`;
  }

  private dayLabel(value: string): string {
    return formatUserDate(new Date(value), this.preferences().dateFormat, this.preferences().timezone || undefined);
  }

  private projectExpansionKey(dayKey: string, projectName: string): string {
    return `${dayKey}::${projectName}`;
  }

  private defaultManualForm(): ManualForm {
    return {
      projectName: '',
      projectId: '',
      taskId: '',
      hourlyRate: null,
      ...this.manualEntryTimeFields()
    };
  }

  private manualEntryTimeFields(): ManualEntryTimeFields {
    return this.savedManualEntryTimeFields() ?? this.defaultManualEntryTimeFields();
  }

  private defaultManualEntryTimeFields(): ManualEntryTimeFields {
    return {
      date: toInputDate(new Date()),
      startTime: '09:00',
      endTime: '17:00'
    };
  }

  private persistManualEntryTimeFields(): void {
    sessionStorage.setItem(this.manualEntryTimeFieldsSessionKey, JSON.stringify({
      date: this.manualForm.date,
      startTime: this.manualForm.startTime,
      endTime: this.manualForm.endTime
    }));
  }

  private savedManualEntryTimeFields(): ManualEntryTimeFields | null {
    try {
      const value = sessionStorage.getItem(this.manualEntryTimeFieldsSessionKey);
      if (!value) {
        return null;
      }
      const fields = JSON.parse(value) as Partial<ManualEntryTimeFields>;
      if (this.isManualEntryTimeFields(fields)) {
        return fields;
      }
    } catch {
      return null;
    }
    return null;
  }

  private isManualEntryTimeFields(fields: Partial<ManualEntryTimeFields>): fields is ManualEntryTimeFields {
    return this.isInputDate(fields.date) && this.isInputTime(fields.startTime) && this.isInputTime(fields.endTime);
  }

  private isInputDate(value: unknown): value is string {
    return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
  }

  private isInputTime(value: unknown): value is string {
    return typeof value === 'string' && /^\d{2}:\d{2}$/.test(value);
  }

  private defaultEditForm(): EditTimeEntryForm {
    const now = new Date();
    const start = new Date(now.getTime() - 60 * 60 * 1000);
    return {
      projectName: '',
      projectId: '',
      taskId: '',
      hourlyRate: null,
      date: toInputDate(start),
      startTime: toInputTime(start),
      endTime: toInputTime(now)
    };
  }

  private defaultFilters(): FiltersForm {
    return {
      month: '',
      day: '',
      projectNames: [],
      userIds: []
    };
  }

  private resetPagination(): void {
    this.cursorHistory.splice(0);
    this.currentCursor = null;
    this.pageNumber.set(1);
    this.hasPreviousPage.set(false);
  }

  private activeSummaryElapsedSeconds(): number {
    const summaryLoadedAt = this.summaryLoadedAt();
    if (!this.summary().hasActiveTimer || !summaryLoadedAt) {
      return 0;
    }
    return Math.max(0, Math.floor((this.currentTime().getTime() - summaryLoadedAt.getTime()) / 1000));
  }

  private translation(key: string, params: Record<string, string> = {}): string {
    return this.translateService.instant(`${this.translationPath}${key}`, params);
  }

  private formForTarget(target: 'timer' | 'manual' | 'edit'): EntryDetailsForm {
    if (target === 'timer') {
      return this.timerForm;
    }
    if (target === 'manual') {
      return this.manualForm;
    }
    return this.editForm;
  }

  private async loadOrganizationMembers(): Promise<void> {
    const activeWorkspace = this.workspaceState.activeWorkspace();
    if (activeWorkspace?.type !== 'ORGANIZATION' || !activeWorkspace.organizationId) {
      this.organizationMembers.set([]);
      return;
    }
    const members = await this.workspaceService.members(activeWorkspace.organizationId).catch(() => []);
    this.organizationMembers.set(members);
  }
}
