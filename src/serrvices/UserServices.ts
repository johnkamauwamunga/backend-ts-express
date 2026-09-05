// services/UserService.ts
import { ValidationError, ConflictError, NotFoundError } from '../errors/validationError';

export class UserService {
  async register(email: string, password: string) {
    // 1. Validate input (you may do this earlier with a validator)
    if (!email || !email.includes('@')) {
      throw new ValidationError('Invalid email format', { email });
    }
    if (password.length < 8) {
      throw new ValidationError('Password must be at least 8 characters');
    }

    // 2. Check for conflict
    const existing = await UserModel.findOne({ email });
    if (existing) {
      throw new ConflictError('User with this email already exists');
    }

    // 3. Business logic (hashed password, create user)
    try {
      const user = await UserModel.create({ email, password: hash(password) });
      return user;
    } catch (dbError) {
      // Transform DB errors if needed (e.g., duplicate key)
      if (dbError.code === 11000) {
        throw new ConflictError('Duplicate email');
      }
      throw dbError; // let global handler catch it as a generic error
    }
  }

  async getUserById(id: string) {
    const user = await UserModel.findById(id);
    if (!user) {
      throw new NotFoundError('User', id);
    }
    return user;
  }
}