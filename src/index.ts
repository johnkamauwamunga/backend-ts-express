import express, { type Request, type Response } from "express";
import { errorHandler } from "./middleware/errorHandler";
import userRouter from "./modules/users/userRoute";
import {randomId} from './middleware/requestId';
import {requestLogger} from './middleware/requestLogger'
import redisServer from "./config/redis";

const app = express();
const PORT= 3001;
interface User{
id:number;
name:string;
email:string

}

app.use(express.json());

app.use(randomId)
app.use(requestLogger)


// routes
app.use('/api/users', userRouter);
app.get('/health',(req:Request,res:Response)=>{
   console.log("REQUEST ID:", req.requestId);
    res.json({message:"system healthy"})
})

app.use(errorHandler);

const startServer = async()=>{
 await redisServer.connect();
    
  console.log("===================================REDIS==============================================")
    
const user1={
    id:123,
    name:"john",
    email:"johnkamau@gmail.com",
}

// const event ={
//   id:123,
//   name:"Dubai meetup",
//   venue:"Dubai",
// }

await redisServer.set("user:123", JSON.stringify(user1),{
    EX:50
});



// await redisServer.del("user:123");

const user = await redisServer.get("user:123");

if(!user){
    console.log("user does not exist")
}

const ttl = await redisServer.ttl("user:123");

if(ttl){
    console.log("no expire set")
}

console.log("time to expire ",ttl);

// const parsedUser= JSON.parse(user)

console.log("redis user: ",user);

   console.log("===================================REDIS==============================================")
    

app.listen(PORT,()=>{
    console.log(`port running ${PORT}`);
})
};

startServer()


