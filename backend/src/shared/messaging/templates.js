/**
 * Notification templates (spec-13): who gets each notification, on which
 * channels, and the wording in English and Arabic.
 *
 * None of these ever carry a password (BR-AD8): account-created messages are
 * welcome notices only; the initial password is shown to the admin once.
 */

/**
 * Per-template routing.
 *  - recipient: how to find the user when the caller gives only a payload.
 *  - channels: where it goes. EMAIL and SMS are external; IN_APP is a row only.
 *  - dedupe: store one row per (template, order, channel, recipient).
 */
export const TEMPLATES = Object.freeze({
  ORDER_PLACED: { recipient: 'ORDER_CUSTOMER', channels: ['EMAIL'], dedupe: true },
  NEW_ORDER: { recipient: 'ORDER_RESTAURANT_OWNER', channels: ['SMS', 'EMAIL'], dedupe: true },
  ORDER_OUT_FOR_DELIVERY: { recipient: 'ORDER_CUSTOMER', channels: ['SMS'], dedupe: true },
  ORDER_CANCELLED: { recipient: 'ORDER_CUSTOMER', channels: ['EMAIL'], dedupe: true },
  NEW_OFFER: { recipient: 'USER', channels: ['IN_APP'], dedupe: false },
  DRIVER_CREATED: { recipient: 'USER', channels: ['EMAIL'], dedupe: false },
  ACCOUNT_CREATED: { recipient: 'USER', channels: ['EMAIL'], dedupe: false },
});

export const LANGUAGES = Object.freeze(['en', 'ar']);

const BRAND = 'FoodFlow';

/** Escapes user-provided text for HTML (names, order numbers, reasons). */
export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const ROLE_LABEL = {
  en: { CUSTOMER: 'customer', RESTAURANT: 'restaurant owner', ADMIN: 'administrator', DRIVER: 'driver' },
  ar: { CUSTOMER: 'عميل', RESTAURANT: 'صاحب مطعم', ADMIN: 'مسؤول', DRIVER: 'سائق' },
};

const REASON_LABEL = {
  en: {
    ACCEPT_TIMEOUT: 'the restaurant did not respond in time',
    CUSTOMER_CHANGED_MIND: 'the order was cancelled at your request',
  },
  ar: {
    ACCEPT_TIMEOUT: 'لم يستجب المطعم في الوقت المحدد',
    CUSTOMER_CHANGED_MIND: 'تم إلغاء الطلب بناءً على طلبك',
  },
};

/**
 * Copy per template and language. Each entry returns { subject, lines, sms }:
 * `lines` are the body paragraphs shared by the text and HTML renderings, `sms`
 * a short single message. `d` holds the already-extracted values.
 */
