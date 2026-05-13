import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  Invoice,
  InvoiceGenerateRequest,
  InvoiceHistoryItem,
  InvoiceSetup,
  InvoiceUserSettingsRequest,
  InvoiceWorkspaceSettingsRequest,
  InvoiceWorkPreview
} from '../models/invoice.model';

@Injectable({ providedIn: 'root' })
export class InvoiceService {
  private readonly baseUrl = '/api/invoices';

  constructor(private readonly http: HttpClient) {}

  setup(): Promise<InvoiceSetup> {
    return firstValueFrom(this.http.get<InvoiceSetup>(`${this.baseUrl}/setup`));
  }

  saveSetup(request: InvoiceUserSettingsRequest & InvoiceWorkspaceSettingsRequest): Promise<InvoiceSetup> {
    return firstValueFrom(this.http.put<InvoiceSetup>(`${this.baseUrl}/setup`, request));
  }

  saveUserSettings(request: InvoiceUserSettingsRequest): Promise<InvoiceSetup> {
    return firstValueFrom(this.http.put<InvoiceSetup>(`${this.baseUrl}/setup/user`, request));
  }

  saveWorkspaceSettings(request: InvoiceWorkspaceSettingsRequest): Promise<InvoiceSetup> {
    return firstValueFrom(this.http.put<InvoiceSetup>(`${this.baseUrl}/setup/workspace`, request));
  }

  workPreview(startDate: string, endDate: string, timezone: string, projectKeys: string[] = []): Promise<InvoiceWorkPreview> {
    let params = new HttpParams()
      .set('startDate', startDate)
      .set('endDate', endDate)
      .set('timezone', timezone);
    projectKeys.forEach((projectKey) => {
      params = params.append('projectKeys', projectKey);
    });
    return firstValueFrom(this.http.get<InvoiceWorkPreview>(`${this.baseUrl}/work-preview`, { params }));
  }

  generate(request: InvoiceGenerateRequest): Promise<Invoice> {
    return firstValueFrom(this.http.post<Invoice>(`${this.baseUrl}/generate`, request));
  }

  invoice(id: string): Promise<Invoice> {
    return firstValueFrom(this.http.get<Invoice>(`${this.baseUrl}/${id}`));
  }

  history(): Promise<InvoiceHistoryItem[]> {
    return firstValueFrom(this.http.get<InvoiceHistoryItem[]>(`${this.baseUrl}/history`));
  }
}
