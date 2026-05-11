import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  JoinOrganizationRequest,
  Organization,
  OrganizationMember,
  OrganizationRequest,
  SetActiveWorkspaceRequest,
  Workspace
} from '../models/settings.model';

@Injectable({ providedIn: 'root' })
export class WorkspaceService {
  constructor(private readonly http: HttpClient) {}

  list(): Promise<Workspace[]> {
    return firstValueFrom(this.http.get<Workspace[]>('/api/workspaces'));
  }

  setActive(request: SetActiveWorkspaceRequest): Promise<Workspace[]> {
    return firstValueFrom(this.http.put<Workspace[]>('/api/workspaces/active', request));
  }

  createOrganization(request: OrganizationRequest): Promise<Organization> {
    return firstValueFrom(this.http.post<Organization>('/api/organizations', request));
  }

  joinOrganization(request: JoinOrganizationRequest): Promise<Organization> {
    return firstValueFrom(this.http.post<Organization>('/api/organizations/join', request));
  }

  updateOrganization(id: string, request: OrganizationRequest): Promise<Organization> {
    return firstValueFrom(this.http.put<Organization>(`/api/organizations/${id}`, request));
  }

  regenerateCode(id: string): Promise<Organization> {
    return firstValueFrom(this.http.post<Organization>(`/api/organizations/${id}/regenerate-code`, {}));
  }

  members(id: string): Promise<OrganizationMember[]> {
    return firstValueFrom(this.http.get<OrganizationMember[]>(`/api/organizations/${id}/members`));
  }
}
