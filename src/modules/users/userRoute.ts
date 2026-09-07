import express from 'express';
import { UserController } from './userController';

const userRouter = express.Router();
const userController= new UserController();

userRouter.post('/create', (req, res, next)=> userController.createUser(req, res, next) )

export default userRouter;