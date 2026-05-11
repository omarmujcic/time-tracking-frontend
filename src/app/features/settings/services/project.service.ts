import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Project, ProjectTask, UpsertProjectRequest, UpsertTaskRequest } from '../models/settings.model';

@Injectable({ providedIn: 'root' })
export class ProjectService {
  constructor(private readonly http: HttpClient) {}

  list(): Promise<Project[]> {
    return firstValueFrom(this.http.get<Project[]>('/api/projects'));
  }

  create(request: UpsertProjectRequest): Promise<Project> {
    return firstValueFrom(this.http.post<Project>('/api/projects', request));
  }

  update(id: string, request: UpsertProjectRequest): Promise<Project> {
    return firstValueFrom(this.http.put<Project>(`/api/projects/${id}`, request));
  }

  delete(id: string): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`/api/projects/${id}`));
  }

  createTask(projectId: string, request: UpsertTaskRequest): Promise<ProjectTask> {
    return firstValueFrom(this.http.post<ProjectTask>(`/api/projects/${projectId}/tasks`, request));
  }

  updateTask(projectId: string, taskId: string, request: UpsertTaskRequest): Promise<ProjectTask> {
    return firstValueFrom(this.http.put<ProjectTask>(`/api/projects/${projectId}/tasks/${taskId}`, request));
  }

  deleteTask(projectId: string, taskId: string): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`/api/projects/${projectId}/tasks/${taskId}`));
  }
}
