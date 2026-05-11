export type ReportView = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY' | 'CUSTOM';

export interface ReportFilters {
  view: ReportView;
  startDate: string;
  endDate: string;
  timezone: string;
  userIds: string[];
  projectNames: string[];
  minRate: number | null;
  maxRate: number | null;
}

export interface ReportSummary {
  totalSeconds: number;
  totalAmount: number;
  entryCount: number;
  activeSeconds: number;
  activeAmount: number;
  activeEntryCount: number;
  currency: 'EUR';
}

export interface ReportBucket {
  key: string;
  label: string;
  totalSeconds: number;
  totalAmount: number;
}

export interface ReportProject {
  projectName: string;
  totalSeconds: number;
  totalAmount: number;
  percentage: number;
}

export interface ReportEntry {
  id: string;
  userId: string;
  username: string;
  displayName: string;
  projectName: string;
  taskId: string | null;
  taskName: string | null;
  hourlyRate: number;
  currency: 'EUR';
  startedAt: string;
  endedAt: string | null;
  durationSeconds: number;
  billableAmount: number;
  active: boolean;
  groupKey: string;
  groupLabel: string;
}

export interface TimeReport {
  summary: ReportSummary;
  buckets: ReportBucket[];
  projects: ReportProject[];
  entries: ReportEntry[];
}

export interface ReportUserOption {
  id: string;
  username: string;
  displayName: string;
}

export interface ReportFilterOptions {
  users: ReportUserOption[];
  projects: string[];
  rates: number[];
}

export interface ReportEntryGroup {
  key: string;
  label: string;
  entries: ReportEntry[];
}

export interface ProjectEntryGroup {
  key: string;
  projectName: string;
  entries: ReportEntry[];
  totalSeconds: number;
  totalAmount: number;
}
