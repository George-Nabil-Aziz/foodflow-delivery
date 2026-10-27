/** Public interface of the discounts module (NFR-1). */
export {
  validateForOrder,
  validateForCart,
  findCodeForCart,
  getCodeById,
  recordRedemption,
  getOrderDiscount,
  adminList,
  adminGet,
  adminCreate,
  adminUpdate,
  adminSetActive,
  adminDelete,
} from './discounts.service.js';
