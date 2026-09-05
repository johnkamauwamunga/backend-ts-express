 export class AppError extends Error {

    public  readonly statuscode:number;
    public readonly isOperations: boolean;
    public readonly errorCode?: string; 

    constructor(message:string, statuscode:number, isOperations = true, errorCode?: string) {
         super(message);
         this.statuscode = statuscode;
         this.isOperations = isOperations;
         this.errorCode = errorCode;
        

    }
 }