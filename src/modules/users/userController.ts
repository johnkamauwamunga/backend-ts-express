
import { Request, Response, NextFunction } from "express";
import { UserService } from "./userServices";
import { SystemError, ValidationError } from "../../errors/validationError";

const userService = new UserService()

export class UserController{

    createUser= async(req:Request, res:Response, next:NextFunction)=>{
        try{
            const userData =req.body;

            if(!userData.email || !userData.password){
                throw new ValidationError("Email or password field empty",{
                    email: !userData.email ? "Email Field required" : undefined,
                    password: !userData.password ? "Password field required" : undefined
                });
            }

            const response = await userService.createUser(userData);

            res.status(201).json({
                message:"user created successfully",
                data:response
            });

            //    res.status(201).json({
            //     message: "user created successfully",
            //     data: response
            // });


        }catch(error){
       next(error)
        }
    }

}