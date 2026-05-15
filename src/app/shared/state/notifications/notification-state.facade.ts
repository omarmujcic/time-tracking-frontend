import { Injectable, signal } from '@angular/core';
import { NotificationService } from '../../../features/notifications/services/notification.service';

@Injectable({ providedIn: 'root' })
export class NotificationStateFacade {
  private readonly openCountState = signal(0);

  readonly openCount = this.openCountState.asReadonly();

  constructor(private readonly notificationService: NotificationService) {}

  async loadOpenCount(): Promise<void> {
    try {
      const response = await this.notificationService.openCount();
      this.openCountState.set(response.openCount);
    } catch {
      this.openCountState.set(0);
    }
  }
}
