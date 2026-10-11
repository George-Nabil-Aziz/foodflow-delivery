/** Public card/detail payload. No owner id, no owner email, no approval
 *  metadata: public means public fields only (security 9). */
export const toPublicRestaurantDto = (r, orderability = {}) => ({
  id: r.id,
  name: r.name,
  slug: r.slug,
  description: r.description,
  cuisineType: r.cuisine_type,
  logoUrl: r.logo_url,
  coverImageUrl: r.cover_image_url,
  addressLine1: r.address_line1,
  city: r.city,
  district: r.district,
  deliveryFee: r.delivery_fee,
  minimumOrderAmount: r.minimum_order_amount,
  avgPreparationMinutes: r.avg_preparation_minutes,
  ratingAverage: r.rating_average,
  ratingCount: r.rating_count,
  isAcceptingOrders: r.is_accepting_orders,
  isOpenNow: orderability.isOpenNow ?? false,
  isOrderable: orderability.isOrderable ?? false,
  unavailableReason: orderability.isOrderable ? null : (orderability.reason ?? null),
});

/** Owner view: adds status and approval metadata the public never sees. */
export const toOwnerRestaurantDto = (r, orderability = {}) => ({
  ...toPublicRestaurantDto(r, orderability),
  status: r.status,
  phone: r.phone,
  email: r.email,
  latitude: r.latitude,
  longitude: r.longitude,
  approvedAt: r.approved_at,
  rejectionReason: r.rejection_reason,
  createdAt: r.created_at,
});

export const toAdminRestaurantDto = (r) => ({
  id: r.id,
  name: r.name,
  slug: r.slug,
  status: r.status,
  cuisineType: r.cuisine_type,
  city: r.city,
  isAcceptingOrders: r.is_accepting_orders,
  ratingAverage: r.rating_average,
  ratingCount: r.rating_count,
  approvedAt: r.approved_at,
  rejectionReason: r.rejection_reason,
  createdAt: r.created_at,
  owner: { id: r.owner_user_id, fullName: r.owner_full_name, email: r.owner_email },
  availableItemCount: Number(r.available_item_count ?? 0),
});

export const toHoursDto = (rows) =>
  rows.map((h) => ({
    dayOfWeek: h.day_of_week,
    isClosed: h.is_closed,
    opensAt: h.opens_at ? String(h.opens_at).slice(0, 5) : null,
    closesAt: h.closes_at ? String(h.closes_at).slice(0, 5) : null,
  }));
