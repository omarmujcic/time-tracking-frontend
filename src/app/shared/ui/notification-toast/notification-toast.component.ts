import { Component } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { NotificationToastService } from './notification-toast.service';

@Component({
  selector: 'app-notification-toast',
  imports: [MatIconModule],
  templateUrl: './notification-toast.component.html',
  styleUrl: './notification-toast.component.scss'
})
export class NotificationToastComponent {
  protected readonly toast;

  constructor(private readonly notifications: NotificationToastService) {
    this.toast = this.notifications.toast;
  }

  protected dismiss(): void {
    this.notifications.dismiss();
  }
}
