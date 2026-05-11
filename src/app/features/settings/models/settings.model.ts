import { AuthResponse } from '../../../core/auth/models/auth.model';

export type WorkspaceType = 'PERSONAL' | 'ORGANIZATION';
export type OrganizationRole = 'OWNER' | 'ADMIN' | 'MEMBER';
export type ProjectStatus = 'ACTIVE' | 'INACTIVE';
export type TaskStatus = 'ACTIVE' | 'INACTIVE';
export type ThemeMode = 'SYSTEM' | 'LIGHT' | 'DARK';
export type DecimalSeparator = 'DOT' | 'COMMA';

export interface AccountProfile {
  id: string;
  username: string;
  displayName: string;
  email: string | null;
  phone: string | null;
}

export interface UpdateAccountProfileRequest {
  username: string;
  displayName: string;
  email: string | null;
  phone: string | null;
}

export interface UpdateAccountProfileResponse {
  profile: AccountProfile;
  session: AuthResponse;
}

export interface UpdatePasswordRequest {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

export interface UserPreference {
  language: string;
  themeMode: ThemeMode;
  groupedEntriesEnabled: boolean;
  dateFormat: string;
  decimalSeparator: DecimalSeparator;
  timezone: string;
}

export interface ProjectTask {
  id: string;
  projectId: string;
  name: string;
  status: TaskStatus;
}

export interface Project {
  id: string;
  name: string;
  status: ProjectStatus;
  hourlyRate: number;
  currency: 'EUR';
  tasks: ProjectTask[];
}

export interface UpsertProjectRequest {
  name: string;
  status: ProjectStatus;
  hourlyRate: number;
}

export interface UpsertTaskRequest {
  name: string;
  status: TaskStatus;
}

export interface Workspace {
  type: WorkspaceType;
  organizationId: string | null;
  name: string;
  joinCode: string | null;
  role: OrganizationRole | null;
  active: boolean;
}

export interface SetActiveWorkspaceRequest {
  type: WorkspaceType;
  organizationId?: string | null;
}

export interface Organization {
  id: string;
  name: string;
  joinCode: string;
  role: OrganizationRole;
}

export interface OrganizationMember {
  userId: string;
  username: string;
  displayName: string;
  role: OrganizationRole;
  joinedAt: string;
}

export interface OrganizationRequest {
  name: string;
}

export interface JoinOrganizationRequest {
  joinCode: string;
}

export interface PasswordForm {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

export interface ProjectForm {
  id: string | null;
  name: string;
  status: ProjectStatus;
  hourlyRate: number | null;
}

export interface TaskForm {
  projectId: string;
  id: string | null;
  name: string;
  status: TaskStatus;
}
