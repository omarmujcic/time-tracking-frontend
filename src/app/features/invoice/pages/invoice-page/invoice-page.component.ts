import { CommonModule } from '@angular/common';
import { Component, computed, effect, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { DatePickerComponent } from '../../../../shared/ui/date-picker/date-picker.component';
import { NotificationToastService } from '../../../../shared/ui/notification-toast/notification-toast.service';
import { httpErrorMessage } from '../../../../shared/utils/http-error-message';
import {
  formatUserCurrency,
  formatUserDate,
  formatUserRateInput,
  parseUserDecimal
} from '../../../../shared/utils/user-formatting';
import { WorkspaceStateFacade } from '../../../../shared/state/workspace/workspace-state.facade';
import { ReportMultiSelectComponent } from '../../../reports/components/report-multi-select/report-multi-select.component';
import { ReportMultiSelectOption } from '../../../reports/components/report-multi-select/report-multi-select.model';
import { PreferenceService } from '../../../settings/services/preference.service';
import { UserPreference } from '../../../settings/models/settings.model';
import {
  Invoice,
  InvoiceDocument,
  InvoiceHistoryItem,
  InvoiceParty,
  InvoiceSetup,
  InvoiceUserSettingsRequest,
  InvoiceWorkspaceSettingsRequest,
  InvoiceWorkPreview
} from '../../models/invoice.model';
import { InvoicePdfService } from '../../services/invoice-pdf.service';
import { InvoiceService } from '../../services/invoice.service';

const defaultPreference: UserPreference = {
  language: 'en',
  themeMode: 'SYSTEM',
  groupedEntriesEnabled: true,
  dateFormat: 'YYYY-MM-DD',
  decimalSeparator: 'DOT',
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
};

@Component({
  selector: 'app-invoice-page',
  imports: [CommonModule, FormsModule, MatIconModule, DatePickerComponent, ReportMultiSelectComponent],
  templateUrl: './invoice-page.component.html',
  styleUrl: './invoice-page.component.scss'
})
export class InvoicePageComponent {
  protected readonly loading = signal(false);
  protected readonly savingSetup = signal(false);
  protected readonly previewLoading = signal(false);
  protected readonly generating = signal(false);
  protected readonly setupMode = signal(false);
  protected readonly setup = signal<InvoiceSetup | null>(null);
  protected readonly workPreview = signal<InvoiceWorkPreview | null>(null);
  protected readonly history = signal<InvoiceHistoryItem[]>([]);
  protected readonly generatedInvoice = signal<Invoice | null>(null);
  protected readonly viewedInvoice = signal<Invoice | null>(null);
  protected readonly viewingInvoiceId = signal<string | null>(null);
  protected readonly preferences = signal<UserPreference>({ ...defaultPreference });
  protected readonly selectedProjectKeys = signal<string[]>([]);
  protected readonly startDate = signal('');
  protected readonly endDate = signal('');
  protected readonly issueDate = signal('');
  protected readonly dueDate = signal('');
  protected readonly timezone = signal(defaultPreference.timezone);
  protected readonly invoiceNumber = signal('');
  protected readonly taxLabel = signal('Tax');
  protected readonly taxRate = signal(0);
  protected readonly terms = signal<string | null>(null);

  protected userSettingsForm: InvoiceUserSettingsRequest = this.emptyUserSettingsForm();
  protected workspaceSettingsForm: InvoiceWorkspaceSettingsRequest = this.emptyWorkspaceSettingsForm();

  protected readonly projectOptions = computed<ReportMultiSelectOption[]>(() =>
    (this.workPreview()?.lines ?? []).map((line) => ({
      value: line.projectKey,
      label: `${line.projectName} · ${this.durationLabel(line.durationSeconds)} · ${this.money(line.totalAmount)}`
    }))
  );
  protected readonly selectedLines = computed(() => {
    const selected = new Set(this.selectedProjectKeys());
    return (this.workPreview()?.lines ?? []).filter((line) => selected.has(line.projectKey));
  });
  protected readonly subtotal = computed(() =>
    this.selectedLines().reduce((total, line) => total + Number(line.totalAmount), 0)
  );
  protected readonly taxAmount = computed(() => Number(((this.subtotal() * this.taxRate()) / 100).toFixed(2)));
  protected readonly total = computed(() => Number((this.subtotal() + this.taxAmount()).toFixed(2)));
  protected readonly downloadableInvoice = computed(() => this.viewedInvoice() ?? this.generatedInvoice());
  protected readonly invoiceDocument = computed<InvoiceDocument | null>(() => {
    const viewed = this.viewedInvoice();
    if (viewed) {
      return {
        invoiceNumber: viewed.invoiceNumber,
        issueDate: viewed.issueDate,
        dueDate: viewed.dueDate,
        periodStart: viewed.periodStart,
        periodEnd: viewed.periodEnd,
        from: viewed.from,
        to: viewed.to,
        lines: viewed.lines.map((line) => ({
          projectKey: line.projectKey,
          projectName: line.projectName,
          description: line.description,
          durationSeconds: line.durationSeconds,
          quantity: Number(line.quantity),
          unitPrice: Number(line.unitPrice),
          taxRate: Number(line.taxRate),
          totalAmount: Number(line.totalAmount)
        })),
        subtotal: Number(viewed.subtotal),
        taxLabel: viewed.taxLabel,
        taxRate: Number(viewed.taxRate),
        taxAmount: Number(viewed.taxAmount),
        total: Number(viewed.total),
        currency: viewed.currency,
        terms: viewed.terms,
        saved: true
      };
    }

    const setup = this.setup();
    if (!setup) {
      return null;
    }
    return {
      invoiceNumber: this.invoiceNumber(),
      issueDate: this.issueDate(),
      dueDate: this.dueDate(),
      periodStart: this.startDate(),
      periodEnd: this.endDate(),
      from: setup.from,
      to: setup.to,
      lines: this.selectedLines().map((line) => ({
        projectKey: line.projectKey,
        projectName: line.projectName,
        description: line.description,
        durationSeconds: line.durationSeconds,
        quantity: Number(line.quantity),
        unitPrice: Number(line.unitPrice),
        taxRate: this.taxRate(),
        totalAmount: Number(line.totalAmount)
      })),
      subtotal: this.subtotal(),
      taxLabel: this.taxLabel(),
      taxRate: this.taxRate(),
      taxAmount: this.taxAmount(),
      total: this.total(),
      currency: setup.currency,
      terms: this.terms(),
      saved: false
    };
  });

  private currentWorkspaceKey = '';

  constructor(
    private readonly invoiceService: InvoiceService,
    private readonly invoicePdfService: InvoicePdfService,
    private readonly preferenceService: PreferenceService,
    private readonly workspaceState: WorkspaceStateFacade,
    private readonly notifications: NotificationToastService
  ) {
    void this.loadPage();
    effect(() => {
      const workspaceKey = this.workspaceState.activeWorkspaceKey();
      if (!workspaceKey || workspaceKey === this.currentWorkspaceKey) {
        return;
      }
      this.currentWorkspaceKey = workspaceKey;
      void this.loadPage();
    });
  }

  protected async saveSetup(): Promise<void> {
    const setup = this.setup();
    this.savingSetup.set(true);
    try {
      let saved = await this.invoiceService.saveUserSettings(this.buildUserSettingsRequest());
      if (setup?.workspaceType === 'PERSONAL') {
        saved = await this.invoiceService.saveWorkspaceSettings(this.buildWorkspaceSettingsRequest());
      }
      this.applySetup(saved);
      this.notifications.success(saved.ready ? 'Invoice setup saved.' : 'Invoice setup saved, but required fields are still missing.');
      if (saved.ready) {
        this.setupMode.set(false);
        await this.loadWorkPreview(true);
      }
    } catch (error) {
      this.notifications.error(httpErrorMessage(error, 'Unable to save invoice setup.'), 'Setup not saved');
    } finally {
      this.savingSetup.set(false);
    }
  }

  protected async refreshPreview(): Promise<void> {
    this.viewedInvoice.set(null);
    await this.loadWorkPreview(false);
  }

  protected updateStartDate(value: string): void {
    this.viewedInvoice.set(null);
    this.startDate.set(value);
    void this.loadWorkPreview(false);
  }

  protected updateEndDate(value: string): void {
    this.viewedInvoice.set(null);
    this.endDate.set(value);
    void this.loadWorkPreview(false);
  }

  protected updateIssueDate(value: string): void {
    this.viewedInvoice.set(null);
    this.issueDate.set(value);
    const setup = this.setup();
    this.dueDate.set(this.addDays(value, setup?.dueDays ?? 14));
  }

  protected updateDueDate(value: string): void {
    this.viewedInvoice.set(null);
    this.dueDate.set(value);
  }

  protected updateProjectSelection(projectKeys: string[]): void {
    this.viewedInvoice.set(null);
    this.selectedProjectKeys.set(projectKeys);
  }

  protected updateInvoiceNumber(value: string): void {
    this.viewedInvoice.set(null);
    this.invoiceNumber.set(value);
  }

  protected updateTaxLabel(value: string): void {
    this.viewedInvoice.set(null);
    this.taxLabel.set(value || 'Tax');
  }

  protected updateTaxRate(value: string): void {
    this.viewedInvoice.set(null);
    this.taxRate.set(parseUserDecimal(value, this.preferences().decimalSeparator) ?? 0);
  }

  protected updateTerms(value: string): void {
    this.viewedInvoice.set(null);
    this.terms.set(value || null);
  }

  protected updateSetupTaxRate(value: string): void {
    this.userSettingsForm.taxRate = parseUserDecimal(value, this.preferences().decimalSeparator) ?? 0;
  }

  protected async generateInvoice(): Promise<void> {
    if (!this.setup()?.ready) {
      this.notifications.error('Complete invoice setup before generating an invoice.');
      this.setupMode.set(true);
      return;
    }
    if (!this.selectedProjectKeys().length) {
      this.notifications.error('Select at least one project with completed work.');
      return;
    }
    if (!this.invoiceNumber().trim()) {
      this.notifications.error('Invoice number is required.');
      return;
    }

    this.generating.set(true);
    try {
      const invoice = await this.invoiceService.generate({
        invoiceNumber: this.invoiceNumber().trim(),
        issueDate: this.issueDate(),
        dueDate: this.dueDate(),
        startDate: this.startDate(),
        endDate: this.endDate(),
        timezone: this.timezone(),
        projectKeys: this.selectedProjectKeys(),
        taxLabel: this.taxLabel().trim() || 'Tax',
        taxRate: this.taxRate(),
        terms: this.terms()?.trim() || null
      });
      this.viewedInvoice.set(null);
      this.generatedInvoice.set(invoice);
      this.invoicePdfService.generate(invoice, this.preferences());
      this.notifications.success(`Invoice ${invoice.invoiceNumber} generated.`);
      const [setup, history] = await Promise.all([
        this.invoiceService.setup(),
        this.invoiceService.history()
      ]);
      this.applySetup(setup);
      this.history.set(history);
    } catch (error) {
      this.notifications.error(httpErrorMessage(error, 'Unable to generate invoice.'), 'Invoice not generated');
    } finally {
      this.generating.set(false);
    }
  }

  protected downloadGeneratedInvoice(): void {
    const invoice = this.downloadableInvoice();
    if (!invoice) {
      return;
    }
    this.invoicePdfService.generate(invoice, this.preferences());
  }

  protected async viewInvoice(invoice: InvoiceHistoryItem): Promise<void> {
    this.viewingInvoiceId.set(invoice.id);
    try {
      this.viewedInvoice.set(await this.invoiceService.invoice(invoice.id));
    } catch (error) {
      this.notifications.error(httpErrorMessage(error, 'Unable to load saved invoice.'), 'Invoice not loaded');
    } finally {
      this.viewingInvoiceId.set(null);
    }
  }

  protected backToDraft(): void {
    this.viewedInvoice.set(null);
  }

  protected money(value: number): string {
    return formatUserCurrency(Number(value), this.preferences());
  }

  protected rateInput(value: number | null): string {
    return formatUserRateInput(value, this.preferences());
  }

  protected date(value: string): string {
    if (!value) {
      return '';
    }
    const [year, month, day] = value.split('-').map(Number);
    return formatUserDate(new Date(year, month - 1, day), this.preferences().dateFormat);
  }

  protected durationLabel(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
  }

  protected partyLines(party: InvoiceParty): string[] {
    return [
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
  }

  protected selectedProjectLabel(): string {
    const count = this.selectedProjectKeys().length;
    return count ? `${count} selected` : 'Select projects';
  }

  private async loadPage(): Promise<void> {
    this.loading.set(true);
    try {
      const [preferences, setup, history] = await Promise.all([
        this.preferenceService.get().catch(() => ({ ...defaultPreference })),
        this.invoiceService.setup(),
        this.invoiceService.history()
      ]);
      this.preferences.set(preferences);
      this.timezone.set(preferences.timezone || defaultPreference.timezone);
      this.history.set(history);
      this.applySetup(setup);
      if (setup.ready) {
        await this.loadWorkPreview(true);
      }
    } catch (error) {
      this.notifications.error(httpErrorMessage(error, 'Unable to load invoice page.'), 'Invoice load failed');
    } finally {
      this.loading.set(false);
    }
  }

  private async loadWorkPreview(selectAllWhenEmpty: boolean): Promise<void> {
    if (!this.startDate() || !this.endDate()) {
      return;
    }
    this.previewLoading.set(true);
    try {
      const preview = await this.invoiceService.workPreview(this.startDate(), this.endDate(), this.timezone());
      this.workPreview.set(preview);
      const availableKeys = new Set(preview.lines.map((line) => line.projectKey));
      const retained = this.selectedProjectKeys().filter((projectKey) => availableKeys.has(projectKey));
      if (retained.length) {
        this.selectedProjectKeys.set(retained);
      } else if (selectAllWhenEmpty) {
        this.selectedProjectKeys.set(preview.lines.map((line) => line.projectKey));
      } else {
        this.selectedProjectKeys.set([]);
      }
    } catch (error) {
      this.notifications.error(httpErrorMessage(error, 'Unable to load invoice work preview.'), 'Preview not loaded');
    } finally {
      this.previewLoading.set(false);
    }
  }

  private applySetup(setup: InvoiceSetup): void {
    this.setup.set(setup);
    this.userSettingsForm = this.userRequestFromSetup(setup);
    this.workspaceSettingsForm = this.workspaceRequestFromSetup(setup);
    this.setupMode.set(!setup.ready);
    this.invoiceNumber.set(setup.suggestedInvoiceNumber || String(setup.nextInvoiceNumber).padStart(4, '0'));
    this.taxLabel.set(setup.taxLabel || 'Tax');
    this.taxRate.set(Number(setup.taxRate) || 0);
    this.terms.set(setup.terms || null);

    if (!this.startDate() || !this.endDate()) {
      const range = this.currentMonthRange();
      this.startDate.set(range.startDate);
      this.endDate.set(range.endDate);
    }
    if (!this.issueDate()) {
      this.issueDate.set(this.formatDate(new Date()));
    }
    this.dueDate.set(this.addDays(this.issueDate(), setup.dueDays || 14));
  }

  private buildUserSettingsRequest(): InvoiceUserSettingsRequest {
    return {
      from: this.normalizeParty(this.userSettingsForm.from),
      nextInvoiceNumber: Math.max(1, Number(this.userSettingsForm.nextInvoiceNumber) || 1),
      taxLabel: this.userSettingsForm.taxLabel?.trim() || 'Tax',
      taxRate: Number(this.userSettingsForm.taxRate) || 0,
      terms: this.userSettingsForm.terms?.trim() || null,
      dueDays: Math.max(0, Number(this.userSettingsForm.dueDays) || 0)
    };
  }

  private buildWorkspaceSettingsRequest(): InvoiceWorkspaceSettingsRequest {
    return {
      to: this.normalizeParty(this.workspaceSettingsForm.to),
      nextInvoiceNumber: Math.max(1, Number(this.workspaceSettingsForm.nextInvoiceNumber) || 1),
      taxLabel: this.workspaceSettingsForm.taxLabel?.trim() || 'Tax',
      taxRate: Number(this.workspaceSettingsForm.taxRate) || 0,
      terms: this.workspaceSettingsForm.terms?.trim() || null,
      dueDays: Math.max(0, Number(this.workspaceSettingsForm.dueDays) || 0)
    };
  }

  private userRequestFromSetup(setup: InvoiceSetup): InvoiceUserSettingsRequest {
    return {
      from: this.partyForm(setup.from),
      nextInvoiceNumber: setup.nextInvoiceNumber || 1,
      taxLabel: setup.taxLabel || 'Tax',
      taxRate: Number(setup.taxRate) || 0,
      terms: setup.terms || null,
      dueDays: setup.dueDays ?? 14
    };
  }

  private workspaceRequestFromSetup(setup: InvoiceSetup): InvoiceWorkspaceSettingsRequest {
    return {
      to: this.partyForm(setup.to),
      nextInvoiceNumber: setup.workspaceNextInvoiceNumber || 1,
      taxLabel: setup.workspaceTaxLabel || 'Tax',
      taxRate: Number(setup.workspaceTaxRate) || 0,
      terms: setup.workspaceTerms || null,
      dueDays: setup.workspaceDueDays ?? 14
    };
  }

  private emptyUserSettingsForm(): InvoiceUserSettingsRequest {
    return {
      from: this.emptyParty(),
      nextInvoiceNumber: 1,
      taxLabel: 'Tax',
      taxRate: 0,
      terms: null,
      dueDays: 14
    };
  }

  private emptyWorkspaceSettingsForm(): InvoiceWorkspaceSettingsRequest {
    return {
      to: this.emptyParty(),
      nextInvoiceNumber: 1,
      taxLabel: 'Tax',
      taxRate: 0,
      terms: null,
      dueDays: 14
    };
  }

  private partyForm(party: InvoiceParty): InvoiceParty {
    return {
      name: party.name || '',
      contactPerson: party.contactPerson || '',
      addressLine1: party.addressLine1 || '',
      addressLine2: party.addressLine2 || '',
      postalCode: party.postalCode || '',
      city: party.city || '',
      country: party.country || '',
      email: party.email || '',
      phone: party.phone || '',
      taxId: party.taxId || '',
      registrationNumber: party.registrationNumber || ''
    };
  }

  private normalizeParty(party: InvoiceParty): InvoiceParty {
    return {
      name: this.clean(party.name),
      contactPerson: this.clean(party.contactPerson),
      addressLine1: this.clean(party.addressLine1),
      addressLine2: this.clean(party.addressLine2),
      postalCode: this.clean(party.postalCode),
      city: this.clean(party.city),
      country: this.clean(party.country),
      email: this.clean(party.email),
      phone: this.clean(party.phone),
      taxId: this.clean(party.taxId),
      registrationNumber: this.clean(party.registrationNumber)
    };
  }

  private emptyParty(): InvoiceParty {
    return {
      name: '',
      contactPerson: '',
      addressLine1: '',
      addressLine2: '',
      postalCode: '',
      city: '',
      country: '',
      email: '',
      phone: '',
      taxId: '',
      registrationNumber: ''
    };
  }

  private currentMonthRange(): { startDate: string; endDate: string } {
    const now = new Date();
    return {
      startDate: this.formatDate(new Date(now.getFullYear(), now.getMonth(), 1)),
      endDate: this.formatDate(new Date(now.getFullYear(), now.getMonth() + 1, 0))
    };
  }

  private addDays(value: string, days: number): string {
    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    date.setDate(date.getDate() + days);
    return this.formatDate(date);
  }

  private formatDate(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  private clean(value: string | null): string | null {
    return value?.trim() || null;
  }
}
