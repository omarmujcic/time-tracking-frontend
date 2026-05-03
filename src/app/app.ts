import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Api, ApiStatus } from './api';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {
  protected readonly title = signal('Time Tracking App');
  protected readonly status = signal<ApiStatus | null>(null);
  protected readonly error = signal<string | null>(null);

  constructor(private readonly api: Api) {
    this.api.getStatus().subscribe({
      next: (status) => {
        this.status.set(status);
        this.error.set(null);
      },
      error: () => {
        this.status.set(null);
        this.error.set('Backend or database connection is not available.');
      }
    });
  }
}
