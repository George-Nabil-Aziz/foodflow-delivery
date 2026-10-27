import { config } from '../../config/index.js';
import { logger } from '../logger.js';
import { maskPhone } from '../mask.js';
import { maskEmail } from './recipients.js';

/**
 * Transport adapters. A transport is `{ name, send({ to, subject, text, html }) }`
 * and throws on failure. `log` never sends anything: it is the default when
 * nothing is configured, so dev and tests need no accounts.
 */

const maskAddress = (to) => (String(to).includes('@') ? maskEmail(to) : maskPhone(to));

export const logTransport = {
  name: 'log',
  async send({ channel, to, subject }) {
    // No body at info level: it contains personal data. Recipient is masked.
    logger.info({ channel, to: maskAddress(to), subject }, 'notification (log transport)');
  },
};

/** Email through SMTP using nodemailer, loaded only when actually used. */
export function createSmtpTransport(cfg = config.notifications.smtp) {
  let transporter = null;
  return {
    name: 'smtp',
    async send({ to, subject, text, html }) {
      if (!transporter) {
        const { default: nodemailer } = await import('nodemailer');
        transporter = nodemailer.createTransport({
          host: cfg.host,
          port: cfg.port,
          secure: cfg.secure,
          auth: cfg.user ? { user: cfg.user, pass: cfg.pass } : undefined,
          connectionTimeout: 10_000,
          socketTimeout: 15_000,
        });
      }
      await transporter.sendMail({ from: cfg.from, to, subject, text, html });
    },
  };
}

/** SMS through Twilio's REST API over HTTPS (no SDK needed for one call). */
export function createTwilioTransport(cfg = config.notifications.twilio, fetchFn = globalThis.fetch) {
  return {
    name: 'twilio',
    async send({ to, text }) {
      const res = await fetchFn(
        `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(cfg.accountSid)}/Messages.json`,
        {
          method: 'POST',
          headers: {
            Authorization: `Basic ${Buffer.from(`${cfg.accountSid}:${cfg.authToken}`).toString('base64')}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({ To: to, From: cfg.from, Body: text }),
          signal: AbortSignal.timeout(10_000),
        },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        // Twilio's code and message describe the failure, never the credentials.
        throw new Error(`Twilio ${res.status}${body.code ? ` (${body.code})` : ''}: ${body.message ?? 'request failed'}`);
      }
    },
  };
}

const overrides = new Map();
const built = new Map();

/** The transport for a channel: an injected one, else by configuration. */
export function getTransport(channel) {
  if (overrides.has(channel)) return overrides.get(channel);
  if (!built.has(channel)) {
    const { smtp, twilio } = config.notifications;
    let transport = logTransport;
    if (channel === 'EMAIL' && smtp.host) transport = createSmtpTransport(smtp);
    if (channel === 'SMS' && twilio.accountSid && twilio.authToken && twilio.from) {
      transport = createTwilioTransport(twilio);
    }
    built.set(channel, transport);
  }
  return built.get(channel);
}

/** Test seam: inject (or with null, remove) a transport for a channel. */
export function setTransport(channel, transport) {
  if (transport) overrides.set(channel, transport);
  else overrides.delete(channel);
}

export function resetTransports() {
  overrides.clear();
  built.clear();
}
