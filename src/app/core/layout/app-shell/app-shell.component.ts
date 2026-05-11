import { Component, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { TranslatePipe } from '@ngx-translate/core';
import { AuthStateFacade } from '../../../shared/state/auth/auth-state.facade';
import { WorkspaceStateFacade } from '../../../shared/state/workspace/workspace-state.facade';
import { applyThemePreference } from '../../../shared/utils/theme-preference';
import { PreferenceService } from '../../../features/settings/services/preference.service';
import { NavItem } from '../models/nav-item.model';

@Component({
  selector: 'app-shell',
  imports: [FormsModule, MatIconModule, RouterLink, RouterLinkActive, RouterOutlet, TranslatePipe],
  templateUrl: './app-shell.component.html',
  styleUrl: './app-shell.component.scss'
})
export class AppShellComponent {
  protected readonly translationPath = 'app.';
  protected readonly user;
  protected readonly workspaces;
  protected readonly accountMenuOpen = signal(false);
  protected readonly accountTypeLabel = computed(() => {
    const active = this.workspaces().find((workspace) => workspace.active);
    if (!active || active.type === 'PERSONAL') {
      return 'Personal';
    }
    return active.name;
  });

  protected readonly navItems: NavItem[] = [
    { labelKey: 'app.nav.dashboard', icon: 'dashboard', path: '/dashboard' },
    { labelKey: 'app.nav.reports', icon: 'monitoring', path: '/reports' },
    { labelKey: 'app.nav.import', icon: 'upload_file', path: '/import' },
    { labelKey: 'app.nav.invoice', icon: 'receipt_long', path: '/invoice' },
    { labelKey: 'app.nav.calendar', icon: 'calendar_month', path: '/calendar' },
    { labelKey: 'app.nav.settings', icon: 'settings', path: '/settings' },
    { labelKey: 'app.nav.manage', icon: 'admin_panel_settings', path: '/manage', disabled: true }
  ];

  constructor(
    private readonly authState: AuthStateFacade,
    private readonly workspaceState: WorkspaceStateFacade,
    private readonly preferenceService: PreferenceService
  ) {
    this.user = this.authState.user;
    this.workspaces = this.workspaceState.workspaces;
    this.workspaceState.load();
    this.applyPreferences();
  }

  protected workspaceValue(): string {
    const active = this.workspaces().find((workspace) => workspace.active);
    return active?.type === 'ORGANIZATION' ? `ORGANIZATION:${active.organizationId}` : 'PERSONAL';
  }

  protected async selectWorkspace(value: string): Promise<void> {
    this.accountMenuOpen.set(false);
    if (value === 'PERSONAL') {
      await this.workspaceState.setActive({ type: 'PERSONAL' });
    } else {
      await this.workspaceState.setActive({ type: 'ORGANIZATION', organizationId: value.split(':')[1] });
    }
  }

  protected toggleAccountMenu(): void {
    this.accountMenuOpen.update((open) => !open);
  }

  protected workspaceLabel(workspaceType: string, workspaceName: string): string {
    if (workspaceType === 'PERSONAL') {
      return 'Personal';
    }
    return workspaceName;
  }

  private async applyPreferences(): Promise<void> {
    try {
      const preferences = await this.preferenceService.get();
      applyThemePreference(preferences.themeMode);
    } catch {
      applyThemePreference('SYSTEM');
    }
  }

  protected logout(): void {
    this.authState.logout();
  }
}
