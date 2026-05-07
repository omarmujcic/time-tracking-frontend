export interface TimerForm {
  projectName: string;
  description: string;
  hourlyRate: number | null;
}

export interface ManualForm extends TimerForm {
  startedAt: string;
  endedAt: string;
}

export interface FiltersForm {
  month: string;
  day: string;
  project: string;
  userId: string;
}
