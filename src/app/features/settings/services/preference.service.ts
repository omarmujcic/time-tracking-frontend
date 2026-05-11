import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { UserPreference } from '../models/settings.model';

@Injectable({ providedIn: 'root' })
export class PreferenceService {
  constructor(private readonly http: HttpClient) {}

  get(): Promise<UserPreference> {
    return firstValueFrom(this.http.get<UserPreference>('/api/settings/preferences'));
  }

  update(request: UserPreference): Promise<UserPreference> {
    return firstValueFrom(this.http.put<UserPreference>('/api/settings/preferences', request));
  }
}
