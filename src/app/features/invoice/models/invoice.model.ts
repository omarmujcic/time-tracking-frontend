import { WorkspaceType } from '../../settings/models/settings.model';

export interface InvoiceParty {
  name: string | null;
  contactPerson: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  postalCode: string | null;
  city: string | null;
  country: string | null;
  email: string | null;
  phone: string | null;
  taxId: string | null;
  registrationNumber: string | null;
}

export interface InvoiceSetup {
  workspaceType: WorkspaceType;
  organizationId: string | null;
  workspaceName: string;
  from: InvoiceParty;
  to: InvoiceParty;
  nextInvoiceNumber: number;
  suggestedInvoiceNumber: string;
  taxLabel: string;
  taxRate: number;
  terms: string | null;
  dueDays: number;
  currency: 'EUR';
  workspaceNextInvoiceNumber: number;
  workspaceSuggestedInvoiceNumber: string;
  workspaceTaxLabel: string;
  workspaceTaxRate: number;
  workspaceTerms: string | null;
  workspaceDueDays: number;
  ready: boolean;
  fromReady: boolean;
  toReady: boolean;
  canManageUserSettings: boolean;
  canManageWorkspaceSettings: boolean;
  canManageSetup: boolean;
}

export interface InvoiceUserSettingsRequest {
  from: InvoiceParty;
  nextInvoiceNumber: number;
  taxLabel: string;
  taxRate: number;
  terms: string | null;
  dueDays: number;
}

export interface InvoiceWorkspaceSettingsRequest {
  to: InvoiceParty;
  nextInvoiceNumber: number;
  taxLabel: string;
  taxRate: number;
  terms: string | null;
  dueDays: number;
}

export interface InvoiceWorkLine {
  projectKey: string;
  projectId: string | null;
  projectName: string;
  description: string;
  durationSeconds: number;
  quantity: number;
  unitPrice: number;
  totalAmount: number;
  currency: 'EUR';
}

export interface InvoiceWorkPreview {
  startDate: string;
  endDate: string;
  lines: InvoiceWorkLine[];
  subtotal: number;
  currency: 'EUR';
}

export interface InvoiceGenerateRequest {
  invoiceNumber: string;
  issueDate: string;
  dueDate: string;
  startDate: string;
  endDate: string;
  timezone: string;
  projectKeys: string[];
  taxLabel: string;
  taxRate: number;
  terms: string | null;
}

export interface InvoiceLine {
  id: string;
  lineOrder: number;
  projectKey: string;
  projectId: string | null;
  projectName: string;
  description: string | null;
  durationSeconds: number;
  quantity: number;
  unitPrice: number;
  taxRate: number;
  totalAmount: number;
}

export interface Invoice {
  id: string;
  workspaceType: WorkspaceType;
  organizationId: string | null;
  invoiceNumber: string;
  issueDate: string;
  dueDate: string;
  periodStart: string;
  periodEnd: string;
  from: InvoiceParty;
  to: InvoiceParty;
  lines: InvoiceLine[];
  subtotal: number;
  taxLabel: string;
  taxRate: number;
  taxAmount: number;
  total: number;
  currency: 'EUR';
  terms: string | null;
  createdAt: string;
}

export interface InvoiceHistoryItem {
  id: string;
  invoiceNumber: string;
  issueDate: string;
  dueDate: string;
  periodStart: string;
  periodEnd: string;
  total: number;
  currency: 'EUR';
  createdAt: string;
}

export interface InvoiceDocumentLine {
  projectKey: string;
  projectName: string;
  description: string | null;
  durationSeconds: number;
  quantity: number;
  unitPrice: number;
  taxRate: number;
  totalAmount: number;
}

export interface InvoiceDocument {
  invoiceNumber: string;
  issueDate: string;
  dueDate: string;
  periodStart: string;
  periodEnd: string;
  from: InvoiceParty;
  to: InvoiceParty;
  lines: InvoiceDocumentLine[];
  subtotal: number;
  taxLabel: string;
  taxRate: number;
  taxAmount: number;
  total: number;
  currency: 'EUR';
  terms: string | null;
  saved: boolean;
}
