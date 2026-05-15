import { DatePipe } from '@angular/common';
import { Component, OnInit, effect, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { ConfirmationDialogService } from '../../../../shared/ui/confirm-dialog/confirm-dialog.service';
import { NotificationToastService } from '../../../../shared/ui/notification-toast/notification-toast.service';
import { httpErrorMessage } from '../../../../shared/utils/http-error-message';
import { NotificationStateFacade } from '../../../../shared/state/notifications/notification-state.facade';
import { WorkspaceStateFacade } from '../../../../shared/state/workspace/workspace-state.facade';
import { AppNotification, NotificationStatusFilter } from '../../models/notification.model';
import { NotificationService } from '../../services/notification.service';

@Component({
  selector: 'app-notifications-page',
  imports: [DatePipe, MatIconModule],
  templateUrl: './notifications-page.component.html',
  styleUrl: './notifications-page.component.scss'
})
export class NotificationsPageComponent implements OnInit {
  protected readonly loading = signal(false);
  protected readonly items = signal<AppNotification[]>([]);
  protected readonly statusFilter = signal<NotificationStatusFilter>('OPEN');
  protected readonly filterOptions: { value: NotificationStatusFilter; label: string }[] = [
    { value: 'OPEN', label: 'Open' },
    { value: 'RESOLVED', label: 'Resolved' },
    { value: 'ALL', label: 'All' }
  ];
  private currentWorkspaceKey = '';

  constructor(
    private readonly notificationService: NotificationService,
    private readonly notificationState: NotificationStateFacade,
    private readonly workspaceState: WorkspaceStateFacade,
    private readonly confirmationDialog: ConfirmationDialogService,
    private readonly toast: NotificationToastService
  ) {
    effect(() => {
      const workspaceKey = this.workspaceState.activeWorkspaceKey();
      if (!workspaceKey || workspaceKey === this.currentWorkspaceKey) {
        return;
      }
      this.currentWorkspaceKey = workspaceKey;
      void this.load();
    });
  }

  ngOnInit(): void {
    void this.load();
  }

  protected async setFilter(filter: NotificationStatusFilter): Promise<void> {
    this.statusFilter.set(filter);
    await this.load();
  }

  protected typeLabel(notification: AppNotification): string {
    if (notification.type === 'PROJECT_BILLING_ISSUE') {
      return 'Project billing issue';
    }
    return 'Notification';
  }

  protected creatorLabel(notification: AppNotification): string {
    return notification.createdByDisplayName || notification.createdByUsername;
  }

  protected resolverLabel(notification: AppNotification): string {
    return notification.resolvedByDisplayName || notification.resolvedByUsername || 'Unknown user';
  }

  protected async resolve(notification: AppNotification): Promise<void> {
    await this.run(async () => {
      await this.notificationService.resolve(notification.id);
      await this.afterAction();
    }, 'Notification resolved.');
  }

  protected async reopen(notification: AppNotification): Promise<void> {
    await this.run(async () => {
      await this.notificationService.reopen(notification.id);
      await this.afterAction();
    }, 'Notification reopened.');
  }

  protected async dismiss(notification: AppNotification): Promise<void> {
    if (notification.status === 'OPEN') {
      const confirmed = await this.confirmationDialog.confirm({
        title: 'Dismiss open notification',
        message: 'Dismiss this open notification? It will be hidden from your Notifications page, but it will stay open for other users who can see it.',
        confirmText: 'Dismiss',
        icon: 'visibility_off'
      });
      if (!confirmed) {
        return;
      }
    }
    await this.run(async () => {
      await this.notificationService.dismiss(notification.id);
      await this.afterAction();
    }, 'Notification dismissed.');
  }

  private async load(): Promise<void> {
    await this.run(async () => {
      this.items.set(await this.notificationService.list(this.statusFilter()));
      await this.notificationState.loadOpenCount();
    }, null);
  }

  private async afterAction(): Promise<void> {
    this.items.set(await this.notificationService.list(this.statusFilter()));
    await this.notificationState.loadOpenCount();
  }

  private async run(action: () => Promise<void>, success: string | null): Promise<void> {
    this.loading.set(true);
    try {
      await action();
      if (success) {
        this.toast.success(success);
      }
    } catch (error) {
      this.toast.error(httpErrorMessage(error, 'Unable to update notifications.'), 'Notifications not updated');
    } finally {
      this.loading.set(false);
    }
  }
}
