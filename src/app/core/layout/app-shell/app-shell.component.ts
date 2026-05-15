import { Component, OnDestroy, Signal, computed, effect, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { TranslatePipe } from '@ngx-translate/core';
import { Subscription } from 'rxjs';
import { AuthStateFacade } from '../../../shared/state/auth/auth-state.facade';
import { WorkspaceStateFacade } from '../../../shared/state/workspace/workspace-state.facade';
import { applyThemePreference } from '../../../shared/utils/theme-preference';
import { ActiveTimerFacade } from '../../../shared/state/timer/active-timer.facade';
import { NotificationToastService } from '../../../shared/ui/notification-toast/notification-toast.service';
import { httpErrorMessage } from '../../../shared/utils/http-error-message';
import { PreferenceService } from '../../../features/settings/services/preference.service';
import { TimeEntry } from '../../../features/dashboard/models/time-entry.model';
import { NavItem } from '../models/nav-item.model';
import { NotificationStateFacade } from '../../../shared/state/notifications/notification-state.facade';

@Component({
  selector: 'app-shell',
  imports: [FormsModule, MatIconModule, RouterLink, RouterLinkActive, RouterOutlet, TranslatePipe],
  templateUrl: './app-shell.component.html',
  styleUrl: './app-shell.component.scss'
})
export class AppShellComponent implements OnDestroy {
  protected readonly translationPath = 'app.';
  protected readonly user;
  protected readonly workspaces;
  protected readonly accountMenuOpen = signal(false);
  protected readonly activeTimerEntry: Signal<TimeEntry | null>;
  protected readonly activeTimerDuration: Signal<string>;
  protected readonly activeTimerContext: Signal<string>;
  protected readonly notificationOpenCount: Signal<number>;
  protected readonly currentUrl = signal('');
  protected readonly stoppingSidebarTimer = signal(false);
  protected readonly showSidebarTimer = computed(() => {
    const path = this.currentUrl().split(/[?#]/)[0];
    return Boolean(this.activeTimerEntry() && !path.startsWith('/dashboard'));
  });
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
    { labelKey: 'app.nav.notifications', icon: 'notifications', path: '/notifications' },
    { labelKey: 'app.nav.invoice', icon: 'receipt_long', path: '/invoice' },
    { labelKey: 'app.nav.calendar', icon: 'calendar_month', path: '/calendar' },
    { labelKey: 'app.nav.settings', icon: 'settings', path: '/settings' },
    { labelKey: 'app.nav.manage', icon: 'admin_panel_settings', path: '/manage', disabled: true }
  ];

  constructor(
    private readonly authState: AuthStateFacade,
    private readonly workspaceState: WorkspaceStateFacade,
    private readonly preferenceService: PreferenceService,
    private readonly activeTimer: ActiveTimerFacade,
    private readonly notificationState: NotificationStateFacade,
    private readonly notifications: NotificationToastService,
    private readonly router: Router
  ) {
    this.user = this.authState.user;
    this.workspaces = this.workspaceState.workspaces;
    this.activeTimerEntry = this.activeTimer.activeEntry;
    this.activeTimerDuration = this.activeTimer.durationLabel;
    this.activeTimerContext = this.activeTimer.contextLabel;
    this.notificationOpenCount = this.notificationState.openCount;
    this.workspaceState.load();
    this.applyPreferences();
    void this.notificationState.loadOpenCount();
    this.currentUrl.set(this.router.url);
    this.routeSubscription = this.router.events.subscribe((event) => {
      if (event instanceof NavigationEnd) {
        this.currentUrl.set(event.urlAfterRedirects);
      }
    });
    void this.activeTimer.loadActive();
    effect(() => {
      if (this.workspaceState.activeWorkspaceKey()) {
        void this.activeTimer.loadActive();
        void this.notificationState.loadOpenCount();
      }
    });
  }

  private routeSubscription?: Subscription;

  ngOnDestroy(): void {
    this.routeSubscription?.unsubscribe();
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

  protected async stopSidebarTimer(): Promise<void> {
    if (!this.activeTimerEntry() || this.stoppingSidebarTimer()) {
      return;
    }
    this.stoppingSidebarTimer.set(true);
    try {
      await this.activeTimer.stopActive();
      this.notifications.success('Timer stopped.');
    } catch (error) {
      this.notifications.error(httpErrorMessage(error, 'Unable to stop timer.'), 'Timer not stopped');
    } finally {
      this.stoppingSidebarTimer.set(false);
    }
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
    this.activeTimer.clear();
    this.authState.logout();
  }
}
