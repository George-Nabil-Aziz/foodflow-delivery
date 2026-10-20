/** Public interface of the users module (NFR-1). */
export {
  getUserById,
  setUserStatus,
  getUserByIdIncludingDeleted,
  softDeleteUser,
  restoreUser,
  getAddressForOrder,
  getMe,
} from './users.service.js';
export { meRouter, addressRouter } from './users.routes.js';
