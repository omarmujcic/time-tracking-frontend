import { Injectable } from '@angular/core';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatUserCurrency, formatUserDate, formatUserDateTime } from '../../../shared/utils/user-formatting';
import { UserPreference } from '../../settings/models/settings.model';
import { ReportBucketSegment, ReportEntry, ReportEntryGroup, ReportFilters, TimeReport } from '../models/report.model';

const noTaskSegmentKey = '__NO_TASK__';
const taskChartColors = ['#8b5cf6', '#c17f13', '#2f6fed', '#14b8a6', '#db2777', '#65a30d', '#dc2626', '#0891b2'];

@Injectable({ providedIn: 'root' })
export class ReportPdfService {
  private readonly margin = 14;
  private readonly accent = '#176b5d';
  private readonly text = '#142033';
  private readonly muted = '#647284';
  private readonly border = '#dce3eb';

  generate(report: TimeReport, filters: ReportFilters, preferences: UserPreference): void {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    let y = this.margin;

    y = this.drawHeader(doc, filters, preferences, y);
    y = this.drawSummary(doc, report, preferences, y + 8);
    y = this.drawTimeChart(doc, report, filters, y + 10);
    y = this.drawProjectBreakdown(doc, report, preferences, y + 10);
    this.drawEntries(doc, this.groupEntriesByDate(report.entries), preferences, y + 10);

    doc.save(`time-report-${filters.startDate}-${filters.endDate}.pdf`);
  }

  private drawHeader(doc: jsPDF, filters: ReportFilters, preferences: UserPreference, y: number): number {
    doc.setTextColor(this.muted);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text('REPORTS', this.margin, y);

    doc.setTextColor(this.text);
    doc.setFontSize(22);
    doc.text('Time reports', this.margin, y + 9);

    doc.setTextColor(this.muted);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(`Report range ${this.date(filters.startDate, preferences)} - ${this.date(filters.endDate, preferences)}`, this.margin, y + 17);
    doc.text(`Generated ${formatUserDateTime(new Date().toISOString(), preferences)}`, this.margin, y + 23);
    return y + 23;
  }

  private drawSummary(doc: jsPDF, report: TimeReport, preferences: UserPreference, y: number): number {
    const cards = [
      ['Completed time', this.durationLabel(report.summary.totalSeconds)],
      ['Completed amount', formatUserCurrency(report.summary.totalAmount, preferences)],
      ['Active time', this.durationLabel(report.summary.activeSeconds)],
      ['Entries', String(report.summary.entryCount)]
    ];
    const gap = 4;
    const width = (this.pageWidth(doc) - this.margin * 2 - gap) / 2;
    const height = 20;

    cards.forEach(([label, value], index) => {
      const column = index % 2;
      const row = Math.floor(index / 2);
      const x = this.margin + column * (width + gap);
      const top = y + row * (height + gap);
      doc.setDrawColor(this.border);
      doc.roundedRect(x, top, width, height, 2, 2);
      doc.setTextColor(this.muted);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.text(label, x + 4, top + 7);
      doc.setTextColor(this.accent);
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text(value, x + 4, top + 15);
    });
    return y + height * 2 + gap;
  }

