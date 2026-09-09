import { PrismaClient } from "@prisma/client";
import {
  AuthenticationError,
  SystemError,
  ValidationError,
} from "../../errors/validationError";
import logger from "../../utils/logger";
import redisServer from "../../config/redis";

const prisma = new PrismaClient();

interface User {
  email: string;
  password: string;
}

// 3. The shape for UPDATING a user (everything is optional)
interface UpdateUserDTO {
  id:number |string;
  email?: string;
  password?: string;
}

interface getById {
  id: number | string;
}

export class UserService {
  createUser = async (userData: User) => {
    // check if email exist
    const emailCheck = await prisma.user.findUnique({
      where: { email: userData.email },
    });

    if (emailCheck) {
      throw new AuthenticationError("this email exists");
      return;
    }

    const newUser = await prisma.user.create({
      data: {
        email: userData.email,
        password: userData.password,
      },
    });

    return newUser;
  };

  getAllUsers = async()=>{
    try{

      const key =`users:all`;

      // check if the cache has data
      const cachedUsers=await redisServer.get('key');

      if(cachedUsers){

        // logger.info({
        //         logger.info({ : id }, "Cache hit");
        // })
        return cachedUsers
      }

      // cache miss
      const users = await prisma.user.findMany();

      // update the cache
      await redisServer.set(key, JSON.stringify(users));
      return users

    }catch(error){
      throw new SystemError("Failed to generate new user")
    }
  }



  getUserById = async (id: any) => {
    const userId = parseInt(id, 10);

    // check wit cach if there
    const key = `user:${id}`;

    const cachedUser = await redisServer.get(key);

    if (cachedUser) {
      logger.info({ userId: id }, "Cache hit");

      return cachedUser;
    }

    // cache miss

    logger.info({ userId: id }, "Cache miss");

    const user = await prisma.user.findFirst({
      where: { id: userId },
    });

    if (!user) {
      logger.info({ userId: id }, "User not found");

      return;
    }

    await redisServer.set("key", JSON.stringify(user), { EX: 60 });

    return user;
  };

 
  updateUser = async (userData: UpdateUserDTO) => {
  // 1. Extract and convert ID
  const rawId = userData.id;
  if (rawId === undefined || rawId === null) {
    throw new SystemError("User ID is required");
  }

  // Convert to number (works for both string "42" and number 42)
  const id = typeof rawId === 'string' ? parseInt(rawId, 10) : rawId;

  // Validate that it's a valid integer
  if (isNaN(id) || !Number.isInteger(id)) {
    throw new SystemError("Invalid user ID format");
  }

  try {
    // 2. Update the user in the database
    const updatedUser = await prisma.user.update({
      where: { id }, // now id is a valid number
      data: {
        // Only include fields that are actually provided
        ...(userData.email !== undefined && { email: userData.email }),
        ...(userData.password !== undefined && { password: userData.password }),
      },
    });

    // 3. Invalidate cache (if you're using Redis)
    const cacheKey = `user:${id}`; // Use the same ID
    await redisServer.del(cacheKey);

    return updatedUser;
  } catch (error) {
    // You might want to log the actual error for debugging
    console.error(error);
    throw new SystemError("Failed to update user");
  }
};
}
