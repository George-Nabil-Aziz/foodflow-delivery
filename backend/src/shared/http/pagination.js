import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '../constants.js';

/** Normalizes validated pagination input into SQL offset/limit. */
export function toLimitOffset({ page = 1, limit = DEFAULT_PAGE_SIZE } = {}) {
  const safeLimit = Math.min(Math.max(1, Number(limit) || DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE);
  const safePage = Math.max(1, Number(page) || 1);
  return { limit: safeLimit, offset: (safePage - 1) * safeLimit, page: safePage };
}

/** Builds the meta.pagination block. `total` comes from a window count. */
export function paginationMeta({ page, limit, total }) {
  const totalNum = Number(total) || 0;
  return {
    pagination: {
      page,
      limit,
      total: totalNum,
      totalPages: limit > 0 ? Math.ceil(totalNum / limit) : 0,
    },
  };
}
