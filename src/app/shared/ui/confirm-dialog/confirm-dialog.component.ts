import { Component, HostListener } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { ConfirmationDialogService } from './confirm-dialog.service';

@Component({
  selector: 'app-confirm-dialog',
  imports: [MatIconModule],
  templateUrl: './confirm-dialog.component.html',
  styleUrl: './confirm-dialog.component.scss'
})
export class ConfirmDialogComponent {
  protected readonly request;

  constructor(private readonly confirmationDialog: ConfirmationDialogService) {
    this.request = this.confirmationDialog.request;
  }

  @HostListener('document:keydown.escape')
  protected cancel(): void {
    this.confirmationDialog.cancelActive();
  }

  protected confirm(): void {
    this.confirmationDialog.confirmActive();
  }
}
