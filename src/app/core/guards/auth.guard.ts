import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthStateFacade } from '../../shared/state/auth/auth-state.facade';

export const authGuard: CanActivateFn = () => {
  const authState = inject(AuthStateFacade);
  const router = inject(Router);

  return authState.isAuthenticated() ? true : router.parseUrl('/login');
};
