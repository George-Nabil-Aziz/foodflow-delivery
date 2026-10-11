import crypto from 'node:crypto';
import { knex } from '../../shared/db/knex.js';
import { hashRefreshToken, refreshExpiryDate } from '../../shared/jwt.js';

const table = (trx) => (trx ?? knex)('refresh_tokens');

export async function createRefreshToken(
  { userId, token, familyId, userAgent, ipAddress },
  trx,
) {
  const [row] = await table(trx)
    .insert({
      user_id: userId,
      token_hash: hashRefreshToken(token),
      family_id: familyId ?? crypto.randomUUID(),
      expires_at: refreshExpiryDate(),
      user_agent: userAgent ?? null,
      ip_address: ipAddress ?? null,
    })
    .returning('*');
  return row;
}

export function findByToken(token, trx) {
  return table(trx).where({ token_hash: hashRefreshToken(token) }).first();
}

export async function revokeToken(id, { replacedById } = {}, trx) {
  await table(trx)
    .where({ id })
    .update({ revoked_at: knex.fn.now(), replaced_by_id: replacedById ?? null });
}

/** Reuse detection: revoking the whole family is the correct response to an
 *  ambiguous theft signal, so both the attacker and the victim are logged out. */
export async function revokeFamily(familyId, trx) {
  await table(trx).where({ family_id: familyId }).whereNull('revoked_at')
    .update({ revoked_at: knex.fn.now() });
}

export async function revokeAllForUser(userId, trx) {
  await table(trx).where({ user_id: userId }).whereNull('revoked_at')
    .update({ revoked_at: knex.fn.now() });
}

export async function countActiveForUser(userId, trx) {
  const row = await table(trx).where({ user_id: userId }).whereNull('revoked_at').count().first();
  return Number(row?.count ?? 0);
}
