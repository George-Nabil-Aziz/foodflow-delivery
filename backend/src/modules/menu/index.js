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
  listGroups,
  createGroup,
  updateGroup,
  deleteGroup,
  reorderGroups,
  createOption,
  updateOption,
  setOptionAvailability,
  deleteOption,
  reorderOptions,
  getOptionContext,
  resolveSelections,
} from './options.service.js';

export { selectOptions, unitPriceWith, lineKeyOf, normalizeNote, CART_ISSUE_FOR } from './optionSelection.js';

export {
  createCategorySchema,
  updateCategorySchema,
  reorderCategoriesSchema,
  createItemSchema,
  updateItemSchema,
  availabilitySchema,
  listItemsQuery,
} from './menu.schemas.js';

export {
  createGroupSchema,
  updateGroupSchema,
  reorderGroupsSchema,
  createOptionSchema,
  updateOptionSchema,
  reorderOptionsSchema,
  itemParam,
  groupParam,
  optionParam,
  optionIds,
} from './options.schemas.js';
