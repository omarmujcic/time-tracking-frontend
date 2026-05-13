import { HttpErrorResponse } from '@angular/common/http';

export function httpErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof HttpErrorResponse) {
    const serverMessage = extractServerMessage(error.error);
    if (serverMessage) {
      return serverMessage;
    }
    if (error.status === 0) {
      return 'Unable to reach the server. Check your connection and try again.';
    }
    if (error.status === 401) {
      return 'Your session expired. Sign in again to continue.';
    }
    if (error.status === 403) {
      return 'You do not have permission to perform this action.';
    }
    if (error.status === 409) {
      return 'This change conflicts with existing data. Review the values and try again.';
    }
    if (error.status === 400) {
      return 'Some required information is missing or invalid. Review the form and try again.';
    }
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}

function extractServerMessage(body: unknown): string | null {
  if (!body) {
    return null;
  }
  if (typeof body === 'string') {
    return body.trim() || null;
  }
  if (typeof body !== 'object') {
    return null;
  }
  const record = body as Record<string, unknown>;
  const genericError = stringField(record, 'error');
  return stringField(record, 'message')
    ?? stringField(record, 'detail')
    ?? userFacingError(genericError)
    ?? null;
}

function stringField(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === 'string' && value.trim() ? value : null;
}

function userFacingError(message: string | null): string | null {
  if (!message) {
    return null;
  }
  const genericMessages = ['bad request', 'unauthorized', 'forbidden', 'not found', 'internal server error'];
  return genericMessages.includes(message.toLowerCase()) ? null : message;
}
