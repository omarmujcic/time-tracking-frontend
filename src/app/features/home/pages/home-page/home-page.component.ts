import { Component, signal } from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { AuthStateFacade } from '../../../../shared/state/auth/auth-state.facade';
import { NotificationToastService } from '../../../../shared/ui/notification-toast/notification-toast.service';
import { httpErrorMessage } from '../../../../shared/utils/http-error-message';
import { ApiStatus } from '../../models/status.model';
import { StatusService } from '../../services/status.service';

@Component({
  selector: 'app-home-page',
  imports: [TranslatePipe],
  templateUrl: './home-page.component.html',
  styleUrl: './home-page.component.scss'
})
export class HomePageComponent {
  protected readonly translationPath = 'features.home.';
  protected readonly status = signal<ApiStatus | null>(null);
  protected readonly checkingStatus = signal(true);
  protected readonly user;

  constructor(
    private readonly authState: AuthStateFacade,
    private readonly statusService: StatusService,
    private readonly notifications: NotificationToastService,
    private readonly translateService: TranslateService
  ) {
    this.user = this.authState.user;
    this.loadStatus();
  }

  protected logout(): void {
    this.authState.logout();
  }

  private async loadStatus(): Promise<void> {
    this.checkingStatus.set(true);
    try {
      this.status.set(await this.statusService.getStatus());
    } catch (error) {
      this.notifications.error(
        httpErrorMessage(error, this.translateService.instant(`${this.translationPath}error.status`)),
        'Could not load status'
      );
    } finally {
      this.checkingStatus.set(false);
    }
  }
}