const COPY = {
  ORDER_PLACED: {
    en: (d) => ({
      subject: `We received your order #${d.orderNumber}`,
      lines: [`Hi ${d.name},`, `Your order #${d.orderNumber} has been placed and is waiting for the restaurant to confirm it.`],
      sms: `${BRAND}: order #${d.orderNumber} placed.`,
    }),
    ar: (d) => ({
      subject: `تم استلام طلبك رقم ${d.orderNumber}`,
      lines: [`مرحباً ${d.name}،`, `تم تسجيل طلبك رقم ${d.orderNumber} وهو بانتظار تأكيد المطعم.`],
      sms: `${BRAND}: تم تسجيل الطلب رقم ${d.orderNumber}.`,
    }),
  },
  NEW_ORDER: {
    en: (d) => ({
      subject: `New order #${d.orderNumber}`,
      lines: [`Hi ${d.name},`, `A new order #${d.orderNumber}${d.total ? ` (${d.total} EGP)` : ''} is waiting for you to accept.`],
      sms: `${BRAND}: new order #${d.orderNumber}. Open the app to accept it.`,
    }),
    ar: (d) => ({
      subject: `طلب جديد رقم ${d.orderNumber}`,
      lines: [`مرحباً ${d.name}،`, `لديك طلب جديد رقم ${d.orderNumber}${d.total ? ` (${d.total} ج.م)` : ''} بانتظار قبولك.`],
      sms: `${BRAND}: طلب جديد رقم ${d.orderNumber}. افتح التطبيق لقبوله.`,
    }),
  },
  ORDER_OUT_FOR_DELIVERY: {
    en: (d) => ({
      subject: `Order #${d.orderNumber} is on its way`,
      lines: [`Hi ${d.name},`, `Your order #${d.orderNumber} is out for delivery.`],
      sms: `${BRAND}: order #${d.orderNumber} is out for delivery.`,
    }),
    ar: (d) => ({
      subject: `طلبك رقم ${d.orderNumber} في الطريق إليك`,
      lines: [`مرحباً ${d.name}،`, `طلبك رقم ${d.orderNumber} خرج للتوصيل.`],
      sms: `${BRAND}: طلبك رقم ${d.orderNumber} خرج للتوصيل.`,
    }),
  },
  ORDER_CANCELLED: {
    en: (d) => ({
      subject: `Order #${d.orderNumber} was cancelled`,
      lines: [
        `Hi ${d.name},`,
        `Your order #${d.orderNumber} was cancelled${d.reason ? `: ${d.reason}` : ''}.`,
      ],
      sms: `${BRAND}: order #${d.orderNumber} was cancelled.`,
    }),
    ar: (d) => ({
      subject: `تم إلغاء طلبك رقم ${d.orderNumber}`,
      lines: [`مرحباً ${d.name}،`, `تم إلغاء طلبك رقم ${d.orderNumber}${d.reason ? `: ${d.reason}` : ''}.`],
      sms: `${BRAND}: تم إلغاء الطلب رقم ${d.orderNumber}.`,
    }),
  },
  NEW_OFFER: {
    en: (d) => ({
      subject: `New delivery offer for order #${d.orderNumber}`,
      lines: [`A delivery offer for order #${d.orderNumber} is waiting for you.`],
      sms: `${BRAND}: new delivery offer, order #${d.orderNumber}.`,
    }),
    ar: (d) => ({
      subject: `عرض توصيل جديد للطلب رقم ${d.orderNumber}`,
      lines: [`لديك عرض توصيل للطلب رقم ${d.orderNumber}.`],
      sms: `${BRAND}: عرض توصيل جديد للطلب رقم ${d.orderNumber}.`,
    }),
  },
  DRIVER_CREATED: {
    en: (d) => ({
      subject: `Welcome to ${BRAND}`,
      lines: [
        `Hi ${d.name},`,
        `A ${BRAND} driver account has been created for you. Your administrator will give you your initial password in person; it is never sent by email or SMS.`,
        'Your account must be approved before you can receive deliveries.',
      ],
      sms: `${BRAND}: your driver account was created. Ask your administrator for your sign-in details.`,
    }),
    ar: (d) => ({
      subject: `مرحباً بك في ${BRAND}`,
      lines: [
        `مرحباً ${d.name}،`,
        `تم إنشاء حساب سائق لك في ${BRAND}. سيسلمك المسؤول كلمة المرور الأولية مباشرة، ولا تُرسل أبداً بالبريد أو الرسائل النصية.`,
        'يجب اعتماد حسابك قبل أن تتمكن من استقبال الطلبات.',
      ],
      sms: `${BRAND}: تم إنشاء حساب السائق الخاص بك. اطلب بيانات الدخول من المسؤول.`,
    }),
  },
  ACCOUNT_CREATED: {
    en: (d) => ({
      subject: `Welcome to ${BRAND}`,
      lines: [
        `Hi ${d.name},`,
        `A ${BRAND} ${d.role} account has been created for you. Your administrator will give you your initial password in person; it is never sent by email or SMS.`,
      ],
      sms: `${BRAND}: your account was created. Ask your administrator for your sign-in details.`,
    }),
    ar: (d) => ({
      subject: `مرحباً بك في ${BRAND}`,
      lines: [
        `مرحباً ${d.name}،`,
        `تم إنشاء حساب (${d.role}) لك في ${BRAND}. سيسلمك المسؤول كلمة المرور الأولية مباشرة، ولا تُرسل أبداً بالبريد أو الرسائل النصية.`,
      ],
      sms: `${BRAND}: تم إنشاء حسابك. اطلب بيانات الدخول من المسؤول.`,
    }),
  },
};

/**
 * Renders a notification for one channel.
 *
 * @param {string} template  A key of TEMPLATES.
 * @param {'EMAIL'|'SMS'|'IN_APP'} channel
 * @param {object} payload   Template data (orderNumber, total, reason, role...).
 * @param {{ fullName?: string, lang?: string }} recipient
 * @returns {{ subject?: string, text: string, html?: string }}
 */
export function render(template, channel, payload = {}, recipient = {}) {
  const lang = LANGUAGES.includes(recipient.lang) ? recipient.lang : 'en';
  const copy = COPY[template]?.[lang];
  if (!copy) throw new Error(`Unknown notification template: ${template}`);

  const d = {
    name: recipient.fullName || (lang === 'ar' ? 'عميلنا' : 'there'),
    orderNumber: payload.orderNumber ?? '',
    total: payload.total ?? '',
    reason: payload.reason ? (REASON_LABEL[lang][payload.reason] ?? '') : '',
    role: ROLE_LABEL[lang][payload.role] ?? payload.role ?? '',
  };
  const { subject, lines, sms } = copy(d);

  if (channel === 'SMS') return { text: sms };

  // Header injection guard: a subject is one line, whatever the data.
  const oneLine = subject.replace(/[\r\n]+/g, ' ');
  const text = `${lines.join('\n\n')}\n\n${BRAND}`;
  if (channel !== 'EMAIL') return { subject: oneLine, text };

  const dir = lang === 'ar' ? 'rtl' : 'ltr';
  const html =
    `<div dir="${dir}" style="font-family:Arial,sans-serif;font-size:15px;color:#222">` +
    lines.map((l) => `<p>${escapeHtml(l)}</p>`).join('') +
    `<p style="color:#888">${BRAND}</p></div>`;
  return { subject: oneLine, text, html };
}
