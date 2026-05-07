import { Injectable } from '@angular/core';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { ReportEntry, ReportEntryGroup, ReportFilters, TimeReport } from '../models/report.model';

@Injectable({ providedIn: 'root' })
export class ReportPdfService {
  private readonly margin = 14;
  private readonly accent = '#176b5d';
  private readonly text = '#142033';
  private readonly muted = '#647284';
  private readonly border = '#dce3eb';

  generate(report: TimeReport, filters: ReportFilters): void {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    let y = this.margin;

    y = this.drawHeader(doc, filters, y);
    y = this.drawSummary(doc, report, y + 8);
    y = this.drawTimeChart(doc, report, y + 10);
    y = this.drawProjectBreakdown(doc, report, y + 10);
    this.drawEntries(doc, this.groupEntriesByDate(report.entries), y + 10);

    doc.save(`time-report-${filters.startDate}-${filters.endDate}.pdf`);
  }

  private drawHeader(doc: jsPDF, filters: ReportFilters, y: number): number {
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
    doc.text(`Report range ${filters.startDate} - ${filters.endDate}`, this.margin, y + 17);
    doc.text(`Generated ${new Date().toLocaleString()}`, this.margin, y + 23);
    return y + 23;
  }

  private drawSummary(doc: jsPDF, report: TimeReport, y: number): number {
    const cards = [
      ['Completed time', this.durationLabel(report.summary.totalSeconds)],
      ['Completed amount', this.eur(report.summary.totalAmount)],
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

  private drawTimeChart(doc: jsPDF, report: TimeReport, y: number): number {
    y = this.ensureSpace(doc, y, 78);
    this.drawSectionCard(doc, 'Worked time by period', y, 78);

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

    report.buckets.forEach((bucket, index) => {
      const hours = bucket.totalSeconds / 3600;
      const height = (hours / maxHours) * chartHeight;
      const x = chartX + index * (barWidth + barGap);
      const top = chartY + chartHeight - height;
      doc.setFillColor(this.accent);
      doc.roundedRect(x, top, barWidth, Math.max(0.8, height), 0.8, 0.8, 'F');
      if (index % Math.ceil(report.buckets.length / 8) === 0) {
        doc.setTextColor(this.muted);
        doc.setFontSize(6);
        doc.text(bucket.label, x, chartY + chartHeight + 5, { angle: 45 });
      }
    });
    return y + 78;
  }

  private drawProjectBreakdown(doc: jsPDF, report: TimeReport, y: number): number {
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
      doc.text(`${this.durationLabel(project.totalSeconds)} · ${this.eur(project.totalAmount)}`, this.margin + 8, rowY + 5);

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

  private drawEntries(doc: jsPDF, groups: ReportEntryGroup[], y: number): void {
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
        head: [['User', 'Project', 'Description', 'Rate', 'Time', 'Amount']],
        body: group.entries.map((entry) => [
          entry.username,
          entry.projectName,
          entry.description || 'No description',
          `${this.eur(entry.hourlyRate)}/h`,
          `${this.durationLabel(entry.durationSeconds)}\n${this.shortDate(entry.startedAt)} - ${entry.endedAt ? this.shortDate(entry.endedAt) : 'Running'}`,
          this.eur(entry.billableAmount)
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

  private eur(value: number): string {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'EUR' }).format(value);
  }

  private shortDate(value: string): string {
    return new Date(value).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }
}
