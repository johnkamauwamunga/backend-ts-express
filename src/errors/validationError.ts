// errors/ValidationError.ts
import { AppError } from './appErrors';

export class ValidationError extends AppError {
  public readonly details?: Record<string, any>;

  constructor(message: string, details?: Record<string, any>) {
    super(message, 400);
    this.details = details;
    this.name = 'ValidationError';
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

// errors/AuthenticationError.ts
export class AuthenticationError extends AppError {
  constructor(message = 'Unauthorized') {
    super(message, 401);
    this.name = 'AuthenticationError';
    Object.setPrototypeOf(this, AuthenticationError.prototype);
  }
}

// errors/AuthorizationError.ts
export class AuthorizationError extends AppError {
  constructor(message = 'Forbidden') {
    super(message, 403);
    this.name = 'AuthorizationError';
    Object.setPrototypeOf(this, AuthorizationError.prototype);
  }
}

// errors/NotFoundError.ts
export class NotFoundError extends AppError {
  constructor(resource: string, identifier?: string | number) {
    const msg = identifier 
      ? `${resource} with id ${identifier} not found` 
      : `${resource} not found`;
    super(msg, 404);
    this.name = 'NotFoundError';
    Object.setPrototypeOf(this, NotFoundError.prototype);
  }
}

// errors/ConflictError.ts
export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 409);
    this.name = 'ConflictError';
    Object.setPrototypeOf(this, ConflictError.prototype);
  }
}

// errors/ExternalServiceError.ts
export class ExternalServiceError extends AppError {
  public readonly service: string;
  public readonly retryable: boolean;

  constructor(service: string, message: string, retryable = false, statusCode = 502) {
    super(`External service '${service}' error: ${message}`, statusCode, true, 'EXTERNAL_ERROR');
    this.service = service;
    this.retryable = retryable;
    this.name = 'ExternalServiceError';
    Object.setPrototypeOf(this, ExternalServiceError.prototype);
  }
}

// You can also add a generic BusinessError if needed.