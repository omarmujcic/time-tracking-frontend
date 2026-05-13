import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ReportFilterOptions, ReportFilters, TimeReport } from '../models/report.model';

@Injectable({ providedIn: 'root' })
export class ReportService {
  private readonly baseUrl = '/api/reports';

  constructor(private readonly http: HttpClient) {}

  timeReport(filters: ReportFilters): Promise<TimeReport> {
    return firstValueFrom(this.http.get<TimeReport>(`${this.baseUrl}/time`, { params: this.params(filters) }));
  }

  filterOptions(): Promise<ReportFilterOptions> {
    return firstValueFrom(this.http.get<ReportFilterOptions>(`${this.baseUrl}/filter-options`));
  }

  private params(filters: ReportFilters): HttpParams {
    let params = new HttpParams()
      .set('view', filters.view)
      .set('startDate', filters.startDate)
      .set('endDate', filters.endDate)
      .set('timezone', filters.timezone);

    filters.userIds.forEach((userId) => {
      params = params.append('userIds', userId);
    });
    filters.projectNames.forEach((projectName) => {
      params = params.append('projectNames', projectName);
    });
    filters.taskIds.forEach((taskId) => {
      params = params.append('taskIds', taskId);
    });
    if (filters.includeNoTask) {
      params = params.set('includeNoTask', 'true');
    }
    if (filters.minRate !== null) {
      params = params.set('minRate', String(filters.minRate));
    }
    if (filters.maxRate !== null) {
      params = params.set('maxRate', String(filters.maxRate));
    }
    return params;
  }
}
