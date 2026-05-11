import { NgTemplateOutlet } from '@angular/common';
import { Component, OnDestroy, computed, effect, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { AuthStateFacade } from '../../../../shared/state/auth/auth-state.facade';
import { WorkspaceStateFacade } from '../../../../shared/state/workspace/workspace-state.facade';
import { DatePickerComponent } from '../../../../shared/ui/date-picker/date-picker.component';
import {
  formatUserCurrency,
  formatUserDate,
  formatUserDateTime,
  formatUserRateInput,
  parseUserDecimal
} from '../../../../shared/utils/user-formatting';
import { PreferenceService } from '../../../settings/services/preference.service';
import { OrganizationMember, UserPreference } from '../../../settings/models/settings.model';
import { ProjectService } from '../../../settings/services/project.service';
import { WorkspaceService } from '../../../settings/services/workspace.service';
import { ReportMultiSelectComponent } from '../../../reports/components/report-multi-select/report-multi-select.component';
import { ReportMultiSelectOption } from '../../../reports/components/report-multi-select/report-multi-select.model';
import {
  CreateTimeEntryRequest,
  TimeEntry,
  TimeEntryFilters,
  UpdateTimeEntryRequest
} from '../../models/time-entry.model';
import { DayEntryGroup, ProjectEntryGroup } from '../../models/entry-group.model';
import { FiltersForm, ManualForm, TimerForm } from '../../models/dashboard-form.model';
import { TimeEntryService } from '../../services/time-entry.service';

const emptyTimerForm: TimerForm = {
  projectId: '',
  taskId: '',
  projectName: '',
  hourlyRate: null
};

const defaultPreference: UserPreference = {
  language: 'en',
  themeMode: 'SYSTEM',
  groupedEntriesEnabled: true,
  dateFormat: 'YYYY-MM-DD',
  decimalSeparator: 'DOT',
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
};

@Component({
  selector: 'app-dashboard-page',
  imports: [FormsModule, MatIconModule, NgTemplateOutlet, DatePickerComponent, ReportMultiSelectComponent, TranslatePipe],
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
  protected readonly taskError = signal<string | null>(null);
  protected readonly currentTime = signal(new Date());
  protected readonly groupedEntriesEnabled = signal(true);
  protected readonly expandedDays = signal<Set<string>>(new Set());
  protected readonly expandedProjects = signal<Set<string>>(new Set());
  protected readonly preferences = signal<UserPreference>({ ...defaultPreference });
  protected readonly organizationMembers = signal<OrganizationMember[]>([]);
  protected readonly user;
  protected readonly projects;

  protected timerForm: TimerForm = { ...emptyTimerForm };
  protected manualForm: ManualForm = this.defaultManualForm();
  protected filters: FiltersForm;
  protected editingEntryId = signal<string | null>(null);
  protected editForm: ManualForm = this.defaultManualForm();

  protected readonly sortedEntries = computed(() => this.sortEntries(this.entries()));
  protected readonly activeEntry = computed(() => this.sortedEntries().find((entry) => entry.active) ?? null);
  protected readonly completedEntries = computed(() => this.sortedEntries().filter((entry) => !entry.active));
  protected readonly dayEntryGroups = computed(() => this.entryGroupsByDay(this.entries()));
  protected readonly totalSeconds = computed(() =>
    this.entries().reduce((totalSeconds, entry) => totalSeconds + this.liveDuration(entry), 0)
  );
  protected readonly totalAmount = computed(() =>
    this.entries().reduce((totalAmount, entry) => totalAmount + this.amountFor(entry), 0)
  );
  protected readonly entryCount = computed(() => this.entries().length);
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

  private readonly timer = window.setInterval(() => this.currentTime.set(new Date()), 1000);
  private currentWorkspaceKey = '';

  constructor(
    private readonly authState: AuthStateFacade,
    private readonly workspaceState: WorkspaceStateFacade,
    private readonly workspaceService: WorkspaceService,
    private readonly projectService: ProjectService,
    private readonly timeEntryService: TimeEntryService,
    private readonly preferenceService: PreferenceService,
    private readonly translateService: TranslateService
  ) {
    this.user = this.authState.user;
    this.projects = this.workspaceState.projects;
    this.filters = {
      month: this.currentMonth(),
      day: '',
      projectNames: [],
      userIds: []
    };
    this.loadDashboard();
    this.workspaceState.load();
    this.preferenceService.get()
      .then((preferences) => {
        this.preferences.set(preferences);
        this.groupedEntriesEnabled.set(preferences.groupedEntriesEnabled);
        this.expandEntryGroups();
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

  protected async loadDashboard(): Promise<void> {
    this.loading.set(true);
    this.loadError.set(null);
    try {
      const filters = this.requestFilters();
      const [entries] = await Promise.all([
        this.timeEntryService.list(filters),
        this.loadOrganizationMembers()
      ]);
      this.entries.set(entries);
      this.expandEntryGroups();
    } catch {
      this.loadError.set(this.translation('error.load'));
    } finally {
      this.loading.set(false);
    }
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
    });
  }

  protected async stopTimer(entry: TimeEntry): Promise<void> {
    if (!this.canStopEntry(entry)) {
      this.entriesError.set('Select a project and hourly rate before stopping the timer.');
      return;
    }
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
      projectId: entry.projectId ?? '',
      taskId: entry.taskId ?? '',
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
      projectNames: [],
      userIds: []
    };
    this.loadDashboard();
  }

  protected onProjectSelected(form: TimerForm): void {
    const project = this.projects().find((option) => option.id === form.projectId);
    form.projectName = project?.name ?? '';
    form.taskId = '';
    if (project) {
      form.hourlyRate = Number(project.hourlyRate);
    }
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

  protected onProjectValuesSelected(form: TimerForm, values: string[]): void {
    form.projectId = values[0] ?? '';
    this.onProjectSelected(form);
  }

  protected onTaskValuesSelected(form: TimerForm, values: string[]): void {
    form.taskId = values[0] ?? '';
  }

  protected async createTask(target: 'timer' | 'manual' | 'edit', name: string): Promise<void> {
    this.taskError.set(null);
    const form = this.formForTarget(target);
    if (!form.projectId) {
      this.taskError.set('Select a project before creating a task.');
      return;
    }
    if (!name.trim()) {
      this.taskError.set('Task name is required.');
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
    } catch {
      this.taskError.set('Unable to create task.');
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

  protected updateRate(form: TimerForm, value: string): void {
    form.hourlyRate = parseUserDecimal(value, this.preferences().decimalSeparator);
  }

  protected canStopEntry(entry: TimeEntry): boolean {
    return !!entry.projectId && Number(entry.hourlyRate) > 0;
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
    if (!this.manualForm.projectId || !this.manualForm.hourlyRate || !this.manualForm.startedAt || !this.manualForm.endedAt) {
      this.manualEntryError.set(this.translation('error.manualRequired'));
      return null;
    }

    return {
      projectId: this.manualForm.projectId,
      taskId: this.manualForm.taskId || null,
      projectName: this.manualForm.projectName,
      hourlyRate: this.manualForm.hourlyRate,
      startedAt: this.toIsoDateTime(this.manualForm.startedAt),
      endedAt: this.toIsoDateTime(this.manualForm.endedAt)
    };
  }

  private updateRequest(isActive: boolean): UpdateTimeEntryRequest | null {
    if (!this.editForm.projectId || !this.editForm.hourlyRate || !this.editForm.startedAt) {
      this.entriesError.set(this.translation('error.editRequired'));
      return null;
    }
    if (!isActive && !this.editForm.endedAt) {
      this.entriesError.set(this.translation('error.editEndRequired'));
      return null;
    }

    return {
      projectId: this.editForm.projectId,
      taskId: this.editForm.taskId || null,
      projectName: this.editForm.projectName,
      hourlyRate: this.editForm.hourlyRate,
      startedAt: this.toIsoDateTime(this.editForm.startedAt),
      endedAt: this.editForm.endedAt ? this.toIsoDateTime(this.editForm.endedAt) : null
    };
  }

  private requestFilters(): TimeEntryFilters {
    return {
      month: this.filters.day ? undefined : this.filters.month || undefined,
      day: this.filters.day || undefined,
      projectNames: this.filters.projectNames,
      userIds: this.filters.userIds
    };
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
    this.expandedDays.set(new Set(dayGroups.map((group) => group.key)));
    this.expandedProjects.set(new Set(
      dayGroups.flatMap((dayGroup) => dayGroup.projects.map((projectGroup) => projectGroup.key))
    ));
  }

  private resetWorkspaceForms(): void {
    this.timerForm = { ...emptyTimerForm };
    this.manualForm = this.defaultManualForm();
    this.editForm = this.defaultManualForm();
    this.editingEntryId.set(null);
    this.filters.projectNames = [];
    this.filters.userIds = [];
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
    const now = new Date();
    const end = new Date(now.getTime());
    const start = new Date(now.getTime() - 60 * 60 * 1000);
    return {
      projectName: '',
      projectId: '',
      taskId: '',
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

  private formForTarget(target: 'timer' | 'manual' | 'edit'): TimerForm {
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
