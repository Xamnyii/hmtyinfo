import { ObjectId } from 'mongodb';

declare module '@hmtyauth/types' {
  export interface User {
    _id?: string;
    name: string;
    email: string;
    createdAt?: string;
  }

  export interface UserSession {
    user: User;
    logged: boolean;
  }
}
