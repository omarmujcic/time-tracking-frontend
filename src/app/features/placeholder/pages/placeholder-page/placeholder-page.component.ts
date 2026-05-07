import { Component, computed, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { TranslatePipe } from '@ngx-translate/core';

@Component({
  selector: 'app-placeholder-page',
  imports: [MatIconModule, TranslatePipe],
  templateUrl: './placeholder-page.component.html',
  styleUrl: './placeholder-page.component.scss'
})
export class PlaceholderPageComponent {
  private readonly route = inject(ActivatedRoute);

  protected readonly translationPath = 'features.placeholder.';
  protected readonly titleKey = computed(() => this.route.snapshot.data['titleKey'] ?? `${this.translationPath}title`);
  protected readonly icon = computed(() => this.route.snapshot.data['icon'] ?? 'hourglass_empty');
}
