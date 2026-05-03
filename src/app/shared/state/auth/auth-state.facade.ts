import { computed, Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthRequest, AuthResponse, AuthUser, RegisterRequest } from '../../../core/auth/models/auth.model';
import { AuthService } from '../../../core/auth/services/auth.service';

const tokenKey = 'timeTracking.token';
const userKey = 'timeTracking.user';

@Injectable({ providedIn: 'root' })
export class AuthStateFacade {
  private readonly tokenState = signal<string | null>(localStorage.getItem(tokenKey));
  private readonly userState = signal<AuthUser | null>(this.readStoredUser());

  readonly token = this.tokenState.asReadonly();
  readonly user = this.userState.asReadonly();
  readonly isAuthenticated = computed(() => !!this.tokenState() && !!this.userState());

  constructor(
    private readonly authService: AuthService,
    private readonly router: Router
  ) {}

  async login(request: AuthRequest): Promise<void> {
    this.setSession(await this.authService.login(request));
  }

  async register(request: RegisterRequest): Promise<void> {
    this.setSession(await this.authService.register(request));
  }

  async refreshUser(): Promise<void> {
    if (!this.tokenState()) {
      return;
    }

    this.userState.set(await this.authService.getAuthenticatedUser());
    localStorage.setItem(userKey, JSON.stringify(this.userState()));
  }

  logout(): void {
    this.tokenState.set(null);
    this.userState.set(null);
    localStorage.removeItem(tokenKey);
    localStorage.removeItem(userKey);
    this.router.navigateByUrl('/login');
  }

  clearSession(): void {
    this.tokenState.set(null);
    this.userState.set(null);
    localStorage.removeItem(tokenKey);
    localStorage.removeItem(userKey);
  }

  private setSession(response: AuthResponse): void {
    this.tokenState.set(response.token);
    this.userState.set(response.user);
    localStorage.setItem(tokenKey, response.token);
    localStorage.setItem(userKey, JSON.stringify(response.user));
  }

  private readStoredUser(): AuthUser | null {
    const storedUser = localStorage.getItem(userKey);
    if (!storedUser) {
      return null;
    }

    try {
      return JSON.parse(storedUser) as AuthUser;
    } catch {
      localStorage.removeItem(userKey);
      return null;
    }
  }
}
