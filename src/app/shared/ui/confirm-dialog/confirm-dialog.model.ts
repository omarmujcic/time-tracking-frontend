export type ConfirmationDialogVariant = 'default' | 'danger';

export interface ConfirmationDialogOptions {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  icon?: string;
  variant?: ConfirmationDialogVariant;
}

export interface ConfirmationDialogRequest {
  title: string;
  message: string;
  confirmText: string;
  cancelText: string;
  icon: string;
  variant: ConfirmationDialogVariant;
  resolve: (confirmed: boolean) => void;
}