  private drawTimeChart(doc: jsPDF, report: TimeReport, filters: ReportFilters, y: number): number {
    const stackedByTask = this.shouldDrawStackedTimeChart(report, filters);
    const height = stackedByTask ? 90 : 78;
    y = this.ensureSpace(doc, y, height);
    this.drawSectionCard(doc, 'Worked time by period', y, height);

    const chartX = this.margin + 8;
    const chartY = y + 18;
    const chartWidth = this.pageWidth(doc) - this.margin * 2 - 16;
    const chartHeight = 46;
    const maxHours = Math.max(1, ...report.buckets.map((bucket) => bucket.totalSeconds / 3600));
    const barGap = 1.2;
    const barWidth = Math.max(1.8, (chartWidth - barGap * (report.buckets.length - 1)) / Math.max(1, report.buckets.length));

    doc.setDrawColor('#edf1f5');
    for (let index = 0; index <= 4; index++) {
      const lineY = chartY + (chartHeight / 4) * index;
      doc.line(chartX, lineY, chartX + chartWidth, lineY);
    }

    if (stackedByTask) {
      const datasets = this.taskChartDatasets(report);
      report.buckets.forEach((bucket, bucketIndex) => {
        let offsetHeight = 0;
        datasets.forEach((dataset) => {
          const hours = dataset.hoursByBucket[bucketIndex] ?? 0;
          if (!hours) {
            return;
          }
          const segmentHeight = (hours / maxHours) * chartHeight;
          const x = chartX + bucketIndex * (barWidth + barGap);
          const top = chartY + chartHeight - offsetHeight - segmentHeight;
          doc.setFillColor(dataset.color);
          doc.roundedRect(x, top, barWidth, Math.max(0.8, segmentHeight), 0.6, 0.6, 'F');
          offsetHeight += segmentHeight;
        });
        if (bucketIndex % Math.ceil(report.buckets.length / 8) === 0) {
          doc.setTextColor(this.muted);
          doc.setFontSize(6);
          doc.text(bucket.label, chartX + bucketIndex * (barWidth + barGap), chartY + chartHeight + 5, { angle: 45 });
        }
      });
      this.drawTaskLegend(doc, datasets, chartX, y + 70);
      return y + height;
    }

    report.buckets.forEach((bucket, index) => {
      const hours = bucket.totalSeconds / 3600;
      const barHeight = (hours / maxHours) * chartHeight;
      const x = chartX + index * (barWidth + barGap);
      const top = chartY + chartHeight - barHeight;
      doc.setFillColor(this.accent);
      doc.roundedRect(x, top, barWidth, Math.max(0.8, barHeight), 0.8, 0.8, 'F');
      if (index % Math.ceil(report.buckets.length / 8) === 0) {
        doc.setTextColor(this.muted);
        doc.setFontSize(6);
        doc.text(bucket.label, x, chartY + chartHeight + 5, { angle: 45 });
      }
    });
    return y + 78;
  }

  private drawProjectBreakdown(doc: jsPDF, report: TimeReport, preferences: UserPreference, y: number): number {
    const height = Math.max(34, 18 + report.projects.length * 12);
    y = this.ensureSpace(doc, y, height);
    this.drawSectionCard(doc, 'Worked time by project', y, height);

    let rowY = y + 18;
    report.projects.forEach((project) => {
      doc.setTextColor(this.text);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text(project.projectName, this.margin + 8, rowY);

      doc.setTextColor(this.muted);
      doc.setFont('helvetica', 'normal');
      doc.text(`${this.durationLabel(project.totalSeconds)} · ${formatUserCurrency(project.totalAmount, preferences)}`, this.margin + 8, rowY + 5);

      const barX = this.pageWidth(doc) - this.margin - 70;
      doc.setTextColor(this.muted);
      doc.text(`${project.percentage}%`, barX + 58, rowY, { align: 'right' });
      doc.setFillColor('#e6ebf1');
      doc.roundedRect(barX, rowY + 2, 58, 3, 1.5, 1.5, 'F');
      doc.setFillColor(this.accent);
      doc.roundedRect(barX, rowY + 2, 58 * (Number(project.percentage) / 100), 3, 1.5, 1.5, 'F');
      rowY += 12;
    });
    return y + height;
  }

  private drawEntries(doc: jsPDF, groups: ReportEntryGroup[], preferences: UserPreference, y: number): void {
    y = this.ensureSpace(doc, y, 28);
    doc.setTextColor(this.text);
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.text('Detailed entries', this.margin, y);
    y += 6;

    groups.forEach((group) => {
      y = this.ensureSpace(doc, y, 20);
      doc.setTextColor(this.text);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text(group.label, this.margin, y);
      y += 3;

      autoTable(doc, {
        startY: y,
        margin: { left: this.margin, right: this.margin },
        head: [['User', 'Project', 'Task', 'Rate', 'Time', 'Amount']],
        body: group.entries.map((entry) => [
          entry.username,
          entry.projectName,
          entry.taskName || 'No task',
          `${formatUserCurrency(entry.hourlyRate, preferences)}/h`,
          `${this.durationLabel(entry.durationSeconds)}\n${formatUserDateTime(entry.startedAt, preferences)} - ${entry.endedAt ? formatUserDateTime(entry.endedAt, preferences) : 'Running'}`,
          formatUserCurrency(entry.billableAmount, preferences)
        ]),
        styles: {
          font: 'helvetica',
          fontSize: 8,
          cellPadding: 2.6,
          lineColor: this.border,
          lineWidth: 0.1,
          textColor: this.text,
          overflow: 'linebreak'
        },
        headStyles: {
          fillColor: [251, 252, 254],
          textColor: [100, 114, 132],
          fontStyle: 'bold'
        },
        alternateRowStyles: {
          fillColor: [248, 250, 252]
        },
        columnStyles: {
          0: { cellWidth: 24 },
          1: { cellWidth: 28 },
          2: { cellWidth: 42 },
          3: { cellWidth: 20 },
          4: { cellWidth: 44 },
          5: { cellWidth: 22, halign: 'right' }
        }
      });
      y = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y;
      y += 8;
    });
  }

