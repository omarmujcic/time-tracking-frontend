import { Injectable, signal } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class FieldOverlayCoordinatorService {
  private readonly activeOverlayId = signal<symbol | null>(null);

  isOpen(id: symbol): boolean {
    return this.activeOverlayId() === id;
  }

  open(id: symbol): void {
    this.activeOverlayId.set(id);
  }

  close(id: symbol): void {
    if (this.isOpen(id)) {
      this.activeOverlayId.set(null);
    }
  }

  toggle(id: symbol): void {
    if (this.isOpen(id)) {
      this.close(id);
      return;
    }
    this.open(id);
  }
}
