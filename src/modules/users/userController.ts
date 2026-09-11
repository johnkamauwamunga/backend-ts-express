import { Request, Response, NextFunction } from "express";
import { UserService } from "./userServices";
import { SystemError, ValidationError } from "../../errors/validationError";

const userService = new UserService();

export class UserController {
  createUser = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userData = req.body;

      if (!userData.email || !userData.password) {
        throw new ValidationError("Email or password field empty", {
          email: !userData.email ? "Email Field required" : undefined,
          password: !userData.password ? "Password field required" : undefined,
        });
      }

      const response = await userService.createUser(userData);

      res.status(201).json({
        message: "user created successfully",
        data: response,
      });

      //    res.status(201).json({
      //     message: "user created successfully",
      //     data: response
      // });
    } catch (error) {
      next(error);
    }
  };
getUserById = async (req: Request, res: Response, next: NextFunction) => {
  // Extract and ensure it's a string
  const rawId = req.params.id;
  if (typeof rawId !== 'string') {
    // If it's an array, you can decide: take first element or reject
    // Here we reject to keep it simple
    return res.status(400).json({ error: 'Invalid user ID format' });
  }

  // Now rawId is a string; validate further based on your ID format
  // For numeric IDs:
  const userId = parseInt(rawId, 10);
  if (isNaN(userId)) {
    return res.status(400).json({ error: 'User ID must be a number' });
  }

  try {
    const response = await userService.getUserById(userId);
    res.status(200).json({
      message: 'User retrieved successfully',
      data: response,
    });
  } catch (error) {
    next(error);
  }
};

updateUser = async (req: Request, res: Response, next: NextFunction) => {

  const userData= req.body
}


}
