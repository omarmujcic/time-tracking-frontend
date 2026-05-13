import { Injectable, OnDestroy, computed, effect, signal } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { TimeEntry } from '../../../features/dashboard/models/time-entry.model';
import { TimeEntryService } from '../../../features/dashboard/services/time-entry.service';
import { formatDigitalDuration } from '../../utils/duration-formatting';

@Injectable({ providedIn: 'root' })
export class ActiveTimerFacade implements OnDestroy {
  private readonly activeEntryState = signal<TimeEntry | null>(null);
  private readonly currentTime = signal(new Date());
  private readonly timer = window.setInterval(() => this.currentTime.set(new Date()), 1000);

  readonly activeEntry = this.activeEntryState.asReadonly();
  readonly durationSeconds = computed(() => {
    const entry = this.activeEntryState();
    if (!entry) {
      return 0;
    }
    return this.liveDuration(entry);
  });
  readonly durationLabel = computed(() => formatDigitalDuration(this.durationSeconds()));
  readonly projectLabel = computed(() => this.activeEntryState()?.projectName ?? '');
  readonly taskLabel = computed(() => this.activeEntryState()?.taskName ?? '');
  readonly contextLabel = computed(() => {
    const projectName = this.projectLabel();
    const taskName = this.taskLabel();
    return taskName ? `${projectName} / ${taskName}` : projectName;
  });

  constructor(
    private readonly timeEntryService: TimeEntryService,
    private readonly title: Title
  ) {
    effect(() => {
      const entry = this.activeEntryState();
      this.title.setTitle(entry ? `${this.durationLabel()} · ${this.contextLabel()} | Time Tracking` : 'Time Tracking');
    });
  }

  ngOnDestroy(): void {
    window.clearInterval(this.timer);
  }

  async loadActive(): Promise<TimeEntry | null> {
    const entry = await this.timeEntryService.active().catch(() => null);
    this.activeEntryState.set(entry);
    return entry;
  }

  setActive(entry: TimeEntry | null): void {
    this.activeEntryState.set(entry);
  }

  updateActiveDetails(details: Partial<Pick<TimeEntry, 'projectId' | 'projectName' | 'taskId' | 'taskName' | 'hourlyRate'>>): void {
    this.activeEntryState.update((entry) => entry ? { ...entry, ...details } : entry);
  }

  async stopActive(): Promise<TimeEntry | null> {
    const entry = this.activeEntryState();
    if (!entry) {
      return null;
    }
    if (!entry.projectId || Number(entry.hourlyRate) <= 0) {
      throw new Error('Open the dashboard and add a project and hourly rate before stopping this timer.');
    }
    const updatedEntry = await this.timeEntryService.update(entry.id, {
      projectId: entry.projectId,
      taskId: entry.taskId,
      projectName: entry.projectName,
      hourlyRate: Number(entry.hourlyRate),
      startedAt: entry.startedAt,
      endedAt: null
    });
    const stoppedEntry = await this.timeEntryService.stop(updatedEntry.id);
    this.activeEntryState.set(null);
    return stoppedEntry;
  }

  clear(): void {
    this.activeEntryState.set(null);
  }

  private liveDuration(entry: TimeEntry): number {
    const startedAt = new Date(entry.startedAt).getTime();
    return Math.max(0, Math.floor((this.currentTime().getTime() - startedAt) / 1000));
  }
}
