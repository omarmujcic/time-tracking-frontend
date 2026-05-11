import { TimeEntry } from './time-entry.model';

export interface ProjectEntryGroup {
  key: string;
  projectName: string;
  entries: TimeEntry[];
  totalSeconds: number;
  totalAmount: number;
}

export interface DayEntryGroup {
  key: string;
  label: string;
  entries: TimeEntry[];
  projects: ProjectEntryGroup[];
  totalSeconds: number;
  totalAmount: number;
}
