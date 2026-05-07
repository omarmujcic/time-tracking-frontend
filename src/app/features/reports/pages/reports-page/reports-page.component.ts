import { CurrencyPipe, DatePipe } from '@angular/common';
import { AfterViewInit, Component, ElementRef, OnDestroy, ViewChild, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { Chart, ChartConfiguration, registerables } from 'chart.js';
import { DatePickerComponent } from '../../../../shared/ui/date-picker/date-picker.component';
import { ReportMultiSelectComponent, ReportMultiSelectOption } from '../../components/report-multi-select/report-multi-select.component';
import {
  ProjectEntryGroup,
  ReportEntry,
  ReportEntryGroup,
  ReportFilterOptions,
  ReportFilters,
  ReportView,
  TimeReport
} from '../../models/report.model';
import { ReportPdfService } from '../../services/report-pdf.service';
import { ReportService } from '../../services/report.service';

Chart.register(...registerables);

@Component({
  selector: 'app-reports-page',
  imports: [CurrencyPipe, DatePipe, FormsModule, MatIconModule, DatePickerComponent, ReportMultiSelectComponent, TranslatePipe],
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
  protected readonly options = signal<ReportFilterOptions>({ users: [], projects: [], rates: [] });
  protected readonly expandedProjects = signal<Set<string>>(new Set());
  protected readonly viewOptions: ReportView[] = ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY', 'CUSTOM'];
  protected readonly filters: ReportFilters = this.defaultFilters();
  protected readonly projectEntryGroups = computed(() => this.entryGroupsByProject(this.report()?.entries ?? []));
  protected readonly groupedEntries = computed(() => this.entryGroupsByDate(this.report()?.entries ?? []));
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

  private chartsReady = false;
  private timeChart?: Chart;
  private projectChart?: Chart;

  constructor(
    private readonly reportService: ReportService,
    private readonly reportPdfService: ReportPdfService,
    private readonly translateService: TranslateService
  ) {
    this.loadReports();
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
      const [options, report] = await Promise.all([
        this.reportService.filterOptions(),
        this.reportService.timeReport(this.filters)
      ]);
      this.options.set(options);
      this.report.set(report);
      this.expandedProjects.set(new Set());
      this.scheduleRenderCharts();
    } catch {
      this.loadError.set(this.translation('error.load'));
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
    this.loadReports();
  }

  protected resetFilters(): void {
    Object.assign(this.filters, this.defaultFilters());
    this.loadReports();
  }

  protected durationLabel(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
  }

  protected exportCsv(): void {
    const report = this.report();
    if (!report) {
      return;
    }
    const headers = ['Date', 'User', 'Project', 'Description', 'Rate EUR', 'Start', 'End', 'Duration seconds', 'Amount EUR', 'Active'];
    const rows = report.entries.map((entry) => [
      entry.groupLabel,
      entry.displayName || entry.username,
      entry.projectName,
      entry.description ?? '',
      entry.hourlyRate,
      new Date(entry.startedAt).toLocaleString(),
      entry.endedAt ? new Date(entry.endedAt).toLocaleString() : this.translation('entry.running'),
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
    anchor.download = `time-report-${this.filters.startDate}-${this.filters.endDate}.csv`;
    anchor.click();
    URL.revokeObjectURL(anchor.href);
  }

  protected exportPdf(): void {
    const report = this.report();
    if (!report) {
      return;
    }
    this.reportPdfService.generate(report, this.filters);
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
    const config: ChartConfiguration<'bar'> = {
      type: 'bar',
      data: {
        labels: report.buckets.map((bucket) => bucket.label),
        datasets: [
          {
            label: this.translation('charts.hours'),
            data: report.buckets.map((bucket) => Number((bucket.totalSeconds / 3600).toFixed(2))),
            backgroundColor: '#176b5d',
            borderRadius: 5
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (context) => `${context.parsed.y}h`
            }
          }
        },
        scales: {
          x: { grid: { display: false } },
          y: { beginAtZero: true, ticks: { callback: (value) => `${value}h` } }
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
    const colors = ['#176b5d', '#2f6fed', '#b7791f', '#8a4fff', '#c2410c', '#0f766e', '#be185d', '#4b5563'];
    this.projectChart = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels: report.projects.map((project) => project.projectName),
        datasets: [
          {
            data: report.projects.map((project) => project.totalSeconds),
            backgroundColor: report.projects.map((_, index) => colors[index % colors.length]),
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
          legend: { position: 'bottom' },
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
      minRate: null,
      maxRate: null,
      description: ''
    };
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
