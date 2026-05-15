export type NotificationType = 'PROJECT_BILLING_ISSUE';
export type NotificationStatus = 'OPEN' | 'RESOLVED';
export type NotificationStatusFilter = NotificationStatus | 'ALL';

export interface AppNotification {
  id: string;
  type: NotificationType;
  status: NotificationStatus;
  message: string;
  subjectType: string | null;
  subjectId: string | null;
  subjectLabel: string | null;
  createdByUserId: string;
  createdByUsername: string;
  createdByDisplayName: string;
  resolvedByUserId: string | null;
  resolvedByUsername: string | null;
  resolvedByDisplayName: string | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  canResolve: boolean;
  canReopen: boolean;
  canDismiss: boolean;
}

export interface NotificationCount {
  openCount: number;
}

export interface CreateProjectBillingIssueRequest {
  projectId: string;
  message: string;
}
