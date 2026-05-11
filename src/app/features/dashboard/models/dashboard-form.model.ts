export interface TimerForm {
  projectId: string;
  taskId: string;
  projectName: string;
  hourlyRate: number | null;
}

export interface ManualForm extends TimerForm {
  startedAt: string;
  endedAt: string;
}

export interface FiltersForm {
  month: string;
  day: string;
  projectNames: string[];
  userIds: string[];
}
