import { Component, computed, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { AuthStateFacade } from '../../../../shared/state/auth/auth-state.facade';
import { NotificationToastService } from '../../../../shared/ui/notification-toast/notification-toast.service';
import { httpErrorMessage } from '../../../../shared/utils/http-error-message';

type AuthMode = 'login' | 'register';

@Component({
  selector: 'app-login-page',
  imports: [ReactiveFormsModule, TranslatePipe],
  templateUrl: './login-page.component.html',
  styleUrl: './login-page.component.scss'
})
export class LoginPageComponent {
  protected readonly translationPath = 'features.auth.';
  protected readonly mode = signal<AuthMode>('login');
  protected readonly loading = signal(false);
  protected readonly titleKey = computed(() => `${this.translationPath}title.${this.mode()}`);
  protected readonly submitLabelKey = computed(() => `${this.translationPath}mode.${this.mode()}`);

  protected readonly form = new FormGroup({
    username: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    displayName: new FormControl('', { nonNullable: true }),
    password: new FormControl('', { nonNullable: true, validators: [Validators.required] })
  });

  constructor(
    private readonly authState: AuthStateFacade,
    private readonly router: Router,
    private readonly notifications: NotificationToastService,
    private readonly translateService: TranslateService
  ) {}

  protected switchMode(mode: AuthMode): void {
    this.mode.set(mode);
    this.form.reset();

    const displayName = this.form.controls.displayName;
    if (mode === 'register') {
      displayName.addValidators(Validators.required);
    } else {
      displayName.clearValidators();
    }
    displayName.updateValueAndValidity();
  }

  protected async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.notifications.error(this.requiredFieldsMessage(), 'Missing information');
      return;
    }

    this.loading.set(true);

    try {
      const value = this.form.getRawValue();
      if (this.mode() === 'login') {
        await this.authState.login({
          username: value.username,
          password: value.password
        });
      } else {
        await this.authState.register({
          username: value.username,
          displayName: value.displayName,
          password: value.password
        });
      }

      await this.router.navigateByUrl('/dashboard');
    } catch (error) {
      this.notifications.error(
        httpErrorMessage(error, this.translateService.instant(`${this.translationPath}error.${this.mode()}`)),
        this.mode() === 'login' ? 'Sign in failed' : 'Registration failed'
      );
    } finally {
      this.loading.set(false);
    }
  }

  private requiredFieldsMessage(): string {
    const missingFields = [
      this.form.controls.username.invalid ? 'username' : null,
      this.mode() === 'register' && this.form.controls.displayName.invalid ? 'display name' : null,
      this.form.controls.password.invalid ? 'password' : null
    ].filter(Boolean);
    return `Enter ${missingFields.join(', ')} to continue.`;
  }
}
