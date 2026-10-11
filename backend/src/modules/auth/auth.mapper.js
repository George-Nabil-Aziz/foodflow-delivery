/**
 * Allow-list mapper. Fields are named explicitly, so password_hash and any
 * future secret column cannot be serialized by accident.
 */
export const toAuthUserDto = (u) => ({
  id: u.id,
  email: u.email,
  fullName: u.full_name,
  phone: u.phone,
  role: u.role,
  status: u.status,
  createdAt: u.created_at,
});
