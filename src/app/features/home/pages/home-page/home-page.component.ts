import { Component, signal } from '@angular/core';
import { AuthStateFacade } from '../../../../shared/state/auth/auth-state.facade';
import { ApiStatus } from '../../models/status.model';
import { StatusService } from '../../services/status.service';

@Component({
  selector: 'app-home-page',
  templateUrl: './home-page.component.html',
  styleUrl: './home-page.component.scss'
})
export class HomePageComponent {
  protected readonly status = signal<ApiStatus | null>(null);
  protected readonly statusError = signal<string | null>(null);
  protected readonly user;

  constructor(
    private readonly authState: AuthStateFacade,
    private readonly statusService: StatusService
  ) {
    this.user = this.authState.user;
    this.loadStatus();
  }

  protected logout(): void {
    this.authState.logout();
  }

  private async loadStatus(): Promise<void> {
    try {
      this.status.set(await this.statusService.getStatus());
    } catch {
      this.statusError.set('Unable to load backend status.');
    }
  }
}
