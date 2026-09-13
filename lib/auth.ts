import { Db, ObjectId } from 'mongodb';
import bcrypt from 'bcryptjs';
import { connectToDatabase } from './db';
import { User, UserInput, LoginInput } from '../models/User';
import { isValidBusinessEmail, isValidPassword } from './validation';

const USERS_COLLECTION = 'users';

function withoutPassword(user: User): Omit<User, 'password'> {
  return {
    _id: user._id,
    name: user.name,
    email: user.email,
    createdAt: user.createdAt,
  };
}

// Hash password
async function hashPassword(password: string): Promise<string> {
  const salt = await bcrypt.genSalt(10);
  return await bcrypt.hash(password, salt);
}

// Compare password
async function comparePassword(password: string, hashedPassword: string): Promise<boolean> {
  return await bcrypt.compare(password, hashedPassword);
}

// Register a new user
export async function registerUser(userInput: UserInput): Promise<{ user: Omit<User, 'password'>; error?: string }> {
  try {
    // Validar correo de empresa
    const emailValidation = isValidBusinessEmail(userInput.email);
    if (!emailValidation.valid) {
      return { 
        user: {} as Omit<User, 'password'>, 
        error: emailValidation.reason || 'Correo electronico invalido' 
      };
    }

    // Validar contraseña
    const passwordValidation = isValidPassword(userInput.password);
    if (!passwordValidation.valid) {
      return { 
        user: {} as Omit<User, 'password'>, 
        error: passwordValidation.reason || 'Contraseña invalida' 
      };
    }

    const db: Db = await connectToDatabase();
    const usersCollection = db.collection<User>(USERS_COLLECTION);

    // Check if user already exists
    const existingUser = await usersCollection.findOne({ email: userInput.email });
    if (existingUser) {
      return { 
        user: {} as Omit<User, 'password'>, 
        error: 'El correo electrónico ya está en uso' 
      };
    }

    // Hash password
    const hashedPassword = await hashPassword(userInput.password);

    // Create user
    const user: User = {
      name: userInput.name,
      email: userInput.email,
      password: hashedPassword,
      createdAt: new Date(),
    };

    const result = await usersCollection.insertOne(user);
    const createdUser = await usersCollection.findOne({ _id: result.insertedId });
    
    if (!createdUser) {
      return { 
        user: {} as Omit<User, 'password'>, 
        error: 'Error al crear el usuario' 
      };
    }

    return { user: withoutPassword(createdUser) };
  } catch (error) {
    console.error('Error registering user:', error);
    return { 
      user: {} as Omit<User, 'password'>, 
      error: 'Error al registrar el usuario' 
    };
  }
}

// Login user
export async function loginUser(loginInput: LoginInput): Promise<{ user: Omit<User, 'password'> | null; error?: string }> {
  try {
    const db: Db = await connectToDatabase();
    const usersCollection = db.collection<User>(USERS_COLLECTION);

    // Find user by email
    const user = await usersCollection.findOne({ email: loginInput.email });
    
    if (!user) {
      return { user: null, error: 'Correo electrónico o contraseña incorrectos' };
    }

    // Compare passwords
    const isPasswordValid = await comparePassword(loginInput.password, user.password);
    
    if (!isPasswordValid) {
      return { user: null, error: 'Correo electrónico o contraseña incorrectos' };
    }

    return { user: withoutPassword(user) };
  } catch (error) {
    console.error('Error logging in:', error);
    return { user: null, error: 'Error al iniciar sesión' };
  }
}

// Get user by ID
export async function getUserById(id: string): Promise<Omit<User, 'password'> | null> {
  try {
    const db: Db = await connectToDatabase();
    const usersCollection = db.collection<User>(USERS_COLLECTION);
    
    const objectId = new ObjectId(id);
    const user = await usersCollection.findOne({ _id: objectId });
    
    if (!user) {
      return null;
    }
    
    return withoutPassword(user);
  } catch (error) {
    console.error('Error getting user by ID:', error);
    return null;
  }
}

// Get user by email
export async function getUserByEmail(email: string): Promise<Omit<User, 'password'> | null> {
  try {
    const db: Db = await connectToDatabase();
    const usersCollection = db.collection<User>(USERS_COLLECTION);
    
    const user = await usersCollection.findOne({ email });
    
    if (!user) {
      return null;
    }
    
    return withoutPassword(user);
  } catch (error) {
    console.error('Error getting user by email:', error);
    return null;
  }
}
