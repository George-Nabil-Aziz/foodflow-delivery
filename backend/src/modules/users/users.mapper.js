export const toUserDto = (u) => ({
  id: u.id,
  email: u.email,
  fullName: u.full_name,
  phone: u.phone,
  role: u.role,
  status: u.status,
  preferredLanguage: u.preferred_language,
  createdAt: u.created_at,
});

export const toAddressDto = (a) => ({
  id: a.id,
  label: a.label,
  line1: a.line1,
  line2: a.line2,
  city: a.city,
  district: a.district,
  postalCode: a.postal_code,
  latitude: a.latitude,
  longitude: a.longitude,
  isDefault: a.is_default,
  createdAt: a.created_at,
});

/** The snapshot copied onto an order. Editing the address book later never
 *  rewrites this (BR-O6). */
export const toAddressSnapshot = (a) => ({
  label: a.label,
  line1: a.line1,
  line2: a.line2,
  city: a.city,
  district: a.district,
  postalCode: a.postal_code,
  latitude: a.latitude,
  longitude: a.longitude,
});
