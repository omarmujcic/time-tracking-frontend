import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  CreateTimeEntryRequest,
  StartTimerRequest,
  TimeEntry,
  TimeEntryFilters,
  TimeEntrySummary,
  UpdateTimeEntryRequest
} from '../models/time-entry.model';

@Injectable({ providedIn: 'root' })
export class TimeEntryService {
  private readonly baseUrl = '/api/time-entries';

  constructor(private readonly http: HttpClient) {}

  list(filters: TimeEntryFilters): Promise<TimeEntry[]> {
    return firstValueFrom(this.http.get<TimeEntry[]>(this.baseUrl, { params: this.params(filters) }));
  }

  summary(filters: TimeEntryFilters): Promise<TimeEntrySummary> {
    return firstValueFrom(this.http.get<TimeEntrySummary>(`${this.baseUrl}/summary`, { params: this.params(filters) }));
  }

  active(): Promise<TimeEntry | null> {
    return firstValueFrom(this.http.get<TimeEntry | null>(`${this.baseUrl}/active`));
  }

  start(request: StartTimerRequest): Promise<TimeEntry> {
    return firstValueFrom(this.http.post<TimeEntry>(`${this.baseUrl}/start`, request));
  }

  stop(id: string): Promise<TimeEntry> {
    return firstValueFrom(this.http.post<TimeEntry>(`${this.baseUrl}/${id}/stop`, {}));
  }

  create(request: CreateTimeEntryRequest): Promise<TimeEntry> {
    return firstValueFrom(this.http.post<TimeEntry>(this.baseUrl, request));
  }

  update(id: string, request: UpdateTimeEntryRequest): Promise<TimeEntry> {
    return firstValueFrom(this.http.put<TimeEntry>(`${this.baseUrl}/${id}`, request));
  }

  delete(id: string): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`${this.baseUrl}/${id}`));
  }

  private params(filters: TimeEntryFilters): HttpParams {
    let params = new HttpParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (Array.isArray(value)) {
        value.forEach((item) => {
          if (item) {
            params = params.append(key, item);
          }
        });
      } else if (value) {
        params = params.set(key, value);
      }
    });
    return params;
  }
}
