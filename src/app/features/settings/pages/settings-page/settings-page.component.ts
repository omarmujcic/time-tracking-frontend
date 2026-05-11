import { Component, computed, effect, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { AuthStateFacade } from '../../../../shared/state/auth/auth-state.facade';
import { WorkspaceStateFacade } from '../../../../shared/state/workspace/workspace-state.facade';
import { applyThemePreference } from '../../../../shared/utils/theme-preference';
import { formatUserNumber, formatUserRateInput, parseUserDecimal } from '../../../../shared/utils/user-formatting';
import { ReportMultiSelectComponent } from '../../../reports/components/report-multi-select/report-multi-select.component';
import { ReportMultiSelectOption } from '../../../reports/components/report-multi-select/report-multi-select.model';
import {
  AccountProfile,
  DecimalSeparator,
  OrganizationMember,
  OrganizationRole,
  PasswordForm,
  Project,
  ProjectForm,
  ProjectStatus,
  TaskForm,
  TaskStatus,
  ThemeMode,
  UserPreference,
  Workspace
} from '../../models/settings.model';
import { AccountSettingsService } from '../../services/account-settings.service';
import { PreferenceService } from '../../services/preference.service';
import { ProjectService } from '../../services/project.service';
import { WorkspaceService } from '../../services/workspace.service';

type SettingsTab = 'account' | 'app' | 'projects' | 'organization';

const defaultPreference: UserPreference = {
  language: 'en',
  themeMode: 'SYSTEM',
  groupedEntriesEnabled: true,
  dateFormat: 'YYYY-MM-DD',
  decimalSeparator: 'DOT',
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
};

@Component({
  selector: 'app-settings-page',
  imports: [FormsModule, MatIconModule, ReportMultiSelectComponent],
  templateUrl: './settings-page.component.html',
  styleUrl: './settings-page.component.scss'
})
export class SettingsPageComponent {
  protected readonly loading = signal(false);
  protected readonly message = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly search = signal('');
  protected readonly timeZones = [
    'UTC',
    'Europe/Sarajevo',
    'Europe/London',
    'Europe/Berlin',
    'Europe/Paris',
    'Europe/Vienna',
    'Europe/Zurich',
    'Europe/Amsterdam',
    'Europe/Rome',
    'Europe/Madrid',
    'America/New_York',
    'America/Chicago',
    'America/Denver',
    'America/Los_Angeles',
    'Asia/Dubai',
    'Asia/Tokyo',
    'Australia/Sydney'
  ];
  protected readonly languageOptions: ReportMultiSelectOption[] = [{ value: 'en', label: 'English' }];
  protected readonly themeOptions: ReportMultiSelectOption[] = [
    { value: 'SYSTEM', label: 'System' },
    { value: 'LIGHT', label: 'Light' },
    { value: 'DARK', label: 'Dark' }
  ];
  protected readonly dateFormatOptions: ReportMultiSelectOption[] = [
    { value: 'YYYY-MM-DD', label: 'YYYY-MM-DD' },
    { value: 'DD.MM.YYYY', label: 'DD.MM.YYYY' },
    { value: 'MM/DD/YYYY', label: 'MM/DD/YYYY' }
  ];
  protected readonly decimalSeparatorOptions: ReportMultiSelectOption[] = [
    { value: 'DOT', label: 'Dot' },
    { value: 'COMMA', label: 'Comma' }
  ];
  protected readonly statusOptions: ReportMultiSelectOption[] = [
    { value: 'ACTIVE', label: 'Active' },
    { value: 'INACTIVE', label: 'Inactive' }
  ];
  protected readonly timeZoneOptions: ReportMultiSelectOption[] = this.timeZones.map((timeZone) => ({
    value: timeZone,
    label: timeZone
  }));
  protected readonly projects;
  protected readonly workspaces;
  protected readonly activeWorkspace = computed(() => this.workspaces().find((workspace) => workspace.active) ?? null);
  protected readonly organizationWorkspaces = computed(() =>
    this.workspaces().filter((workspace) => workspace.type === 'ORGANIZATION')
  );
  protected readonly organizationMembers = signal<OrganizationMember[]>([]);
  protected readonly canManageOrganization = computed(() => {
    const role = this.activeWorkspace()?.role;
    return role === 'OWNER' || role === 'ADMIN';
  });
  protected readonly searchMatches = computed(() => this.matches(this.search()));

  protected profile: AccountProfile = {
    id: '',
    username: '',
    displayName: '',
    email: null,
    phone: null
  };
  protected preferences: UserPreference = { ...defaultPreference };
  protected passwordForm: PasswordForm = { currentPassword: '', newPassword: '', confirmPassword: '' };
  protected projectForm: ProjectForm = this.emptyProjectForm();
  protected taskForm: TaskForm | null = null;
  protected organizationName = '';
  protected joinCode = '';
  private currentWorkspaceKey = '';

  private readonly labels: Record<SettingsTab, string> = {
    account: 'Account',
    app: 'App',
    projects: 'Projects',
    organization: 'Organization'
  };

  constructor(
    private readonly accountService: AccountSettingsService,
    private readonly preferenceService: PreferenceService,
    private readonly projectService: ProjectService,
    private readonly workspaceService: WorkspaceService,
    private readonly workspaceState: WorkspaceStateFacade,
    private readonly authState: AuthStateFacade
  ) {
    this.projects = this.workspaceState.projects;
    this.workspaces = this.workspaceState.workspaces;
    this.loadSettings();
    effect(() => {
      const workspaceKey = this.workspaceState.activeWorkspaceKey();
      if (!workspaceKey || workspaceKey === this.currentWorkspaceKey) {
        return;
      }
      this.currentWorkspaceKey = workspaceKey;
      this.projectForm = this.emptyProjectForm();
      this.taskForm = null;
      this.organizationName = this.activeWorkspace()?.type === 'ORGANIZATION' ? this.activeWorkspace()?.name ?? '' : '';
      void this.loadOrganizationMembers();
    });
  }

  protected async loadSettings(): Promise<void> {
    await this.run(async () => {
      const [profile, preferences] = await Promise.all([
        this.accountService.profile(),
        this.preferenceService.get(),
        this.workspaceState.load()
      ]);
      this.profile = profile;
      this.preferences = preferences;
      this.applyTheme(preferences.themeMode);
      this.organizationName = this.activeWorkspace()?.type === 'ORGANIZATION' ? this.activeWorkspace()?.name ?? '' : '';
      await this.loadOrganizationMembers();
    }, null);
  }

  protected matchesSection(section: SettingsTab): boolean {
    return !this.search().trim() || this.searchMatches().includes(section);
  }

  protected async saveProfile(): Promise<void> {
    await this.run(async () => {
      const response = await this.accountService.updateProfile({
        username: this.profile.username,
        displayName: this.profile.displayName,
        email: this.profile.email || null,
        phone: this.profile.phone || null
      });
      this.profile = response.profile;
      this.authState.updateSession(response.session);
    }, 'Account settings saved.');
  }

  protected async savePassword(): Promise<void> {
    await this.run(async () => {
      await this.accountService.updatePassword(this.passwordForm);
      this.passwordForm = { currentPassword: '', newPassword: '', confirmPassword: '' };
    }, 'Password changed.');
  }

  protected async savePreferences(): Promise<void> {
    await this.run(async () => {
      this.preferences = await this.preferenceService.update(this.preferences);
      this.applyTheme(this.preferences.themeMode);
    }, 'App settings saved.');
  }

  protected editProject(project: Project): void {
    this.projectForm = {
      id: project.id,
      name: project.name,
      status: project.status,
      hourlyRate: Number(project.hourlyRate)
    };
  }

  protected async saveProject(): Promise<void> {
    if (!this.projectForm.name.trim() || !this.projectForm.hourlyRate) {
      this.error.set('Project name and hourly rate are required.');
      return;
    }
    await this.run(async () => {
      const request = {
        name: this.projectForm.name,
        status: this.projectForm.status,
        hourlyRate: this.projectForm.hourlyRate ?? 0
      };
      if (this.projectForm.id) {
        await this.projectService.update(this.projectForm.id, request);
      } else {
        await this.projectService.create(request);
      }
      this.projectForm = this.emptyProjectForm();
      await this.workspaceState.refreshProjects();
    }, 'Project saved.');
  }

  protected async deleteProject(project: Project): Promise<void> {
    if (!window.confirm(`Delete project ${project.name}? Used projects must be marked inactive instead.`)) {
      return;
    }
    await this.run(async () => {
      await this.projectService.delete(project.id);
      await this.workspaceState.refreshProjects();
    }, 'Project deleted.');
  }

  protected editTask(project: Project, taskId?: string): void {
    const task = taskId ? project.tasks.find((option) => option.id === taskId) : null;
    this.taskForm = {
      projectId: project.id,
      id: task?.id ?? null,
      name: task?.name ?? '',
      status: task?.status ?? 'ACTIVE'
    };
  }

  protected async saveTask(): Promise<void> {
    if (!this.taskForm || !this.taskForm.name.trim()) {
      this.error.set('Task name is required.');
      return;
    }
    await this.run(async () => {
      const request = { name: this.taskForm?.name ?? '', status: this.taskForm?.status ?? 'ACTIVE' };
      if (this.taskForm?.id) {
        await this.projectService.updateTask(this.taskForm.projectId, this.taskForm.id, request);
      } else if (this.taskForm) {
        await this.projectService.createTask(this.taskForm.projectId, request);
      }
      this.taskForm = null;
      await this.workspaceState.refreshProjects();
    }, 'Task saved.');
  }

  protected async deleteTask(project: Project, taskId: string): Promise<void> {
    if (!window.confirm('Delete this task? Used tasks must be marked inactive instead.')) {
      return;
    }
    await this.run(async () => {
      await this.projectService.deleteTask(project.id, taskId);
      await this.workspaceState.refreshProjects();
    }, 'Task deleted.');
  }

  protected async createOrganization(): Promise<void> {
    if (!this.organizationName.trim()) {
      this.error.set('Organization name is required.');
      return;
    }
    await this.run(async () => {
      const organization = await this.workspaceService.createOrganization({ name: this.organizationName });
      this.workspaceState.setCreatedOrganizationActive(organization);
      await this.workspaceState.load().catch(() => undefined);
      this.organizationName = organization.name;
      await this.loadOrganizationMembers();
    }, 'Organization created.');
  }

  protected async updateOrganization(): Promise<void> {
    const active = this.activeWorkspace();
    if (!active?.organizationId || !this.organizationName.trim()) {
      return;
    }
    await this.run(async () => {
      await this.workspaceService.updateOrganization(active.organizationId ?? '', { name: this.organizationName });
      await this.workspaceState.load();
      await this.loadOrganizationMembers();
    }, 'Organization saved.');
  }

  protected async joinOrganization(): Promise<void> {
    if (!this.joinCode.trim()) {
      this.error.set('Organization code is required.');
      return;
    }
    await this.run(async () => {
      const organization = await this.workspaceService.joinOrganization({ joinCode: this.joinCode });
      this.workspaceState.setCreatedOrganizationActive(organization);
      this.joinCode = '';
      await this.workspaceState.load().catch(() => undefined);
      this.organizationName = organization.name;
      await this.loadOrganizationMembers();
    }, 'Organization joined.');
  }

  protected async switchWorkspace(workspace: Workspace): Promise<void> {
    if (workspace.type === 'PERSONAL') {
      await this.run(() => this.workspaceState.setActive({ type: 'PERSONAL' }), null);
      return;
    }
    if (!workspace.organizationId) {
      return;
    }
    await this.run(
      () => this.workspaceState.setActive({ type: 'ORGANIZATION', organizationId: workspace.organizationId }),
      null
    );
  }

  protected async regenerateCode(): Promise<void> {
    const active = this.activeWorkspace();
    if (!active?.organizationId) {
      return;
    }
    await this.run(async () => {
      await this.workspaceService.regenerateCode(active.organizationId ?? '');
      await this.workspaceState.load();
      await this.loadOrganizationMembers();
    }, 'Organization code regenerated.');
  }

  protected label(tab: SettingsTab): string {
    return this.labels[tab];
  }

  protected roleLabel(role: OrganizationRole | null): string {
    return role ? role.toLowerCase() : 'personal';
  }

  protected memberName(member: OrganizationMember): string {
    return member.displayName || member.username;
  }

  protected rateInput(value: number | null): string {
    return formatUserRateInput(value, this.preferences);
  }

  protected updateProjectRate(value: string): void {
    this.projectForm.hourlyRate = parseUserDecimal(value, this.preferences.decimalSeparator);
  }

  protected rateLabel(value: number): string {
    return formatUserNumber(Number(value), this.preferences.decimalSeparator, 2);
  }

  protected selectedValue(value: string | null | undefined): string[] {
    return value ? [value] : [];
  }

  protected updateLanguage(values: string[]): void {
    this.preferences.language = values[0] ?? 'en';
  }

  protected updateTheme(values: string[]): void {
    this.preferences.themeMode = (values[0] ?? 'SYSTEM') as ThemeMode;
  }

  protected updateDateFormat(values: string[]): void {
    this.preferences.dateFormat = values[0] ?? defaultPreference.dateFormat;
  }

  protected updateDecimalSeparator(values: string[]): void {
    this.preferences.decimalSeparator = (values[0] ?? 'DOT') as DecimalSeparator;
  }

  protected updateTimezone(values: string[]): void {
    this.preferences.timezone = values[0] ?? defaultPreference.timezone;
  }

  protected updateProjectStatus(values: string[]): void {
    this.projectForm.status = (values[0] ?? 'ACTIVE') as ProjectStatus;
  }

  protected updateTaskStatus(form: TaskForm, values: string[]): void {
    form.status = (values[0] ?? 'ACTIVE') as TaskStatus;
  }

  private async run(action: () => Promise<void>, success: string | null): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    this.message.set(null);
    try {
      await action();
      this.message.set(success);
    } catch {
      this.error.set('Unable to save settings. Check required fields and permissions.');
    } finally {
      this.loading.set(false);
    }
  }

  private async loadOrganizationMembers(): Promise<void> {
    const active = this.activeWorkspace();
    if (active?.type !== 'ORGANIZATION' || !active.organizationId) {
      this.organizationMembers.set([]);
      return;
    }
    const members = await this.workspaceService.members(active.organizationId).catch(() => []);
    this.organizationMembers.set(members);
  }

  private emptyProjectForm(): ProjectForm {
    return { id: null, name: '', status: 'ACTIVE', hourlyRate: null };
  }

  private matches(query: string): SettingsTab[] {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return [];
    }
    return (Object.keys(this.labels) as SettingsTab[]).filter((tab) => {
      const haystack = `${this.labels[tab]} ${this.keywords(tab)}`.toLowerCase();
      return haystack.includes(normalized);
    });
  }

  private keywords(tab: SettingsTab): string {
    return {
      account: 'name username email phone password login profile',
      app: 'language theme dark light group date format decimal separator timezone',
      projects: 'project task hourly rate active inactive',
      organization: 'organization workspace code join create regenerate owner admin member'
    }[tab];
  }

  private applyTheme(themeMode: UserPreference['themeMode']): void {
    applyThemePreference(themeMode);
  }
}
