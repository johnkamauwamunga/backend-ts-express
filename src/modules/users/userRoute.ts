import express from 'express';
import { UserController } from './userController';

const userRouter = express.Router();
const userController= new UserController();

userRouter.post('/create', (req, res, next)=> userController.createUser(req, res, next) );
userRouter.get('/:id',(req,res, next)=>userController.getUserById(req,res,next))

export default userRouter;