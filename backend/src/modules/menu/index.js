/** Public interface of the menu module (NFR-1). */
export {
  getMenuForRestaurant,
  getItemsByIds,
  assertItemOrderable,
  countAvailableItems,
  listCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  reorderCategories,
  listItems,
  createItem,
  updateItem,
  setAvailability,
  deleteItem,
} from './menu.service.js';

export {
  createCategorySchema,
  updateCategorySchema,
  reorderCategoriesSchema,
  createItemSchema,
  updateItemSchema,
  availabilitySchema,
  listItemsQuery,
} from './menu.schemas.js';
