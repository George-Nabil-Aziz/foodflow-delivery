import { describe, it, expect, vi } from 'vitest';
import { TEMPLATES, render, escapeHtml } from '../../src/shared/messaging/templates.js';
import { normalizePhone, addressFor, maskEmail } from '../../src/shared/messaging/recipients.js';
import { createTwilioTransport } from '../../src/shared/messaging/transports.js';

const payload = { orderNumber: 'FF-20260101-ABC123', total: '164.76', role: 'RESTAURANT' };

describe('templates', () => {
  it('renders every template in English and Arabic on every channel', () => {
    for (const template of Object.keys(TEMPLATES)) {
      for (const lang of ['en', 'ar']) {
        const email = render(template, 'EMAIL', payload, { fullName: 'Sara', lang });
        expect(email.subject, `${template}/${lang}`).toBeTruthy();
        expect(email.text).toContain('FoodFlow');
        expect(email.html).toContain(lang === 'ar' ? 'dir="rtl"' : 'dir="ltr"');
        const sms = render(template, 'SMS', payload, { fullName: 'Sara', lang });
        expect(sms.text.length).toBeLessThanOrEqual(160);
      }
    }
  });

  it('falls back to English for an unknown language', () => {
    const en = render('ORDER_PLACED', 'SMS', payload, { lang: 'en' });
    expect(render('ORDER_PLACED', 'SMS', payload, { lang: 'fr' })).toEqual(en);
  });

  it('includes the order number and uses Arabic copy for ar', () => {
    const ar = render('NEW_ORDER', 'EMAIL', payload, { fullName: 'مطعم', lang: 'ar' });
    expect(ar.subject).toContain(payload.orderNumber);
    expect(ar.text).toMatch(/[؀-ۿ]/);
  });

  it('escapes user-provided strings in the HTML body only', () => {
    const evil = '<script>alert(1)</script>';
    const mail = render('ORDER_PLACED', 'EMAIL', payload, { fullName: evil });
    expect(mail.html).not.toContain('<script>');
    expect(mail.html).toContain('&lt;script&gt;');
    expect(mail.text).toContain(evil);
    expect(escapeHtml(`"a" & 'b'`)).toBe('&quot;a&quot; &amp; &#39;b&#39;');
  });

  it('keeps the subject on one line', () => {
    const mail = render('ORDER_PLACED', 'EMAIL', { orderNumber: 'A\r\nBcc: x@evil.com' }, {});
    expect(mail.subject).not.toMatch(/[\r\n]/);
  });

  it('never mentions a password value in account-created messages (BR-AD8)', () => {
    for (const template of ['DRIVER_CREATED', 'ACCOUNT_CREATED']) {
      const mail = render(template, 'EMAIL', { ...payload, initialPassword: 'abcd-efgh-ijkl' }, { fullName: 'Omar' });
      expect(`${mail.text}${mail.html}`).not.toContain('abcd-efgh-ijkl');
    }
  });

  it('rejects an unknown template', () => {
    expect(() => render('NOPE', 'EMAIL', {}, {})).toThrow(/Unknown notification template/);
  });
});

describe('recipient helpers', () => {
  it('normalises Egyptian numbers to E.164', () => {
    expect(normalizePhone('01012345678')).toBe('+201012345678');
    expect(normalizePhone('+201012345678')).toBe('+201012345678');
    expect(normalizePhone('0101 234 5678')).toBe('+201012345678');
    expect(normalizePhone('+14155550123')).toBe('+14155550123');
  });

  it('rejects numbers it cannot use', () => {
    expect(normalizePhone('12345')).toBeNull();
    expect(normalizePhone('')).toBeNull();
    expect(normalizePhone(null)).toBeNull();
  });

  it('picks the address for a channel', () => {
    const user = { email: 'sara@example.com', phone: '01012345678' };
    expect(addressFor(user, 'EMAIL')).toBe('sara@example.com');
    expect(addressFor(user, 'SMS')).toBe('+201012345678');
    expect(addressFor(user, 'IN_APP')).toBeNull();
  });

  it('masks emails for logs', () => {
    expect(maskEmail('sara@example.com')).toBe('s***@example.com');
  });
});

describe('twilio transport', () => {
  const cfg = { accountSid: 'ACtest', authToken: 'secret', from: '+15550001111' };

  it('posts To/From/Body with basic auth', async () => {
    const fetchFn = vi.fn().mockResolvedValue({ ok: true });
    await createTwilioTransport(cfg, fetchFn).send({ to: '+201012345678', text: 'hello' });
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toContain('/Accounts/ACtest/Messages.json');
    expect(init.headers.Authorization).toBe(`Basic ${Buffer.from('ACtest:secret').toString('base64')}`);
    expect(init.body.get('To')).toBe('+201012345678');
    expect(init.body.get('From')).toBe('+15550001111');
    expect(init.body.get('Body')).toBe('hello');
  });

  it('throws a message without credentials on an error response', async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: false, status: 400, json: async () => ({ code: 21211, message: 'Invalid To number' }),
    });
    await expect(createTwilioTransport(cfg, fetchFn).send({ to: 'x', text: 'y' }))
      .rejects.toThrow('Twilio 400 (21211): Invalid To number');
  });
});
