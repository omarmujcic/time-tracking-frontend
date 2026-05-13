import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ConfirmDialogComponent } from './shared/ui/confirm-dialog/confirm-dialog.component';
import { NotificationToastComponent } from './shared/ui/notification-toast/notification-toast.component';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ConfirmDialogComponent, NotificationToastComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {
}
