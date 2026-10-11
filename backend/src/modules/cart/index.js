/** Public interface of the cart module (NFR-1). */
export {
  getActiveCartForCheckout,
  revalidateLines,
  markConverted,
  getItemCount,
} from './cart.service.js';
export { cartRouter } from './cart.routes.js';
