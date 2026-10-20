/**
 * How many rows each filter choice would show, for the counts beside them.
 *
 * Each count asks the list endpoint itself for one row with that choice's
 * filters and reads the total, so a count can never disagree with the list
 * the choice opens. A failed count is null and the choice simply shows none.
 *
 * request(value) -> a list call's envelope ({ data, meta.pagination }).
 */
export async function countEach(values, request) {
  const totals = await Promise.all(values.map((value) => request(value)
    .then((res) => res.meta?.pagination?.total ?? res.data.length)
    .catch(() => null)));
  return Object.fromEntries(values.map((value, i) => [value, totals[i]]));
}
