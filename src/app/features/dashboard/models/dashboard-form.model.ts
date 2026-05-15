export interface EntryDetailsForm {
  projectId: string;
  taskId: string;
  projectName: string;
  hourlyRate: number | null;
}

export type TimerForm = EntryDetailsForm;

export interface ManualEntryTimeFields {
  date: string;
  startTime: string;
  endTime: string;
}

export type ManualForm = EntryDetailsForm & ManualEntryTimeFields;

export interface EditTimeEntryForm extends EntryDetailsForm {
  date: string;
  startTime: string;
  endTime: string;
}

export interface FiltersForm {
  month: string;
  day: string;
  projectNames: string[];
  userIds: string[];
}
