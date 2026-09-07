import { PrismaClient } from "@prisma/client";
import { AuthenticationError, SystemError, ValidationError } from "../../errors/validationError";

const prisma = new PrismaClient();

interface User {
  email: string;
  password: string;
}

export class UserService {
  createUser = async (userData: User) => {

        // check if email exist
        const emailCheck= await prisma.user.findUnique({
            where:{email: userData.email}
        });

        if(emailCheck){
          throw new AuthenticationError("this email exists")
            return;
        };

      const newUser = await prisma.user.create({
        data: {
          email: userData.email,
          password: userData.password,
        },
      });

      return newUser;
    } 
}

