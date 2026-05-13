import { Injectable, signal } from '@angular/core';
import { NotificationToast, NotificationToastOptions } from './notification-toast.model';

const defaultDurationMs = 10000;

@Injectable({ providedIn: 'root' })
export class NotificationToastService {
  readonly toast = signal<NotificationToast | null>(null);

  private timeoutId: number | null = null;

  success(message: string, title = 'Success'): void {
    this.show({ type: 'success', title, message, icon: 'check_circle' });
  }

  error(message: string, title = 'Action needed'): void {
    this.show({ type: 'error', title, message, icon: 'error' });
  }

  info(message: string, title = 'Notice'): void {
    this.show({ type: 'info', title, message, icon: 'info' });
  }

  dismiss(): void {
    if (this.timeoutId !== null) {
      window.clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
    this.toast.set(null);
  }

  private show(options: NotificationToastOptions): void {
    if (this.timeoutId !== null) {
      window.clearTimeout(this.timeoutId);
    }
    this.toast.set({
      type: options.type,
      title: options.title ?? this.defaultTitle(options.type),
      message: options.message,
      icon: options.icon ?? this.defaultIcon(options.type)
    });
    this.timeoutId = window.setTimeout(() => this.dismiss(), options.durationMs ?? defaultDurationMs);
  }

  private defaultTitle(type: NotificationToast['type']): string {
    return type === 'success' ? 'Success' : type === 'error' ? 'Action needed' : 'Notice';
  }

  private defaultIcon(type: NotificationToast['type']): string {
    return type === 'success' ? 'check_circle' : type === 'error' ? 'error' : 'info';
  }
}
