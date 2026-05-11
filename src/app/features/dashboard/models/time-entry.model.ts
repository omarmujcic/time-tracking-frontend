export interface TimeEntry {
  id: string;
  userId: string;
  username: string;
  displayName: string;
  projectId: string | null;
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
}

export interface TimeEntrySummary {
  totalSeconds: number;
  totalAmount: number;
  currency: 'EUR';
  entryCount: number;
  hasActiveTimer: boolean;
}

export interface StartTimerRequest {
  projectId?: string | null;
  taskId?: string | null;
  projectName?: string | null;
  hourlyRate?: number | null;
}

export interface CreateTimeEntryRequest extends StartTimerRequest {
  projectId: string;
  projectName: string;
  hourlyRate: number;
  startedAt: string;
  endedAt: string;
}

export interface UpdateTimeEntryRequest extends StartTimerRequest {
  projectId: string;
  projectName: string;
  hourlyRate: number;
  startedAt: string;
  endedAt: string | null;
}

export interface TimeEntryFilters {
  month?: string;
  day?: string;
  project?: string;
  userId?: string;
  projectNames?: string[];
  userIds?: string[];
}
