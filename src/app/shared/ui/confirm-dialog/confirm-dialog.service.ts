import { Injectable, signal } from '@angular/core';
import { ConfirmationDialogOptions, ConfirmationDialogRequest } from './confirm-dialog.model';

@Injectable({ providedIn: 'root' })
export class ConfirmationDialogService {
  private readonly requestState = signal<ConfirmationDialogRequest | null>(null);

  readonly request = this.requestState.asReadonly();

  confirm(options: ConfirmationDialogOptions): Promise<boolean> {
    const activeRequest = this.requestState();
    if (activeRequest) {
      activeRequest.resolve(false);
    }

    return new Promise((resolve) => {
      this.requestState.set({
        title: options.title,
        message: options.message,
        confirmText: options.confirmText ?? 'Confirm',
        cancelText: options.cancelText ?? 'Cancel',
        icon: options.icon ?? 'help',
        variant: options.variant ?? 'default',
        resolve
      });
    });
  }

  confirmActive(): void {
    this.respond(true);
  }

  cancelActive(): void {
    this.respond(false);
  }

  private respond(confirmed: boolean): void {
    const request = this.requestState();
    if (!request) {
      return;
    }
    this.requestState.set(null);
    request.resolve(confirmed);
  }
}
