import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  AccountProfile,
  UpdateAccountProfileRequest,
  UpdateAccountProfileResponse,
  UpdatePasswordRequest
} from '../models/settings.model';

@Injectable({ providedIn: 'root' })
export class AccountSettingsService {
  constructor(private readonly http: HttpClient) {}

  profile(): Promise<AccountProfile> {
    return firstValueFrom(this.http.get<AccountProfile>('/api/account/profile'));
  }

  updateProfile(request: UpdateAccountProfileRequest): Promise<UpdateAccountProfileResponse> {
    return firstValueFrom(this.http.put<UpdateAccountProfileResponse>('/api/account/profile', request));
  }

  updatePassword(request: UpdatePasswordRequest): Promise<void> {
    return firstValueFrom(this.http.put<void>('/api/account/password', request));
  }
}
