import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';

export interface ApiStatus {
  backend: string;
  database: string;
}

@Injectable({ providedIn: 'root' })
export class Api {
  constructor(private readonly http: HttpClient) {}

  getStatus() {
    return this.http.get<ApiStatus>('/api/status');
  }
}
