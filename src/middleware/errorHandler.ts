 import { type Request, type Response, type NextFunction} from 'express';
 import { AppError } from '../errors/appErrors';
 import { ValidationError } from '../errors/validationError';

 export const errorHandler =(
    error:unknown,
    req:Request,
    res:Response,
    next:NextFunction
 )=>{


    // check if errors are instance of app eror or error
    if(error instanceof AppError){
        res.status(error.statuscode).json({
            status: error.statuscode,
            errorCode:error.errorCode,
            isOperation: error.isOperations,
            message:error.message,

            ...(error instanceof ValidationError &&{
                details: error.details
            }),
        });

        return
    }

    // not an instance

    res.status(500).json({
          status: 500,
            errorCode:'INTERNAL_SERVER_ERROR',
            isOperation: false,
            message:"internal server error",
    })

 }