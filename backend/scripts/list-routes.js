/**
 * Enumerates every mounted route with the middleware that actually applies to
 * it, including middleware attached to a parent router via `router.use(...)`.
 *
 * Collecting only `layer.route.stack` would miss `router.use(authenticate,
 * authorize('DRIVER'))`, which is how most of the API is guarded - and the
 * router audit test would then pass vacuously.
 *
 *   node scripts/list-routes.js
 */
import { app } from '../src/app.js';

function mountPath(layer) {
  if (!layer.regexp) return '';
  const src = layer.regexp.source;
  if (src === '^\\/?(?=\\/|$)') return '';
  const match = /^\^\\\/([^\\]*)/.exec(src);
  return match ? `/${match[1]}` : '';
}

const isSubRouter = (layer) => Boolean(layer.handle?.stack) && !layer.route;

export function listRoutes(application = app) {
  const out = [];

  const walk = (stack, prefix, inherited) => {
    // Middleware declared with .use() before a route in the same stack applies
    // to that route, so it accumulates as we walk the stack in order.
    const applicable = [...inherited];

    for (const layer of stack) {
      if (layer.route) {
        const methods = Object.keys(layer.route.methods)
          .filter((m) => m !== '_all')
          .map((m) => m.toUpperCase());
        const own = layer.route.stack.map((s) => s.name);
        const path = `${prefix}${layer.route.path}`.replace(/\/$/, '') || '/';
        for (const method of methods) {
          out.push({
            method,
            path,
            middleware: [...applicable, ...own],
            key: `${method} ${path}`,
          });
        }
      } else if (isSubRouter(layer)) {
        walk(layer.handle.stack, prefix + mountPath(layer), applicable);
      } else if (layer.name && layer.name !== '<anonymous>') {
        // A plain middleware layer: applies to everything after it here.
        applicable.push(layer.name);
      }
    }
  };

  walk(application._router.stack, '', []);
  return out;
}

if (process.argv[1] && process.argv[1].endsWith('list-routes.js')) {
  /* eslint-disable no-console */
  const routes = listRoutes();
  routes.sort((a, b) => a.key.localeCompare(b.key));
  for (const r of routes) console.log(r.key);
  console.log(`\nTOTAL: ${routes.length}`);
  process.exit(0);
}
