import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AuthRequest, AuthResponse, AuthUser, RegisterRequest } from '../models/auth.model';

@Injectable({ providedIn: 'root' })
export class AuthService {
  constructor(private readonly http: HttpClient) {}

  login(request: AuthRequest): Promise<AuthResponse> {
    return firstValueFrom(this.http.post<AuthResponse>('/api/auth/login', request));
  }

  register(request: RegisterRequest): Promise<AuthResponse> {
    return firstValueFrom(this.http.post<AuthResponse>('/api/auth/register', request));
  }

  getAuthenticatedUser(): Promise<AuthUser> {
    return firstValueFrom(this.http.get<AuthUser>('/api/auth/me'));
  }
}
