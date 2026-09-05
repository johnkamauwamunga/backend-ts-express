import { AppError } from "./appErrors";

export class ValidationError extends AppError{
  public readonly details?: Record<string, any>;

  constructor(message:string, details?: Record<string, any>){
    super(message, 400);
    this.details= details;
    this.name='ValidationError';
  }
    
}

export class AuthenticationError extends AppError{

constructor(message:string){
    super(message, 401);
    this.name='AuthenticationError';
}
}

export class SystemError extends AppError{

    constructor(message:string){
        super(message, 500, false);
        this.name='SystemError';
    }
}