  private drawSectionCard(doc: jsPDF, title: string, y: number, height: number): void {
    doc.setDrawColor(this.border);
    doc.roundedRect(this.margin, y, this.pageWidth(doc) - this.margin * 2, height, 2, 2);
    doc.setTextColor(this.text);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text(title, this.margin + 8, y + 10);
  }

  private ensureSpace(doc: jsPDF, y: number, height: number): number {
    if (y + height <= this.pageHeight(doc) - this.margin) {
      return y;
    }
    doc.addPage();
    return this.margin;
  }

  private groupEntriesByDate(entries: ReportEntry[]): ReportEntryGroup[] {
    const groups = new Map<string, ReportEntryGroup>();
    entries.forEach((entry) => {
      const group = groups.get(entry.groupKey) ?? { key: entry.groupKey, label: entry.groupLabel, entries: [] };
      group.entries.push(entry);
      groups.set(entry.groupKey, group);
    });
    return Array.from(groups.values());
  }

  private shouldDrawStackedTimeChart(report: TimeReport, filters: ReportFilters): boolean {
    return Boolean(
      filters.projectNames.length === 1
      && report.buckets.some((bucket) => bucket.taskSegments?.length)
    );
  }

  private taskChartDatasets(report: TimeReport): { key: string; label: string; color: string; hoursByBucket: number[] }[] {
    return this.taskBreakdown(report)
      .map((task, index) => ({
        key: task.key,
        label: task.label,
        color: this.taskColor(task.key, index),
        hoursByBucket: report.buckets.map((bucket) => {
          const matchingSegment = bucket.taskSegments?.find((bucketSegment) => this.taskSegmentKey(bucketSegment) === task.key);
          return (matchingSegment?.totalSeconds ?? 0) / 3600;
        })
      }));
  }

  private taskBreakdown(report: TimeReport): { key: string; label: string; totalSeconds: number }[] {
    const totals = new Map<string, { label: string; totalSeconds: number }>();
    report.buckets.forEach((bucket) => {
      bucket.taskSegments?.forEach((segment) => {
        const key = this.taskSegmentKey(segment);
        const total = totals.get(key) ?? { label: this.taskSegmentLabel(segment), totalSeconds: 0 };
        total.totalSeconds += segment.totalSeconds;
        totals.set(key, total);
      });
    });
    return Array.from(totals.entries())
      .map(([key, task]) => ({ key, label: task.label, totalSeconds: task.totalSeconds }))
      .sort((first, second) => second.totalSeconds - first.totalSeconds || first.label.localeCompare(second.label));
  }

  private drawTaskLegend(
    doc: jsPDF,
    datasets: { label: string; color: string }[],
    x: number,
    y: number
  ): void {
    let cursorX = x;
    let cursorY = y;
    datasets.slice(0, 8).forEach((dataset) => {
      const label = dataset.label.length > 22 ? `${dataset.label.slice(0, 19)}...` : dataset.label;
      const width = doc.getTextWidth(label) + 8;
      if (cursorX + width > this.pageWidth(doc) - this.margin) {
        cursorX = x;
        cursorY += 5;
      }
      doc.setFillColor(dataset.color);
      doc.rect(cursorX, cursorY - 2.5, 3, 3, 'F');
      doc.setTextColor(this.muted);
      doc.setFontSize(7);
      doc.text(label, cursorX + 5, cursorY);
      cursorX += width + 4;
    });
  }

  private taskSegmentKey(segment: ReportBucketSegment): string {
    return segment.taskId ?? noTaskSegmentKey;
  }

  private taskSegmentLabel(segment: ReportBucketSegment): string {
    if (!segment.taskId) {
      return 'No task';
    }
    return segment.projectName ? `${segment.projectName} / ${segment.taskName ?? 'No task'}` : segment.taskName ?? 'No task';
  }

  private taskColor(key: string, index: number): string {
    if (key === noTaskSegmentKey) {
      return '#6b7280';
    }
    return taskChartColors[index % taskChartColors.length];
  }

  private pageWidth(doc: jsPDF): number {
    return doc.internal.pageSize.getWidth();
  }

  private pageHeight(doc: jsPDF): number {
    return doc.internal.pageSize.getHeight();
  }

  private durationLabel(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
  }

  private date(value: string, preferences: UserPreference): string {
    const [year, month, day] = value.split('-').map(Number);
    return formatUserDate(new Date(year, month - 1, day), preferences.dateFormat);
  }
}
