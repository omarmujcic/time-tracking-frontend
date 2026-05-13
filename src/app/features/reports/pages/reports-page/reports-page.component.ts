import { AfterViewInit, Component, ElementRef, OnDestroy, ViewChild, computed, effect, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { Chart, ChartConfiguration, registerables } from 'chart.js';
import { DatePickerComponent } from '../../../../shared/ui/date-picker/date-picker.component';
import { NotificationToastService } from '../../../../shared/ui/notification-toast/notification-toast.service';
import { httpErrorMessage } from '../../../../shared/utils/http-error-message';
import {
  formatUserCurrency,
  formatUserDate,
  formatUserDateTime,
  formatUserRateInput,
  parseUserDecimal
} from '../../../../shared/utils/user-formatting';
import { PreferenceService } from '../../../settings/services/preference.service';
import { UserPreference } from '../../../settings/models/settings.model';
import { WorkspaceStateFacade } from '../../../../shared/state/workspace/workspace-state.facade';
import { ReportMultiSelectComponent } from '../../components/report-multi-select/report-multi-select.component';
import { ReportMultiSelectOption } from '../../components/report-multi-select/report-multi-select.model';
import {
  ProjectEntryGroup,
  ReportBucketSegment,
  ReportEntry,
  ReportEntryGroup,
  ReportFilterOptions,
  ReportFilters,
  ReportTaskBreakdown,
  ReportView,
  TimeReport
} from '../../models/report.model';
import { ReportPdfService } from '../../services/report-pdf.service';
import { ReportService } from '../../services/report.service';

Chart.register(...registerables);

const noTaskFilterValue = '__NO_TASK__';
const noTaskSegmentKey = '__NO_TASK__';
const projectChartColors = ['#176b5d', '#2f6fed', '#b7791f', '#8a4fff', '#c2410c', '#0f766e', '#be185d', '#4b5563'];
const taskChartColors = ['#8b5cf6', '#c17f13', '#2f6fed', '#14b8a6', '#db2777', '#65a30d', '#dc2626', '#0891b2'];

const defaultPreference: UserPreference = {
  language: 'en',
  themeMode: 'SYSTEM',
  groupedEntriesEnabled: true,
  dateFormat: 'YYYY-MM-DD',
  decimalSeparator: 'DOT',
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
};

@Component({
  selector: 'app-reports-page',
  imports: [FormsModule, MatIconModule, DatePickerComponent, ReportMultiSelectComponent, TranslatePipe],
  templateUrl: './reports-page.component.html',
  styleUrl: './reports-page.component.scss'
})
export class ReportsPageComponent implements AfterViewInit, OnDestroy {
  @ViewChild('timeChartCanvas') private timeChartCanvas?: ElementRef<HTMLCanvasElement>;
  @ViewChild('projectChartCanvas') private projectChartCanvas?: ElementRef<HTMLCanvasElement>;

  protected readonly translationPath = 'features.reports.';
  protected readonly loading = signal(false);
  protected readonly loadError = signal<string | null>(null);
  protected readonly report = signal<TimeReport | null>(null);
  protected readonly groupedEntriesEnabled = signal(true);
  protected readonly preferences = signal<UserPreference>({ ...defaultPreference });
  protected readonly options = signal<ReportFilterOptions>({ users: [], projects: [], tasks: [], rates: [], hasNoTask: false });
  protected readonly expandedProjects = signal<Set<string>>(new Set());
  protected readonly viewOptions: ReportView[] = ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY', 'CUSTOM'];
  protected readonly filters: ReportFilters = this.defaultFilters();
  protected readonly appliedFilters = signal<ReportFilters>(this.cloneFilters(this.filters));
  protected readonly projectEntryGroups = computed(() => this.entryGroupsByProject(this.report()?.entries ?? []));
  protected readonly groupedEntries = computed(() => this.entryGroupsByDate(this.report()?.entries ?? []));
  protected readonly taskBreakdown = computed(() => this.taskBreakdownForReport(this.report()));
  protected readonly taskBreakdownStart = signal(0);
  protected readonly visibleTaskBreakdown = computed(() => {
    const start = Math.min(this.taskBreakdownStart(), this.maxTaskBreakdownStart());
    return this.taskBreakdown().slice(start, start + 3);
  });
  protected readonly userOptions = computed<ReportMultiSelectOption[]>(() =>
    this.options().users.map((user) => ({
      value: user.id,
      label: user.username
    }))
  );
  protected readonly projectOptions = computed<ReportMultiSelectOption[]>(() =>
    this.options().projects.map((project) => ({
      value: project,
      label: project
    }))
  );
  protected taskOptions(): ReportMultiSelectOption[] {
    const selectedProjects = new Set(this.filters.projectNames);
    const projectScopedTasks = this.options().tasks
      .filter((task) => !selectedProjects.size || selectedProjects.has(task.projectName))
      .map((task) => ({
        value: task.id,
        label: this.taskOptionLabel(task.name, task.projectName, selectedProjects.size > 0)
      }));
    if (!this.options().hasNoTask) {
      return projectScopedTasks;
    }
    return [
      ...projectScopedTasks,
      {
        value: noTaskFilterValue,
        label: this.translation('entry.noTask')
      }
    ];
  }

  protected taskFilterValues(): string[] {
    return [
      ...this.filters.taskIds,
      ...(this.filters.includeNoTask ? [noTaskFilterValue] : [])
    ];
  }

  protected taskChartMode(): boolean {
    return this.appliedFilters().projectNames.length === 1;
  }

  protected taskBreakdownColor(task: ReportTaskBreakdown, index: number): string {
    return this.taskColor(this.taskBreakdownStart() + index);
  }

  protected maxTaskBreakdownStart(): number {
    return Math.max(0, this.taskBreakdown().length - 3);
  }

  protected moveTaskBreakdown(direction: number): void {
    this.taskBreakdownStart.update((start) =>
      Math.min(this.maxTaskBreakdownStart(), Math.max(0, start + direction))
    );
  }

  private chartsReady = false;
  private timeChart?: Chart;
  private projectChart?: Chart;
  private currentWorkspaceKey = '';

  constructor(
    private readonly reportService: ReportService,
    private readonly reportPdfService: ReportPdfService,
    private readonly preferenceService: PreferenceService,
    private readonly workspaceState: WorkspaceStateFacade,
    private readonly notifications: NotificationToastService,
    private readonly translateService: TranslateService
  ) {
    this.loadReports();
    effect(() => {
      const workspaceKey = this.workspaceState.activeWorkspaceKey();
      if (!workspaceKey || workspaceKey === this.currentWorkspaceKey) {
        return;
      }
      this.currentWorkspaceKey = workspaceKey;
      this.filters.userIds = [];
      this.filters.projectNames = [];
      this.filters.taskIds = [];
      this.filters.includeNoTask = false;
      void this.loadReports();
    });
  }

  ngAfterViewInit(): void {
    this.chartsReady = true;
    this.renderCharts();
  }

  ngOnDestroy(): void {
    this.timeChart?.destroy();
    this.projectChart?.destroy();
  }

  protected async loadReports(): Promise<void> {
    this.loading.set(true);
    this.loadError.set(null);
    const requestFilters = this.cloneFilters(this.filters);
    try {
      const [options, report, preferences] = await Promise.all([
        this.reportService.filterOptions(),
        this.reportService.timeReport(requestFilters),
        this.preferenceService.get().catch(() => null)
      ]);
      this.options.set(options);
      this.report.set(report);
      this.appliedFilters.set(requestFilters);
      this.taskBreakdownStart.set(0);
      this.applyEntryGroupingPreference(preferences, report);
      this.scheduleRenderCharts();
    } catch (error) {
      const message = httpErrorMessage(error, this.translation('error.load'));
      this.loadError.set(message);
      this.notifications.error(message, 'Could not load reports');
    } finally {
      this.loading.set(false);
    }
  }

  protected applyView(view: ReportView): void {
    this.filters.view = view;
    const range = this.rangeFor(view);
    this.filters.startDate = range.startDate;
    this.filters.endDate = range.endDate;
    this.loadReports();
  }

  protected applyFilters(): void {
    this.pruneTaskFiltersForProjects();
    this.loadReports();
  }

  protected resetFilters(): void {
    Object.assign(this.filters, this.defaultFilters());
    this.loadReports();
  }

  protected updateProjectFilter(projectNames: string[]): void {
    this.filters.projectNames = projectNames;
    this.pruneTaskFiltersForProjects();
  }

  protected updateTaskFilter(values: string[]): void {
    this.filters.taskIds = values.filter((value) => value !== noTaskFilterValue);
    this.filters.includeNoTask = values.includes(noTaskFilterValue);
  }

  protected durationLabel(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
  }

  protected money(value: number): string {
    return formatUserCurrency(value, this.preferences());
  }

  protected dateTime(value: string): string {
    return formatUserDateTime(value, this.preferences());
  }

  protected date(value: string): string {
    const [year, month, day] = value.split('-').map(Number);
    return formatUserDate(new Date(year, month - 1, day), this.preferences().dateFormat);
  }

  protected rateInput(value: number | null): string {
    return formatUserRateInput(value, this.preferences());
  }

  protected updateMinRate(value: string): void {
    this.filters.minRate = parseUserDecimal(value, this.preferences().decimalSeparator);
  }

  protected updateMaxRate(value: string): void {
    this.filters.maxRate = parseUserDecimal(value, this.preferences().decimalSeparator);
  }

  protected exportCsv(): void {
    const report = this.report();
    if (!report) {
      return;
    }
    const headers = ['Date', 'User', 'Project', 'Task', 'Rate EUR', 'Start', 'End', 'Duration seconds', 'Amount EUR', 'Active'];
    const rows = report.entries.map((entry) => [
      entry.groupLabel,
      entry.displayName || entry.username,
      entry.projectName,
      entry.taskName ?? '',
      entry.hourlyRate,
      this.dateTime(entry.startedAt),
      entry.endedAt ? this.dateTime(entry.endedAt) : this.translation('entry.running'),
      entry.durationSeconds,
      entry.billableAmount,
      entry.active ? 'yes' : 'no'
    ]);
    const csv = [headers, ...rows]
      .map((row) => row.map((value) => this.csvCell(value)).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const anchor = document.createElement('a');
    anchor.href = URL.createObjectURL(blob);
    const appliedFilters = this.appliedFilters();
    anchor.download = `time-report-${appliedFilters.startDate}-${appliedFilters.endDate}.csv`;
    anchor.click();
    URL.revokeObjectURL(anchor.href);
  }

  protected exportPdf(): void {
    const report = this.report();
    if (!report) {
      return;
    }
    this.reportPdfService.generate(report, this.appliedFilters(), this.preferences());
  }

  protected toggleProject(projectName: string): void {
    const expanded = new Set(this.expandedProjects());
    if (expanded.has(projectName)) {
      expanded.delete(projectName);
    } else {
      expanded.add(projectName);
    }
    this.expandedProjects.set(expanded);
  }

  protected isProjectExpanded(projectName: string): boolean {
    return this.expandedProjects().has(projectName);
  }

  private applyEntryGroupingPreference(preferences: UserPreference | null, report: TimeReport): void {
    const groupedEntriesEnabled = preferences?.groupedEntriesEnabled ?? true;
    this.preferences.set(preferences ?? { ...defaultPreference });
    this.groupedEntriesEnabled.set(groupedEntriesEnabled);
    this.expandedProjects.set(groupedEntriesEnabled
      ? new Set(this.entryGroupsByProject(report.entries).map((group) => group.projectName))
      : new Set()
    );
  }

  private renderCharts(): void {
    if (!this.chartsReady) {
      return;
    }
    this.renderTimeChart();
    this.renderProjectChart();
  }

  private scheduleRenderCharts(): void {
    window.setTimeout(() => this.renderCharts());
  }

  private renderTimeChart(): void {
    const canvas = this.timeChartCanvas?.nativeElement;
    const report = this.report();
    if (!canvas || !report) {
      return;
    }
    this.timeChart?.destroy();
    const stackedByTask = this.shouldStackTimeChart(report);
    const datasets = stackedByTask ? this.taskChartDatasets(report) : [
      {
        label: this.translation('charts.hours'),
        data: report.buckets.map((bucket) => Number((bucket.totalSeconds / 3600).toFixed(2))),
        backgroundColor: '#176b5d',
        borderRadius: 5
      }
    ];
    const config: ChartConfiguration<'bar'> = {
      type: 'bar',
      data: {
        labels: report.buckets.map((bucket) => bucket.label),
        datasets
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (context) => `${context.dataset.label}: ${this.durationLabel(Math.round((context.parsed.y || 0) * 3600))}`
            }
          }
        },
        scales: {
          x: { stacked: stackedByTask, grid: { display: false } },
          y: { stacked: stackedByTask, beginAtZero: true, ticks: { callback: (value) => `${value}h` } }
        }
      }
    };
    this.timeChart = new Chart(canvas, config);
  }

  private renderProjectChart(): void {
    const canvas = this.projectChartCanvas?.nativeElement;
    const report = this.report();
    if (!canvas || !report) {
      return;
    }
    this.projectChart?.destroy();
    const taskChartMode = this.taskChartMode();
    const taskBreakdown = this.taskBreakdown();
    const labels = taskChartMode
      ? taskBreakdown.map((task) => task.label)
      : report.projects.map((project) => project.projectName);
    const data = taskChartMode
      ? taskBreakdown.map((task) => task.totalSeconds)
      : report.projects.map((project) => project.totalSeconds);
    this.projectChart = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [
          {
            data,
            backgroundColor: taskChartMode
              ? taskBreakdown.map((_, index) => this.taskColor(index))
              : report.projects.map((_, index) => projectChartColors[index % projectChartColors.length]),
            borderColor: '#ffffff',
            borderWidth: 2
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '62%',
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (context) => {
                const seconds = Number(context.raw) || 0;
                return `${context.label}: ${this.durationLabel(seconds)}`;
              }
            }
          }
        }
      }
    });
  }

  private entryGroupsByProject(entries: ReportEntry[]): ProjectEntryGroup[] {
    const groups = new Map<string, ProjectEntryGroup>();
    entries.forEach((entry) => {
      const group = groups.get(entry.projectName) ?? {
        key: entry.projectName,
        projectName: entry.projectName,
        entries: [],
        totalSeconds: 0,
        totalAmount: 0
      };
      group.entries.push(entry);
      group.totalSeconds += entry.durationSeconds;
      group.totalAmount += Number(entry.billableAmount);
      groups.set(entry.projectName, group);
    });
    return Array.from(groups.values()).sort((first, second) =>
      second.totalSeconds - first.totalSeconds || first.projectName.localeCompare(second.projectName)
    );
  }

  private entryGroupsByDate(entries: ReportEntry[]): ReportEntryGroup[] {
    const groups = new Map<string, ReportEntryGroup>();
    entries.forEach((entry) => {
      const group = groups.get(entry.groupKey) ?? { key: entry.groupKey, label: entry.groupLabel, entries: [] };
      group.entries.push(entry);
      groups.set(entry.groupKey, group);
    });
    return Array.from(groups.values());
  }

  private defaultFilters(): ReportFilters {
    const range = this.rangeFor('MONTHLY');
    return {
      view: 'MONTHLY',
      startDate: range.startDate,
      endDate: range.endDate,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
      userIds: [],
      projectNames: [],
      taskIds: [],
      includeNoTask: false,
      minRate: null,
      maxRate: null,
    };
  }

  private pruneTaskFiltersForProjects(): void {
    if (!this.filters.projectNames.length || !this.filters.taskIds.length) {
      return;
    }
    const selectedProjects = new Set(this.filters.projectNames);
    const allowedTaskIds = new Set(
      this.options().tasks
        .filter((task) => selectedProjects.has(task.projectName))
        .map((task) => task.id)
    );
    this.filters.taskIds = this.filters.taskIds.filter((taskId) => allowedTaskIds.has(taskId));
  }

  private shouldStackTimeChart(report: TimeReport): boolean {
    return Boolean(
      this.taskChartMode()
      && report.buckets.some((bucket) => bucket.taskSegments?.length)
    );
  }

  private taskBreakdownForReport(report: TimeReport | null): ReportTaskBreakdown[] {
    if (!report) {
      return [];
    }
    const totals = new Map<string, { label: string; totalSeconds: number; totalAmount: number }>();
    report.buckets.forEach((bucket) => {
      bucket.taskSegments?.forEach((segment) => {
        const key = this.taskSegmentKey(segment);
        const total = totals.get(key) ?? {
          label: this.taskSegmentLabel(segment),
          totalSeconds: 0,
          totalAmount: 0
        };
        total.totalSeconds += segment.totalSeconds;
        total.totalAmount += Number(segment.totalAmount);
        totals.set(key, total);
      });
    });
    const totalSeconds = Math.max(1, Array.from(totals.values()).reduce((sum, task) => sum + task.totalSeconds, 0));
    return Array.from(totals.entries())
      .map(([key, task]) => ({
        key,
        label: task.label,
        totalSeconds: task.totalSeconds,
        totalAmount: task.totalAmount,
        percentage: Number(((task.totalSeconds / totalSeconds) * 100).toFixed(2))
      }))
      .sort((first, second) => second.totalSeconds - first.totalSeconds || first.label.localeCompare(second.label));
  }

  private taskChartDatasets(report: TimeReport): ChartConfiguration<'bar'>['data']['datasets'] {
    return this.taskBreakdown()
      .map((task, index) => ({
        label: task.label,
        data: report.buckets.map((bucket) => {
          const matchingSegment = bucket.taskSegments?.find((bucketSegment) => this.taskSegmentKey(bucketSegment) === task.key);
          return Number(((matchingSegment?.totalSeconds ?? 0) / 3600).toFixed(2));
        }),
        backgroundColor: this.taskColor(index),
        borderRadius: 4,
        stack: 'tasks'
      }));
  }

  private taskSegmentKey(segment: ReportBucketSegment): string {
    return segment.taskId ?? noTaskSegmentKey;
  }

  private taskSegmentLabel(segment: ReportBucketSegment): string {
    if (!segment.taskId) {
      return this.translation('entry.noTask');
    }
    if (!segment.projectName || this.appliedFilters().projectNames.length === 1) {
      return segment.taskName ?? this.translation('entry.noTask');
    }
    return `${segment.projectName} / ${segment.taskName ?? this.translation('entry.noTask')}`;
  }

  private cloneFilters(filters: ReportFilters): ReportFilters {
    return {
      ...filters,
      userIds: [...filters.userIds],
      projectNames: [...filters.projectNames],
      taskIds: [...filters.taskIds]
    };
  }

  private taskOptionLabel(taskName: string, projectName: string, projectScoped: boolean): string {
    return projectScoped ? taskName : `${projectName} / ${taskName}`;
  }

  private taskColor(index: number): string {
    if (this.taskBreakdown()[index]?.key === noTaskSegmentKey) {
      return '#6b7280';
    }
    return taskChartColors[index % taskChartColors.length];
  }

  private rangeFor(view: ReportView): { startDate: string; endDate: string } {
    const now = new Date();
    if (view === 'DAILY') {
      const today = this.formatDate(now);
      return { startDate: today, endDate: today };
    }
    if (view === 'WEEKLY') {
      const start = new Date(now);
      const day = (start.getDay() + 6) % 7;
      start.setDate(start.getDate() - day);
      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      return { startDate: this.formatDate(start), endDate: this.formatDate(end) };
    }
    if (view === 'YEARLY') {
      return { startDate: `${now.getFullYear()}-01-01`, endDate: `${now.getFullYear()}-12-31` };
    }
    const first = new Date(now.getFullYear(), now.getMonth(), 1);
    const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return { startDate: this.formatDate(first), endDate: this.formatDate(last) };
  }

  private formatDate(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  private csvCell(value: unknown): string {
    return `"${String(value).replace(/"/g, '""')}"`;
  }

  private translation(key: string): string {
    return this.translateService.instant(`${this.translationPath}${key}`);
  }
}
