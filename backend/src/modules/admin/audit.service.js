import { knex } from '../../shared/db/knex.js';

/**
 * Writes an audit row. Always called INSIDE the transaction that performs the
 * change, so the audit row and the effect commit together: a mutation that
 * rolls back writes no audit entry, and an unaudited mutation is impossible
 * without deleting the call (BR-AD1).
 *
 * Append-only: no update or delete path exists anywhere in the codebase.
 */
export async function audit(
  { adminUserId, action, entityType, entityId, metadata = {}, ipAddress = null },
  trx,
) {
  const [row] = await (trx ?? knex)('admin_audit_logs')
    .insert({
      admin_user_id: adminUserId,
      action,
      entity_type: entityType,
      entity_id: entityId ?? null,
      metadata: JSON.stringify(metadata ?? {}),
      ip_address: ipAddress,
    })
    .returning('*');
  return row;
}
