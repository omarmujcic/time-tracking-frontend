import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { TranslatePipe } from '@ngx-translate/core';
import { AuthStateFacade } from '../../../shared/state/auth/auth-state.facade';
import { NavItem } from '../models/nav-item.model';

@Component({
  selector: 'app-shell',
  imports: [MatIconModule, RouterLink, RouterLinkActive, RouterOutlet, TranslatePipe],
  templateUrl: './app-shell.component.html',
  styleUrl: './app-shell.component.scss'
})
export class AppShellComponent {
  protected readonly translationPath = 'app.';
  protected readonly user;

  protected readonly navItems: NavItem[] = [
    { labelKey: 'app.nav.dashboard', icon: 'dashboard', path: '/dashboard' },
    { labelKey: 'app.nav.reports', icon: 'monitoring', path: '/reports' },
    { labelKey: 'app.nav.import', icon: 'upload_file', path: '/import' },
    { labelKey: 'app.nav.invoice', icon: 'receipt_long', path: '/invoice' },
    { labelKey: 'app.nav.calendar', icon: 'calendar_month', path: '/calendar' },
    { labelKey: 'app.nav.settings', icon: 'settings', path: '/settings' },
    { labelKey: 'app.nav.manage', icon: 'admin_panel_settings', path: '/manage', disabled: true }
  ];

  constructor(private readonly authState: AuthStateFacade) {
    this.user = this.authState.user;
  }

  protected logout(): void {
    this.authState.logout();
  }
}
