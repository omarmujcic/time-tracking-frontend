import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  AppNotification,
  CreateProjectBillingIssueRequest,
  NotificationCount,
  NotificationStatusFilter
} from '../models/notification.model';

@Injectable({ providedIn: 'root' })
export class NotificationService {
  private readonly baseUrl = '/api/notifications';

  constructor(private readonly http: HttpClient) {}

  list(status: NotificationStatusFilter = 'OPEN'): Promise<AppNotification[]> {
    const params = new HttpParams().set('status', status);
    return firstValueFrom(this.http.get<AppNotification[]>(this.baseUrl, { params }));
  }

  openCount(): Promise<NotificationCount> {
    return firstValueFrom(this.http.get<NotificationCount>(`${this.baseUrl}/open-count`));
  }

  createProjectBillingIssue(request: CreateProjectBillingIssueRequest): Promise<AppNotification> {
    return firstValueFrom(this.http.post<AppNotification>(`${this.baseUrl}/project-billing-issues`, request));
  }

  resolve(id: string): Promise<AppNotification> {
    return firstValueFrom(this.http.post<AppNotification>(`${this.baseUrl}/${id}/resolve`, {}));
  }

  reopen(id: string): Promise<AppNotification> {
    return firstValueFrom(this.http.post<AppNotification>(`${this.baseUrl}/${id}/reopen`, {}));
  }

  dismiss(id: string): Promise<void> {
    return firstValueFrom(this.http.post<void>(`${this.baseUrl}/${id}/dismiss`, {}));
  }
}
