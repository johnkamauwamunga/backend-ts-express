import express, {Request, Response, NextFunction} from 'express';
import logger from '../utils/logger';


export const requestLogger = (req:Request, res:Response,next:NextFunction)=>{

    const startTime = Date.now();

    res.on("finish",()=>{
        const finishTime= Date.now();

        const duration= finishTime- startTime;

        logger.info({
            requestId: req.requestId,
            method:req.method,
            status:req.statusCode,
            path:req.path,
            duration
        }, "HTTP request")
    })

    next()
}