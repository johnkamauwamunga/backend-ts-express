import {randomUUID} from 'crypto';
import express, {Request, Response, NextFunction} from 'express';

export const randomId =(req:Request, res:Response, next:NextFunction)=>{

   const id = randomUUID();

    req.requestId =id;
    
    next()
}