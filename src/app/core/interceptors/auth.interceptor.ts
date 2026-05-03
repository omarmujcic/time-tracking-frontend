import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AuthStateFacade } from '../../shared/state/auth/auth-state.facade';

export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const authState = inject(AuthStateFacade);
  const router = inject(Router);
  const token = authState.token();

  const authRequest = token
    ? request.clone({
        setHeaders: {
          Authorization: `Bearer ${token}`
        }
      })
    : request;

  return next(authRequest).pipe(
    catchError((error: unknown) => {
      if (error instanceof HttpErrorResponse && error.status === 401) {
        authState.clearSession();
        router.navigateByUrl('/login');
      }

      return throwError(() => error);
    })
  );
};
