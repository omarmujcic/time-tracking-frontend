import { TestBed } from '@angular/core/testing';
import { App } from './app';
import { Api } from './api';
import { of } from 'rxjs';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        {
          provide: Api,
          useValue: {
            getStatus: () => of({ backend: 'UP', database: 'time_tracking' })
          }
        }
      ]
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should render application status', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('h1')?.textContent).toContain('Time Tracking App');
    expect(compiled.textContent).toContain('time_tracking');
  });
});
