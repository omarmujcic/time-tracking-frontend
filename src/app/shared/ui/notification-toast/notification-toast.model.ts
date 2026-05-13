export type NotificationToastType = 'success' | 'error' | 'info';

export interface NotificationToast {
  type: NotificationToastType;
  title: string;
  message: string;
  icon: string;
}

export interface NotificationToastOptions {
  type: NotificationToastType;
  title?: string;
  message: string;
  durationMs?: number;
  icon?: string;
}
