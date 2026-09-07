import express, { type Request, type Response } from "express";
import { errorHandler } from "./middleware/errorHandler";
import userRouter from "./modules/users/userRoute";

const app = express();
const PORT= 3001;

app.use(express.json());

// routes
app.use('/api/users', userRouter);
app.get('/health',(req:Request,res:Response)=>{

    res.json({message:"system healthy"})
})

app.use(errorHandler);

app.listen(PORT,()=>{
    console.log(`port running ${PORT}`);
})

