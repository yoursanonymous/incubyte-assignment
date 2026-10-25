export type Role = 'CUSTOMER' | 'ADMIN';
export const CATEGORIES = [
  'SEDAN',
  'SUV',
  'TRUCK',
  'COUPE',
  'HATCHBACK',
  'CONVERTIBLE',
  'VAN',
  'WAGON',
] as const;
export type Category = (typeof CATEGORIES)[number];

export interface User {
  id: string;
  email: string;
  role: Role;
  createdAt: string;
}
export interface Session {
  user: User;
  accessToken: string;
  expiresIn: number;
}

/** `price` is an exact decimal string from the API, e.g. "24999.99". */
export interface Vehicle {
  id: string;
  make: string;
  model: string;
  category: Category;
  price: string;
  quantity: number;
  createdAt: string;
  updatedAt: string;
}
export interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}
export interface Page<T> {
  data: T[];
  pagination: Pagination;
}

export interface Purchase {
  id: string;
  vehicleId: string;
  quantity: number;
  unitPrice: string;
  total: string;
  createdAt: string;
  remainingStock?: number;
  vehicle?: { id: string; make: string; model: string };
  customer?: { id: string; email: string };
}
