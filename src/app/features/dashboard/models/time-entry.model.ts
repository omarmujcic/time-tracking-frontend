export interface TimeEntry {
  id: string;
  userId: string;
  username: string;
  displayName: string;
  projectName: string;
  description: string | null;
  hourlyRate: number;
  currency: 'EUR';
  startedAt: string;
  endedAt: string | null;
  durationSeconds: number;
  billableAmount: number;
  active: boolean;
}

export interface TimeEntrySummary {
  totalSeconds: number;
  totalAmount: number;
  currency: 'EUR';
  entryCount: number;
  hasActiveTimer: boolean;
}

export interface StartTimerRequest {
  projectName: string;
  description?: string | null;
  hourlyRate: number;
}

export interface CreateTimeEntryRequest extends StartTimerRequest {
  startedAt: string;
  endedAt: string;
}

export interface UpdateTimeEntryRequest extends StartTimerRequest {
  startedAt: string;
  endedAt: string | null;
}

export interface TimeEntryFilters {
  month?: string;
  day?: string;
  project?: string;
  userId?: string;
}
