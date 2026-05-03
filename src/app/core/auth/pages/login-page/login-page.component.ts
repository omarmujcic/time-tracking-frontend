import { CommonModule } from '@angular/common';
import { Component, computed, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthStateFacade } from '../../../../shared/state/auth/auth-state.facade';

type AuthMode = 'login' | 'register';

@Component({
  selector: 'app-login-page',
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './login-page.component.html',
  styleUrl: './login-page.component.scss'
})
export class LoginPageComponent {
  protected readonly mode = signal<AuthMode>('login');
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly title = computed(() => (this.mode() === 'login' ? 'Sign in' : 'Create user'));
  protected readonly submitLabel = computed(() => (this.mode() === 'login' ? 'Login' : 'Create user'));

  protected readonly form = new FormGroup({
    username: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    displayName: new FormControl('', { nonNullable: true }),
    password: new FormControl('', { nonNullable: true, validators: [Validators.required] })
  });

  constructor(
    private readonly authState: AuthStateFacade,
    private readonly router: Router
  ) {}

  protected switchMode(mode: AuthMode): void {
    this.mode.set(mode);
    this.error.set(null);
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
      return;
    }

    this.loading.set(true);
    this.error.set(null);

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

      await this.router.navigateByUrl('/home');
    } catch {
      this.error.set(this.mode() === 'login' ? 'Invalid username or password.' : 'Unable to create user.');
    } finally {
      this.loading.set(false);
    }
  }
}
