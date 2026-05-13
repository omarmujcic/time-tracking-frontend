import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { LoginPageComponent } from './core/auth/pages/login-page/login-page.component';
import { AppShellComponent } from './core/layout/app-shell/app-shell.component';
import { PlaceholderPageComponent } from './features/placeholder/pages/placeholder-page/placeholder-page.component';

export const routes: Routes = [
  {
    path: 'login',
    component: LoginPageComponent
  },
  {
    path: '',
    canActivate: [authGuard],
    component: AppShellComponent,
    children: [
      {
        path: 'dashboard',
        loadComponent: () =>
          import('./features/dashboard/pages/dashboard-page/dashboard-page.component').then((m) => m.DashboardPageComponent)
      },
      {
        path: 'reports',
        loadComponent: () =>
          import('./features/reports/pages/reports-page/reports-page.component').then((m) => m.ReportsPageComponent)
      },
      {
        path: 'import',
        component: PlaceholderPageComponent,
        data: { titleKey: 'app.nav.import', icon: 'upload_file' }
      },
      {
        path: 'invoice',
        loadComponent: () =>
          import('./features/invoice/pages/invoice-page/invoice-page.component').then((m) => m.InvoicePageComponent)
      },
      {
        path: 'calendar',
        component: PlaceholderPageComponent,
        data: { titleKey: 'app.nav.calendar', icon: 'calendar_month' }
      },
      {
        path: 'settings',
        loadComponent: () =>
          import('./features/settings/pages/settings-page/settings-page.component').then((m) => m.SettingsPageComponent)
      },
      {
        path: '',
        pathMatch: 'full',
        redirectTo: 'dashboard'
      }
    ]
  },
  {
    path: '**',
    redirectTo: 'dashboard'
  }
];
