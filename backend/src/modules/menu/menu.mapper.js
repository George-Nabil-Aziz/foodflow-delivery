export const toCategoryDto = (c) => ({
  id: c.id,
  name: c.name,
  description: c.description,
  displayOrder: c.display_order,
  isActive: c.is_active,
  itemCount: c.item_count !== undefined ? Number(c.item_count) : undefined,
  createdAt: c.created_at,
});

export const toItemDto = (i) => ({
  id: i.id,
  categoryId: i.category_id,
  name: i.name,
  description: i.description,
  price: i.price,
  imageUrl: i.image_url,
  isAvailable: i.is_available,
  displayOrder: i.display_order,
  createdAt: i.created_at,
});

/**
 * Public projection. Unavailable items are INCLUDED and flagged (FR-3.7, FR-4.5):
 * hiding them would make the restaurant look smaller than it is and confuse a
 * customer who saw the dish yesterday.
 */
export const toPublicMenuDto = (categories, items) =>
  categories.map((c) => ({
    id: c.id,
    name: c.name,
    description: c.description,
    displayOrder: c.display_order,
    items: items
      .filter((i) => i.category_id === c.id)
      .map((i) => ({
        id: i.id,
        name: i.name,
        description: i.description,
        price: i.price,
        imageUrl: i.image_url,
        isAvailable: i.is_available,
      })),
  }));
