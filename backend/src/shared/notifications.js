import { knex } from './db/knex.js';
import { config } from '../config/index.js';
import { logger } from './logger.js';
import { TEMPLATES, render } from './messaging/templates.js';
import { resolveRecipient, loadUser, addressFor } from './messaging/recipients.js';
import { getTransport } from './messaging/transports.js';

/**
 * Notification service (spec-13).
 *
 * `notify` records one row per recipient and channel, then hands each to its
 * transport in the background. Callers invoke it after their transaction has
 * committed and never see a delivery failure: it is recorded on the row
 * (status FAILED) and retried by the notification retry job.
 */

const NO_ADDRESS = 'recipient has no address for this channel';

// In-flight background sends, so tests (and shutdown) can wait for them.
const inflight = new Set();

/** Resolves when every background send started so far has finished. */
export async function settled() {
  while (inflight.size) await Promise.allSettled([...inflight]);
}

function background(promise) {
  const tracked = promise.catch((err) => logger.warn({ err }, 'notification delivery crashed'));
  inflight.add(tracked);
  tracked.finally(() => inflight.delete(tracked));
}

/**
 * Sends a notification.
 *
 * Recipient: `userId`, or (when absent) the role-target of the template applied
 * to `payload.orderId`, e.g. NEW_ORDER goes to the restaurant owner of that
 * order. Channels come from the template unless `channel` forces one.
 *
 * @param {object} args
 * @param {string} args.template   A key of TEMPLATES.
 * @param {object} [args.payload]  Template data; `orderId` also scopes dedupe.
 * @param {string|null} [args.userId]
 * @param {string} [args.channel]  Overrides the template's channels.
 * @returns {Promise<string[]>} ids of the rows recorded (never throws).
 */
export async function notify({ userId = null, channel, template, payload = {} }) {
  try {
    const def = TEMPLATES[template];
    const channels = channel ? [channel] : (def?.channels ?? ['IN_APP']);
    const recipient = await resolveRecipient({
      userId,
      kind: def?.recipient,
      orderId: payload.orderId,
    });
    const ids = [];

    for (const ch of channels) {
      const to = recipient && ch !== 'IN_APP' ? addressFor(recipient, ch) : null;
      const external = ch !== 'IN_APP';
      let status = 'QUEUED';
      let lastError = null;
      if (!external) status = 'SENT'; // An in-app row is visible the moment it exists.
      else if (!to) {
        status = 'SKIPPED';
        lastError = recipient ? NO_ADDRESS : 'no recipient';
      }

      const dedupeKey =
        def?.dedupe && payload.orderId && recipient
          ? `${template}:${payload.orderId}:${ch}:${recipient.userId}`
          : null;

      const [row] = await knex('notifications')
        .insert({
          user_id: recipient?.userId ?? userId,
          channel: ch,
          template,
          payload: JSON.stringify(payload),
          status,
          last_error: lastError,
          recipient: to,
          dedupe_key: dedupeKey,
          sent_at: status === 'SENT' ? knex.fn.now() : null,
        })
        .onConflict(knex.raw('(dedupe_key) WHERE dedupe_key IS NOT NULL'))
        .ignore()
        .returning('id');
      // No row back means this exact message was already recorded.
      if (!row) continue;
      ids.push(row.id);
      if (status === 'QUEUED') background(deliver(row.id));
      else logger.info({ template, channel: ch, status, userId: recipient?.userId ?? userId }, 'notification');
    }
    return ids;
  } catch (err) {
    // A notification failure must never break the operation that triggered it.
    logger.warn({ err, template }, 'notification failed');
    return [];
  }
}

/**
 * Claims one row so exactly one worker sends it. A first send takes a QUEUED
 * row never attempted; a retry takes a FAILED row that is due. Bumping
 * `attempts` in the same statement is what stops a second claimer.
 */
async function claim(id, { retry }) {
  const q = knex('notifications')
    .where({ id })
    .update({ status: 'QUEUED', attempts: knex.raw('attempts + 1'), next_attempt_at: null })
    .returning('*');
  if (retry) {
    q.where({ status: 'FAILED' })
      .where('attempts', '<', config.notifications.maxAttempts)
      .where((b) => b.whereNull('next_attempt_at').orWhere('next_attempt_at', '<=', knex.fn.now()));
  } else {
    q.where({ status: 'QUEUED', attempts: 0 });
  }
  const [row] = await q;
  return row ?? null;
}

async function overRecipientLimit(row) {
  const { recipientHourlyLimit } = config.notifications;
  const { rows } = await knex.raw(
    `SELECT count(*)::int AS n FROM notifications
     WHERE recipient = ? AND channel = ? AND status = 'SENT'
       AND sent_at > now() - interval '1 hour'`,
    [row.recipient, row.channel],
  );
  return rows[0].n >= recipientHourlyLimit;
}

/**
 * Sends one recorded notification and records the outcome. Safe to call for
 * any id: a row that is not due, or is already being sent, is left alone.
 */
export async function deliver(id, { retry = false } = {}) {
  const row = await claim(id, { retry });
  if (!row) return null;

  const outcome = async (patch) => {
    await knex('notifications').where({ id }).update(patch);
    return patch.status;
  };

  try {
    if (await overRecipientLimit(row)) {
      return await outcome({ status: 'SKIPPED', last_error: 'recipient rate limit reached' });
    }
    const transport = getTransport(row.channel);
    const user = await loadUser(row.user_id);
    const message = render(row.template, row.channel, row.payload, user ?? {});
    await transport.send({ channel: row.channel, to: row.recipient, ...message });

    // The log transport only records; that is not a delivery.
    if (transport.name === 'log') return await outcome({ status: 'SKIPPED', last_error: null });
    return await outcome({ status: 'SENT', sent_at: knex.fn.now(), last_error: null });
  } catch (err) {
    const { retryBaseSeconds } = config.notifications;
    // Exponential backoff: base, 2x base, 4x base...
    const delay = retryBaseSeconds * 2 ** (row.attempts - 1);
    logger.warn({ template: row.template, channel: row.channel, attempts: row.attempts, err: err.message }, 'notification send failed');
    return outcome({
      status: 'FAILED',
      last_error: String(err.message).slice(0, 500),
      next_attempt_at: knex.raw(`now() + (? || ' seconds')::interval`, [delay]),
    });
  }
}

/**
 * Resends FAILED rows that are due and still under the attempt cap, plus rows
 * that were recorded but never sent (the process died before the background
 * send). A row stuck mid-send is deliberately left: at-most-once beats texting
 * someone twice.
 */
export async function retryFailed({ limit = 50 } = {}) {
  const { maxAttempts } = config.notifications;
  const failed = await knex('notifications')
    .where({ status: 'FAILED' })
    .where('attempts', '<', maxAttempts)
    .where('next_attempt_at', '<=', knex.fn.now())
    .orderBy('next_attempt_at')
    .limit(limit)
    .pluck('id');
  const orphaned = await knex('notifications')
    .where({ status: 'QUEUED', attempts: 0 })
    .where('created_at', '<', knex.raw("now() - interval '5 minutes'"))
    .limit(limit)
    .pluck('id');

  let sent = 0;
  for (const id of failed) if ((await deliver(id, { retry: true })) === 'SENT') sent += 1;
  for (const id of orphaned) if ((await deliver(id)) === 'SENT') sent += 1;
  return { considered: failed.length + orphaned.length, sent };
}
