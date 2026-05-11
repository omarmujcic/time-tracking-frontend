import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { AuthStateFacade } from '../../shared/state/auth/auth-state.facade';

export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const authState = inject(AuthStateFacade);
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
      if (error instanceof HttpErrorResponse && error.status === 401 && isSessionCheck(request.url)) {
        authState.clearSession();
      }

      return throwError(() => error);
    })
  );
};

function isSessionCheck(url: string): boolean {
  return url.includes('/api/auth/me');
}
