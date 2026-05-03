import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiStatus } from '../models/status.model';

@Injectable({ providedIn: 'root' })
export class StatusService {
  constructor(private readonly http: HttpClient) {}

  getStatus(): Promise<ApiStatus> {
    return firstValueFrom(this.http.get<ApiStatus>('/api/status'));
  }
}
