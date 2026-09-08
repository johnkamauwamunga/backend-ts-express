import {Request, Response, NextFunction} from 'express';
import logger from '../utils/logger';
import { AppError } from '../errors/appErrors';
import { ValidationError } from '../errors/validationError';


export const errorHandler = (
    error: unknown,
    req: Request,
    res: Response,
    next: NextFunction
): void => {

    if (error instanceof AppError) {

        logger.error({
            // requestId: req.requestId,
            method: req.method,
            path: req.path,
            status: error.statuscode,
            errorCode: error.errorCode,
            errorName: error.name,
            err: error,
        }, "Application error");

        res.status(error.statuscode).json({
            status: error.statuscode,
            errorCode: error.errorCode,
            isOperation: error.isOperations,
            message: error.message,

            ...(error instanceof ValidationError && {
                details: error.details
            }),
        });

        return;
    }

    logger.error({
        // requestId: req.requestId,
        method: req.method,
        path: req.path,
        err: error,
    }, "Unexpected server error");

    res.status(500).json({
        status: 500,
        errorCode: "INTERNAL_SERVER_ERROR",
        isOperation: false,
        message: "internal server error"
    });
};