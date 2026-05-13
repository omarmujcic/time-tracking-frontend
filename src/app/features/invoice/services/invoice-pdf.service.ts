import { Injectable } from '@angular/core';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatUserCurrency, formatUserDate } from '../../../shared/utils/user-formatting';
import { UserPreference } from '../../settings/models/settings.model';
import { Invoice, InvoiceParty } from '../models/invoice.model';

@Injectable({ providedIn: 'root' })
export class InvoicePdfService {
  private readonly margin = 14;
  private readonly text = '#111827';
  private readonly muted = '#4b5563';
  private readonly border = '#d1d5db';

  generate(invoice: Invoice, preferences: UserPreference): void {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();

    doc.setTextColor(this.text);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(13);
    doc.text(invoice.from.name || '', this.margin, 22);

    doc.setFontSize(20);
    doc.text(`Invoice: ${invoice.invoiceNumber}`, pageWidth - this.margin, 22, { align: 'right' });
    doc.setTextColor(this.muted);
    doc.setFontSize(8);
    doc.text(`Issued on: ${this.date(invoice.issueDate, preferences)}`, pageWidth - this.margin, 29, { align: 'right' });
    doc.text(`Due by: ${this.date(invoice.dueDate, preferences)}`, pageWidth - this.margin, 35, { align: 'right' });

    this.drawParty(doc, 'From', invoice.from, this.margin, 52);
    this.drawParty(doc, 'To', invoice.to, pageWidth / 2 + 5, 52);

    autoTable(doc, {
      startY: 104,
      margin: { left: this.margin, right: this.margin },
      head: [['Product', 'Quantity', 'Unit Price', 'Tax', 'Total']],
      body: invoice.lines.map((line) => [
        `${line.projectName}\n${line.description || this.durationLabel(line.durationSeconds) + ' of work'}`,
        this.quantity(line.quantity),
        this.money(line.unitPrice, preferences),
        this.taxLabel(line.taxRate),
        this.money(line.totalAmount, preferences)
      ]),
      styles: {
        font: 'helvetica',
        fontSize: 8.5,
        cellPadding: 3,
        textColor: this.text,
        lineColor: this.border,
        lineWidth: 0.1,
        overflow: 'linebreak'
      },
      headStyles: {
        fillColor: [220, 225, 231],
        textColor: [75, 85, 99],
        fontStyle: 'bold'
      },
      columnStyles: {
        0: { cellWidth: 94 },
        1: { cellWidth: 24, halign: 'right' },
        2: { cellWidth: 32, halign: 'right' },
        3: { cellWidth: 20, halign: 'right' },
        4: { cellWidth: 24, halign: 'right' }
      }
    });

    const finalY = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 126;
    const summaryX = pageWidth - this.margin - 64;
    let y = finalY + 12;
    doc.setDrawColor(this.border);
    doc.line(this.margin, finalY + 5, pageWidth - this.margin, finalY + 5);
    doc.setFillColor(220, 225, 231);
    doc.rect(summaryX, y, 64, 12, 'F');
    doc.setTextColor(this.muted);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('Invoice Summary', summaryX + 62, y + 8, { align: 'right' });
    y += 18;
    this.drawSummaryRow(doc, 'Subtotal', this.money(invoice.subtotal, preferences), summaryX, y);
    this.drawSummaryRow(doc, invoice.taxLabel || 'Tax', this.money(invoice.taxAmount, preferences), summaryX, y + 8);
    this.drawSummaryRow(doc, 'Total', this.money(invoice.total, preferences), summaryX, y + 16);

    if (invoice.terms?.trim()) {
      doc.setTextColor(this.muted);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.text('Terms', this.margin, pageHeight - 30);
      doc.setTextColor(this.text);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.text(doc.splitTextToSize(invoice.terms, pageWidth - this.margin * 2), this.margin, pageHeight - 23);
    }

    doc.setTextColor(this.text);
    doc.setFontSize(8);
    doc.text('1 / 1', pageWidth - this.margin, pageHeight - 10, { align: 'right' });
    doc.save(`invoice-${invoice.invoiceNumber}.pdf`);
  }

  private drawParty(doc: jsPDF, label: string, party: InvoiceParty, x: number, y: number): void {
    doc.setTextColor(this.text);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text(label, x, y);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    const lines = [
      party.name,
      party.contactPerson,
      party.addressLine1,
      party.addressLine2,
      [party.postalCode, party.city].filter(Boolean).join(' '),
      party.country,
      party.email,
      party.phone,
      party.taxId ? `Tax ID: ${party.taxId}` : null,
      party.registrationNumber ? `Reg No: ${party.registrationNumber}` : null
    ].filter((line): line is string => Boolean(line?.trim()));

    lines.forEach((line, index) => {
      doc.text(line, x, y + 7 + index * 5);
    });
  }

  private drawSummaryRow(doc: jsPDF, label: string, value: string, x: number, y: number): void {
    doc.setTextColor(this.text);
    doc.setFont('helvetica', label === 'Total' ? 'bold' : 'normal');
    doc.setFontSize(9);
    doc.text(label, x, y);
    doc.text(value, x + 64, y, { align: 'right' });
  }

  private date(value: string, preferences: UserPreference): string {
    const [year, month, day] = value.split('-').map(Number);
    return formatUserDate(new Date(year, month - 1, day), preferences.dateFormat);
  }

  private money(value: number, preferences: UserPreference): string {
    return formatUserCurrency(Number(value), preferences);
  }

  private taxLabel(value: number): string {
    return `${Number(value).toFixed(2)}%`;
  }

  private quantity(value: number): string {
    return Number(value).toFixed(2).replace(/\.00$/, '');
  }

  private durationLabel(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h${String(minutes).padStart(2, '0')}m`;
  }
}
