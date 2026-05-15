import { AfterViewInit, Component, ElementRef, OnDestroy, ViewChild, computed, effect, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { Chart, ChartConfiguration, ScriptableContext, registerables } from 'chart.js';
import { DatePickerComponent } from '../../../../shared/ui/date-picker/date-picker.component';
import { DatePickerMode } from '../../../../shared/ui/date-picker/models/date-picker.model';
import { NotificationToastService } from '../../../../shared/ui/notification-toast/notification-toast.service';
import { httpErrorMessage } from '../../../../shared/utils/http-error-message';
import {
  formatUserCurrency,
  formatUserDate,
  formatUserDateTime,
  formatUserRateInput,
  parseUserDecimal
} from '../../../../shared/utils/user-formatting';
import { parseInputDate, toInputDate } from '../../../../shared/utils/input-date-time';
import { PreferenceService } from '../../../settings/services/preference.service';
import { UserPreference } from '../../../settings/models/settings.model';
import { WorkspaceStateFacade } from '../../../../shared/state/workspace/workspace-state.facade';
import { ReportMultiSelectComponent } from '../../components/report-multi-select/report-multi-select.component';
import { ReportMultiSelectOption } from '../../components/report-multi-select/report-multi-select.model';
import {
  BarRadius,
  ReportBucket,
  ProjectEntryGroup,
  ReportBucketSegment,
  ReportEntry,
  ReportEntryGroup,
  ReportFilterOptions,
  ReportFilters,
  ReportProject,
  ReportTaskBreakdown,
  ReportView,
  TimeReport
} from '../../models/report.model';
import { noTaskChartColor, projectChartColors, projectPrimaryColor } from '../../models/report-chart-colors.model';
import { ReportPdfService } from '../../services/report-pdf.service';
import { ReportService } from '../../services/report.service';

Chart.register(...registerables);

const noTaskFilterValue = '__NO_TASK__';
const noTaskSegmentKey = '__NO_TASK__';
const reportFiltersSessionKey = 'reports.filters.v1';
const timeChartBarOptions = {
  barPercentage: 0.62,
  borderRadius: 6,
  borderSkipped: false,
  categoryPercentage: 0.74,
  maxBarThickness: 28
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
  protected readonly filters: ReportFilters = this.savedFilters();
  protected readonly appliedFilters = signal<ReportFilters>(this.cloneFilters(this.filters));
  protected readonly projectEntryGroups = computed(() => this.entryGroupsByProject(this.report()?.entries ?? []));
  protected readonly groupedEntries = computed(() => this.entryGroupsByDate(this.report()?.entries ?? []));
  protected readonly taskBreakdown = computed(() => this.taskBreakdownForReport(this.report()));
  protected readonly projectColors = computed(() => this.projectColorsForReport(this.report()));
  protected readonly taskBreakdownStart = signal(0);
  protected readonly projectBreakdownStart = signal(0);
  protected readonly visibleTaskBreakdown = computed(() => {
    const start = Math.min(this.taskBreakdownStart(), this.maxTaskBreakdownStart());
    return this.taskBreakdown().slice(start, start + 3);
  });
  protected readonly visibleProjects = computed<ReportProject[]>(() => {
    const start = Math.min(this.projectBreakdownStart(), this.maxProjectBreakdownStart());
    return (this.report()?.projects ?? []).slice(start, start + 3);
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

  protected projectColor(projectName: string): string {
    return this.projectColors().get(projectName) ?? projectPrimaryColor;
  }

  protected periodPickerMode(): DatePickerMode {
    if (this.filters.view === 'WEEKLY') {
      return 'week';
    }
    if (this.filters.view === 'MONTHLY') {
      return 'month';
    }
    if (this.filters.view === 'YEARLY') {
      return 'year';
    }
    return 'date';
  }

  protected periodValue(): string {
    if (this.filters.view === 'MONTHLY') {
      return this.filters.startDate.slice(0, 7);
    }
    if (this.filters.view === 'YEARLY') {
      return this.filters.startDate.slice(0, 4);
    }
    return this.filters.startDate;
  }

  protected periodFilterLabel(): string {
    if (this.filters.view === 'WEEKLY') {
      return this.translation('filters.week');
    }
    if (this.filters.view === 'MONTHLY') {
      return this.translation('filters.month');
    }
    if (this.filters.view === 'YEARLY') {
      return this.translation('filters.year');
    }
    return this.translation('filters.day');
  }

  protected updatePeriod(value: string): void {
    const range = this.rangeForPeriod(this.filters.view, value);
    this.filters.startDate = range.startDate;
    this.filters.endDate = range.endDate;
  }

  protected maxTaskBreakdownStart(): number {
    return Math.max(0, this.taskBreakdown().length - 3);
  }

  protected maxProjectBreakdownStart(): number {
    return Math.max(0, (this.report()?.projects.length ?? 0) - 3);
  }

  protected moveTaskBreakdown(direction: number): void {
    this.taskBreakdownStart.update((start) =>
      Math.min(this.maxTaskBreakdownStart(), Math.max(0, start + direction))
    );
  }

  protected moveProjectBreakdown(direction: number): void {
    this.projectBreakdownStart.update((start) =>
      Math.min(this.maxProjectBreakdownStart(), Math.max(0, start + direction))
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
      if (!workspaceKey) {
        return;
      }
      if (!this.currentWorkspaceKey) {
        this.currentWorkspaceKey = workspaceKey;
        void this.loadReports();
        return;
      }
      if (workspaceKey === this.currentWorkspaceKey) {
        return;
      }
      this.currentWorkspaceKey = workspaceKey;
      this.filters.userIds = [];
      this.filters.projectNames = [];
      this.filters.taskIds = [];
      this.filters.includeNoTask = false;
      this.filters.includeOrganizationEntries = this.canIncludeOrganizationEntries();
      this.clearSavedFilters();
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
    try {
      const preferences = await this.preferenceService.get().catch(() => this.preferences());
      this.preferences.set(preferences);
      const requestFilters = this.reportRequestFilters(preferences);
      const [options, report] = await Promise.all([
        this.reportService.filterOptions(requestFilters.includeOrganizationEntries),
        this.reportService.timeReport(requestFilters)
      ]);
      this.options.set(options);
      this.report.set(report);
      this.appliedFilters.set(requestFilters);
      this.saveFilters(requestFilters);
      this.taskBreakdownStart.set(0);
      this.projectBreakdownStart.set(0);
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
    if (view === 'CUSTOM') {
      this.loadReports();
      return;
    }
    this.updatePeriod(this.periodValue());
    this.loadReports();
  }

  protected applyFilters(): void {
    this.pruneTaskFiltersForProjects();
    this.loadReports();
  }

  protected resetFilters(): void {
    Object.assign(this.filters, this.defaultFilters());
    this.filters.includeOrganizationEntries = this.canIncludeOrganizationEntries();
    this.clearSavedFilters();
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

  protected updateIncludeOrganizationEntries(includeOrganizationEntries: boolean): void {
    this.filters.includeOrganizationEntries = includeOrganizationEntries;
    this.filters.userIds = [];
    this.filters.projectNames = [];
    this.filters.taskIds = [];
    this.filters.includeNoTask = false;
  }

  protected canIncludeOrganizationEntries(preferences = this.preferences()): boolean {
    return this.workspaceState.activeWorkspace()?.type !== 'ORGANIZATION'
      && preferences.includeOrganizationEntriesInPersonalReports;
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
    const stackedByTask = this.shouldStackTaskTimeChart(report);
    const stackedByProject = this.shouldStackProjectTimeChart(report);
    const datasets = stackedByTask ? this.taskChartDatasets(report) : stackedByProject ? this.projectChartDatasets(report) : [
      {
        label: this.translation('charts.hours'),
        data: report.buckets.map((bucket) => Number((bucket.totalSeconds / 3600).toFixed(2))),
        backgroundColor: projectPrimaryColor,
        ...timeChartBarOptions
      }
    ];
    const stacked = stackedByTask || stackedByProject;
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
          x: { stacked, grid: { display: false } },
          y: { stacked, beginAtZero: true, ticks: { callback: (value) => `${value}h` } }
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
              : report.projects.map((project) => this.projectColor(project.projectName)),
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
      includeOrganizationEntries: true,
      minRate: null,
      maxRate: null,
    };
  }

  private rangeForPeriod(view: ReportView, value: string): { startDate: string; endDate: string } {
    if (!value) {
      return this.rangeFor(view);
    }
    if (view === 'DAILY') {
      return { startDate: value, endDate: value };
    }
    if (view === 'WEEKLY') {
      const start = this.startOfWeek(parseInputDate(value));
      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      return { startDate: toInputDate(start), endDate: toInputDate(end) };
    }
    if (view === 'MONTHLY') {
      const [year, month] = value.split('-').map(Number);
      const start = new Date(year, month - 1, 1);
      const end = new Date(year, month, 0);
      return { startDate: toInputDate(start), endDate: toInputDate(end) };
    }
    if (view === 'YEARLY') {
      return { startDate: `${value}-01-01`, endDate: `${value}-12-31` };
    }
    return { startDate: this.filters.startDate, endDate: this.filters.endDate };
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

  private shouldStackTaskTimeChart(report: TimeReport): boolean {
    return Boolean(
      this.taskChartMode()
      && report.buckets.some((bucket) => bucket.taskSegments?.length)
    );
  }

  private shouldStackProjectTimeChart(report: TimeReport): boolean {
    return Boolean(
      !this.taskChartMode()
      && report.projects.length > 1
      && report.entries.some((entry) => !entry.active && entry.endedAt)
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
    const tasks = this.taskBreakdown();
    const dataByDataset = tasks.map((task) =>
      report.buckets.map((bucket) => {
        const matchingSegment = bucket.taskSegments?.find((bucketSegment) => this.taskSegmentKey(bucketSegment) === task.key);
        return Number(((matchingSegment?.totalSeconds ?? 0) / 3600).toFixed(2));
      })
    );
    return tasks
      .map((task, index) => ({
        label: task.label,
        data: dataByDataset[index],
        backgroundColor: this.taskColor(index),
        ...timeChartBarOptions,
        borderRadius: (context: ScriptableContext<'bar'>) => this.stackedBarRadius(dataByDataset, index, context.dataIndex),
        stack: 'tasks'
      }));
  }

  private projectChartDatasets(report: TimeReport): ChartConfiguration<'bar'>['data']['datasets'] {
    const totals = this.projectBucketSeconds(report);
    const dataByDataset = report.projects.map((project) =>
      report.buckets.map((bucket) => Number(((totals.get(project.projectName)?.get(bucket.key) ?? 0) / 3600).toFixed(2)))
    );
    return report.projects
      .map((project, index) => ({
        label: project.projectName,
        data: dataByDataset[index],
        backgroundColor: this.projectColor(project.projectName),
        ...timeChartBarOptions,
        borderRadius: (context: ScriptableContext<'bar'>) => this.stackedBarRadius(dataByDataset, index, context.dataIndex),
        stack: 'projects'
      }));
  }

  private stackedBarRadius(dataByDataset: number[][], datasetIndex: number, dataIndex: number): BarRadius {
    const visibleDatasetIndexes = dataByDataset
      .map((dataset, index) => ({ index, value: dataset[dataIndex] ?? 0 }))
      .filter((dataset) => dataset.value > 0)
      .map((dataset) => dataset.index);
    const bottomIndex = visibleDatasetIndexes[0];
    const topIndex = visibleDatasetIndexes[visibleDatasetIndexes.length - 1];
    const radius = 6;
    return {
      topLeft: datasetIndex === topIndex ? radius : 0,
      topRight: datasetIndex === topIndex ? radius : 0,
      bottomLeft: datasetIndex === bottomIndex ? radius : 0,
      bottomRight: datasetIndex === bottomIndex ? radius : 0
    };
  }

  private projectBucketSeconds(report: TimeReport): Map<string, Map<string, number>> {
    const bucketWindows = report.buckets
      .map((bucket) => ({ bucket, window: this.bucketWindow(bucket) }))
      .filter((item): item is { bucket: ReportBucket; window: { start: number; end: number } } => item.window !== null);
    const totals = new Map<string, Map<string, number>>();
    report.entries
      .filter((entry) => !entry.active && entry.endedAt)
      .forEach((entry) => {
        const entryStart = new Date(entry.startedAt).getTime();
        const entryEnd = new Date(entry.endedAt as string).getTime();
        bucketWindows.forEach(({ bucket, window }) => {
          const seconds = Math.max(0, Math.floor((Math.min(entryEnd, window.end) - Math.max(entryStart, window.start)) / 1000));
          if (!seconds) {
            return;
          }
          const projectTotals = totals.get(entry.projectName) ?? new Map<string, number>();
          projectTotals.set(bucket.key, (projectTotals.get(bucket.key) ?? 0) + seconds);
          totals.set(entry.projectName, projectTotals);
        });
      });
    return totals;
  }

  private bucketWindow(bucket: ReportBucket): { start: number; end: number } | null {
    const dayParts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(bucket.key);
    if (dayParts) {
      const start = new Date(Number(dayParts[1]), Number(dayParts[2]) - 1, Number(dayParts[3]));
      const end = new Date(start);
      end.setDate(start.getDate() + 1);
      return { start: start.getTime(), end: end.getTime() };
    }
    const monthParts = /^(\d{4})-(\d{2})$/.exec(bucket.key);
    if (monthParts) {
      const start = new Date(Number(monthParts[1]), Number(monthParts[2]) - 1, 1);
      const end = new Date(Number(monthParts[1]), Number(monthParts[2]), 1);
      return { start: start.getTime(), end: end.getTime() };
    }
    const hourParts = /^(\d{2}):00$/.exec(bucket.key);
    if (hourParts) {
      const [year, month, day] = this.appliedFilters().startDate.split('-').map(Number);
      const start = new Date(year, month - 1, day, Number(hourParts[1]));
      const end = new Date(start);
      end.setHours(start.getHours() + 1);
      return { start: start.getTime(), end: end.getTime() };
    }
    return null;
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

  private reportRequestFilters(preferences = this.preferences()): ReportFilters {
    const filters = this.cloneFilters(this.filters);
    if (!this.canIncludeOrganizationEntries(preferences)) {
      filters.includeOrganizationEntries = false;
    }
    return filters;
  }

  private savedFilters(): ReportFilters {
    const fallback = this.defaultFilters();
    try {
      const raw = sessionStorage.getItem(reportFiltersSessionKey);
      if (!raw) {
        return fallback;
      }
      const saved = JSON.parse(raw) as Partial<ReportFilters>;
      const view = this.viewOptions.includes(saved.view as ReportView) ? saved.view as ReportView : fallback.view;
      return {
        ...fallback,
        ...saved,
        view,
        userIds: Array.isArray(saved.userIds) ? saved.userIds : fallback.userIds,
        projectNames: Array.isArray(saved.projectNames) ? saved.projectNames : fallback.projectNames,
        taskIds: Array.isArray(saved.taskIds) ? saved.taskIds : fallback.taskIds,
        includeNoTask: Boolean(saved.includeNoTask),
        includeOrganizationEntries: typeof saved.includeOrganizationEntries === 'boolean'
          ? saved.includeOrganizationEntries
          : fallback.includeOrganizationEntries,
        minRate: typeof saved.minRate === 'number' ? saved.minRate : fallback.minRate,
        maxRate: typeof saved.maxRate === 'number' ? saved.maxRate : fallback.maxRate
      };
    } catch {
      return fallback;
    }
  }

  private saveFilters(filters: ReportFilters): void {
    try {
      sessionStorage.setItem(reportFiltersSessionKey, JSON.stringify(filters));
    } catch {
      return;
    }
  }

  private clearSavedFilters(): void {
    try {
      sessionStorage.removeItem(reportFiltersSessionKey);
    } catch {
      return;
    }
  }

  private taskOptionLabel(taskName: string, projectName: string, projectScoped: boolean): string {
    return projectScoped ? taskName : `${projectName} / ${taskName}`;
  }

  private taskColor(index: number): string {
    if (this.taskBreakdown()[index]?.key === noTaskSegmentKey) {
      return noTaskChartColor;
    }
    return projectChartColors[index % projectChartColors.length];
  }

  private projectColorsForReport(report: TimeReport | null): Map<string, string> {
    const colors = new Map<string, string>();
    if (!report?.projects.length) {
      return colors;
    }
    const projects = [...report.projects].sort((first, second) =>
      second.totalSeconds - first.totalSeconds || first.projectName.localeCompare(second.projectName)
    );
    const usedIndexes = new Set<number>();
    projects.forEach((project, index) => {
      if (index === 0) {
        colors.set(project.projectName, projectPrimaryColor);
        usedIndexes.add(0);
        return;
      }
      colors.set(project.projectName, this.paletteColorForProject(project.projectName, usedIndexes));
    });
    return colors;
  }

  private paletteColorForProject(projectName: string, usedIndexes: Set<number>): string {
    let colorIndex = this.projectColorSeed(projectName) % projectChartColors.length;
    if (usedIndexes.size < projectChartColors.length) {
      while (usedIndexes.has(colorIndex)) {
        colorIndex = (colorIndex + 1) % projectChartColors.length;
      }
      usedIndexes.add(colorIndex);
    }
    return projectChartColors[colorIndex];
  }

  private projectColorSeed(value: string): number {
    return Array.from(value).reduce((hash, character) => ((hash * 31) + character.charCodeAt(0)) >>> 0, 0);
  }

  private rangeFor(view: ReportView): { startDate: string; endDate: string } {
    const now = new Date();
    if (view === 'DAILY') {
      const today = toInputDate(now);
      return { startDate: today, endDate: today };
    }
    if (view === 'WEEKLY') {
      const start = this.startOfWeek(now);
      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      return { startDate: toInputDate(start), endDate: toInputDate(end) };
    }
    if (view === 'YEARLY') {
      return { startDate: `${now.getFullYear()}-01-01`, endDate: `${now.getFullYear()}-12-31` };
    }
    const first = new Date(now.getFullYear(), now.getMonth(), 1);
    const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return { startDate: toInputDate(first), endDate: toInputDate(last) };
  }

  private startOfWeek(date: Date): Date {
    const start = new Date(date);
    const day = (start.getDay() + 6) % 7;
    start.setDate(start.getDate() - day);
    start.setHours(0, 0, 0, 0);
    return start;
  }

  private csvCell(value: unknown): string {
    return `"${String(value).replace(/"/g, '""')}"`;
  }

  private translation(key: string): string {
    return this.translateService.instant(`${this.translationPath}${key}`);
  }
}
