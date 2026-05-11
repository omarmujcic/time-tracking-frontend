import { computed, Injectable, signal } from '@angular/core';
import { ProjectService } from '../../../features/settings/services/project.service';
import { WorkspaceService } from '../../../features/settings/services/workspace.service';
import { Organization, Project, SetActiveWorkspaceRequest, Workspace } from '../../../features/settings/models/settings.model';

@Injectable({ providedIn: 'root' })
export class WorkspaceStateFacade {
  private readonly workspacesState = signal<Workspace[]>([]);
  private readonly projectsState = signal<Project[]>([]);

  readonly workspaces = this.workspacesState.asReadonly();
  readonly projects = this.projectsState.asReadonly();
  readonly activeWorkspace = computed(() => this.workspacesState().find((workspace) => workspace.active) ?? null);
  readonly activeWorkspaceKey = computed(() => {
    const active = this.activeWorkspace();
    if (!active) {
      return '';
    }
    return active.type === 'ORGANIZATION' ? `ORGANIZATION:${active.organizationId}` : 'PERSONAL';
  });

  constructor(
    private readonly workspaceService: WorkspaceService,
    private readonly projectService: ProjectService
  ) {}

  async load(): Promise<void> {
    const [workspaces, projects] = await Promise.all([
      this.workspaceService.list(),
      this.projectService.list()
    ]);
    this.workspacesState.set(workspaces);
    this.projectsState.set(projects);
  }

  async refreshProjects(): Promise<void> {
    this.projectsState.set(await this.projectService.list());
  }

  async setActive(request: SetActiveWorkspaceRequest): Promise<void> {
    this.workspacesState.set(await this.workspaceService.setActive(request));
    await this.refreshProjects();
  }

  setCreatedOrganizationActive(organization: Organization): void {
    const organizationWorkspace: Workspace = {
      type: 'ORGANIZATION',
      organizationId: organization.id,
      name: organization.name,
      joinCode: organization.joinCode,
      role: organization.role,
      active: true
    };
    const workspaces = this.workspacesState()
      .filter((workspace) => workspace.organizationId !== organization.id)
      .map((workspace) => ({ ...workspace, active: false }));
    this.workspacesState.set([...workspaces, organizationWorkspace]);
    this.projectsState.set([]);
  }
}
