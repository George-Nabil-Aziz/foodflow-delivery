import { z } from 'zod';
import { email, password, phone, trimmedString } from '../../shared/validation/common.js';

export const registerSchema = z.object({
  email,
  password,
  fullName: trimmedString(2, 100),
  phone,
  // BR-A3: only these two roles are self-registerable. DRIVER and ADMIN are
  // rejected by the service with 403 rather than stripped, so a client bug
  // surfaces loudly.
  role: z.enum(['CUSTOMER', 'RESTAURANT', 'DRIVER', 'ADMIN']).default('CUSTOMER'),
  restaurantName: trimmedString(2, 120).optional(),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().min(1, 'is required'),
  password: z.string().min(1, 'is required'),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1, 'is required'),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'is required'),
  newPassword: password,
});
