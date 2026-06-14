const express = require('express');
const { Bot, InlineKeyboard, webhookCallback } = require('grammy');
const { randomUUID } = require('crypto');

const BOT_TOKEN = process.env.BOT_TOKEN;
const CRYPTOBOT_TOKEN = process.env.CRYPTOBOT_TOKEN;
const MY_ID = 8006368888;
const ADMIN_IDS = [MY_ID, ...(process.env.ADMIN_IDS || '').split(',').map(Number).filter(Boolean)];
const PORT = process.env.PORT || 8080;
const BOT_USERNAME = process.env.BOT_USERNAME || '';
const WEBHOOK_DOMAIN = process.env.WEBHOOK_DOMAIN || '';
const CARD_DETAILS = process.env.CARD_DETAILS || '4323 3870 2556 7002';

function genKey() {
  const r = () => randomUUID().slice(0, 4).toUpperCase();
  return 'ENCODEX-' + r() + '-' + r() + '-' + r() + '-' + r();
}

const store = { keys: {}, total: 0, sold: 0 };

function saveKey(key, userId, name, method) {
  if (store.keys[key]) return false;
  store.keys[key] = { key, userId, name, method, time: Date.now() };
  store.total++;
  if (userId) store.sold++;
  return true;
}

function issueKey(userId, name, method) {
  for (const k in store.keys) {
    if (!store.keys[k].userId) {
      const entry = store.keys[k];
      entry.userId = userId;
      entry.name = name;
      entry.method = method;
      store.sold++;
      return entry.key;
    }
  }
  const key = genKey();
  store.keys[key] = { key, userId, name, method, time: Date.now() };
  store.total++;
  store.sold++;
  return key;
}

function getStats() {
  const available = Object.values(store.keys).filter(k => !k.userId).length;
  return '\uD83D\uDCCA Keys: ' + store.total + ' total, ' + store.sold + ' sold, ' + available + ' available';
}

const promoCodes = new Map();
const purchaseHistory = [];
const userPromo = new Map();
const promoEntry = new Set();

function addHistory(entry) { purchaseHistory.push({ time: Date.now(), ...entry }); }

function applyPromo(userId, base) {
  const code = userPromo.get(userId);
  if (!code || !promoCodes.has(code)) return base;
  const promo = promoCodes.get(code);
  if (promo.uses >= promo.maxUses) { userPromo.delete(userId); return base; }
  return (base * (100 - promo.discount) / 100).toFixed(2);
}

const pendingPayments = new Map();
let pendingIdCounter = 0;
const awaitingReceipt = new Set();

const bot = new Bot(BOT_TOKEN);

function esc(s) { return String(s).replace(/[<>&"']/g, m => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'})[m]); }

const userLang = new Map();

function getLang(ctx) {
  const id = ctx.from?.id || ctx.chat?.id || 0;
  const stored = userLang.get(id);
  if (stored) return stored;
  return ctx.from?.language_code === 'ru' ? 'ru' : 'en';
}

const L = {
  en: {
    lang_pick: '\ud83c\udf10 <b>Choose your language</b>\n\n\ud83c\uddf7\ud83c\uddfa \u0412\u044b\u0431\u0435\u0440\u0438\u0442\u0435 \u044f\u0437\u044b\u043a',
    welcome: '\ud83d\udd25 <b>Welcome to EncodeX</b>\ud83d\udd25\n\nProfessional solution for video preparation.\n\n\u26a1 <b>Fast</b>\n\ud83c\udfac <b>Convenient</b>\n\ud83d\udc8e <b>Premium quality</b>\n\nBypass TikTok compression \u2022 Watermark <code>@encodexhd</code>\nUnlimited videos \u2022 Lifetime access',
    welcome_back: '\ud83d\udc4b <b>Welcome back!</b>\n\nReady to continue?',
    menu_main: '\ud83c\udfe0 <b>Main Menu</b>\n\nSelect a section below:',
    menu_btn_main: '\ud83c\udfe0 Main',
    menu_btn_buy: '\ud83d\udc8e Buy Premium',
    menu_btn_licenses: '\ud83d\udccb My Licenses',
    menu_btn_instructions: '\ud83d\udcd6 Instructions',
    menu_btn_faq: '\u2753 FAQ',
    menu_btn_support: '\ud83d\udd27 Support',
    menu_btn_profile: '\ud83d\udc64 Profile',
    menu_btn_community: '\ud83c\udf0d Community',
    menu_btn_admin: '\ud83d\udd35 Admin Panel',
    admin_menu_title: '\ud83d\udd35 <b>Admin Panel</b>\n\nUse the buttons below or type commands:',
    admin_btn_panel: '\ud83d\udcca Dashboard',
    admin_btn_pending: '\u23f3 Pending',
    admin_btn_history: '\uD83D\uDCC4 History',
    admin_btn_promos: '\ud83c\udfab Promos',
    admin_btn_import: '\u2705 Import Keys',
    admin_btn_genkeys: '\ud83d\udd11 Gen 10',
    admin_btn_crypto: '\ud83d\udc8e Test Crypto',
    plan_title: '\ud83d\udc51 <b>Lifetime Access</b>',
    plan_price: '\ud83d\udcb0 <b>5 USDT</b>',
    plan_desc: '<i>One-time payment \u2022 Unlimited usage \u2022 No expiry</i>',
    choose_payment: '<i>Choose payment:</i>',
    crypto: '\ud83d\udc8e CryptoBot (USDT)',
    back: '\u2190 Back',
    creating: '\u23f3 <b>Creating invoice...</b>',
    crypto_pay_title: '\ud83d\udc8e CryptoBot (USDT)',
    crypto_pay_info: '<i>Tap the button to pay with CryptoBot</i>',
    pay_usdt: '\ud83d\udcb3 Pay 5 USDT',
    card_transfer: '\ud83c\udfe6 Card Transfer (Manual)',
    card_transfer_title: '\ud83c\udfe6 Card Transfer',
    card_transfer_info: 'Send <b>150 UAH</b> to the card below, then tap "I paid":\n\n<code>{details}</code>',
    card_transfer_sent: '\u2705 I paid',
    card_transfer_await: '\u23f3 Payment <b>#{id}</b> is pending.\n\nAdmin will verify and send your key shortly.',
    card_transfer_approve: '\u2705 Approve',
    card_transfer_reject: '\u274c Reject',
    pending_title: '\u23f3 <b>Pending payments:</b>',
    pending_empty: 'No pending payments.',
    success: '\u2705 <b>Payment Successful!</b>',
    success_info: 'Your key: <code>{key}</code>\n\nOpen <b>EncodeX</b> \u2192 <b>Profile</b> \u2192 <b>Activate</b>',
    timeout: '\u274c <b>Timeout</b>\nCryptoBot API did not respond in 15s',
    err_no_token: '\u274c Crypto token not configured',
    err_plan: '\u274c CryptoBot error:\n<code>{data}</code>',
    err_exc: '\u274c <b>Error</b>\n<code>{msg}</code>',
    err_crypto: '\u274c CryptoBot error:\n<code>{data}</code>',
    stats: '\ud83d\udcca <b>Stats:</b> {n}',
    genkeys: '\ud83d\udd11 <b>Generated 10 keys:</b>\n<code>{keys}</code>',
    import_ok: '\u2705 Imported <b>{n}</b> keys. {dup} duplicates skipped.',
    import_usage: 'Usage:\n/import <code>KEY1 KEY2 KEY3</code>',
    promo_btn: '\ud83c\udfab Promo Code',
    promo_ask: 'Send me your promo code:',
    promo_invalid: '\u274c Invalid or expired promo code.',
    promo_valid: '\u2705 Promo code <b>{code}</b> applied! Discount: <b>{d}%</b>',
    promo_used: '\u26a0\ufe0f This promo has reached its usage limit.',
    promo_active: '\u2705 Active promo: <b>{code}</b> ({d}% off)',
    promo_title: '\ud83c\udfab <b>Promo Codes</b>',
    promo_empty: 'No promo codes created.',
    promo_list: '\ud83c\udfab <b>Promo Codes:</b>\n{list}',
    promo_line: '<code>{code}</code> \u2014 {d}% off, {uses}/{max} uses',
    promo_created: '\u2705 Promo <b>{code}</b> created: {d}% off, {max} max uses.',
    promo_deleted: '\u274c Promo <b>{code}</b> deleted.',
    promo_delete_fail: '\u274c Promo <b>{code}</b> not found.',
    createpromo_usage: 'Usage:\n/createpromo <code>NAME DISCOUNT% MAXUSES</code>',
    history_title: '\uD83D\uDCC4 <b>Purchase History</b>\n{list}',
    history_empty: 'No purchases yet.',
    history_line: '<code>{key}</code> \u2192 {name} ({method}){promo}\n',
    panel_title: '\ud83d\udcca <b>Admin Panel</b>\n\n{n}\n\u23f3 Pending: {pending}\n\ud83c\udfab Active promos: {promos}\n\n\ud83d\udc41 /panel \u2014 refresh\n/import \u2014 keys\n/createpromo \u2014 promo\n/promos \u2014 list\n/history \u2014 purchases',
    approved: 'Approved payment #{id}. Key sent to user.',
    rejected: 'Rejected payment #{id}.',
    profile_title: '\ud83d\udc64 <b>Your Profile</b>',
    profile_id: '\ud83d\udd11 ID: <code>{id}</code>',
    profile_name: '\ud83d\udcdd Name: <b>{name}</b>',
    profile_lang: '\ud83c\udf10 Language: <b>English</b>',
    profile_status: '\ud83d\udfe2 Status: <b>Free user</b>',
    profile_status_premium: '\ud83d\udfe1 Status: <b>Premium</b>',
    profile_no_keys: 'You don\u2019t have any active licenses yet.',
    licenses_title: '\ud83d\udccb <b>My Licenses</b>',
    licenses_empty: 'You don\u2019t have any active licenses.\n\nTap <b>Buy Premium</b> to get one!',
    licenses_key: '\ud83d\udd11 Key: <code>{key}</code>\n\u2728 Method: {method}\n\ud83d\udcc5 Date: {date}',
    instructions_title: '\ud83d\udcd6 <b>Instructions</b>',
    instructions_text: '1. \ud83d\udfe2 <b>Purchase</b> \u2014 Buy a license via CryptoBot or card transfer\n2. \ud83d\udd11 <b>Get key</b> \u2014 The key arrives automatically after payment\n3. \ud83d\udd0c <b>Activate</b> \u2014 Open EncodeX \u2192 Profile \u2192 Activate\n4. \u2705 <b>Done!</b> \u2014 Enjoy unlimited video processing\n\nFor detailed video guide, contact support.',
    faq_title: '\u2753 <b>FAQ</b>',
    faq_q1: '\u25b6\ufe0f What is EncodeX?',
    faq_a1: 'EncodeX bypasses TikTok compression, keeping your video quality intact with watermark <code>@encodexhd</code>.',
    faq_q2: '\u25b6\ufe0f How do I activate my key?',
    faq_a2: 'Open EncodeX \u2192 Profile \u2192 Activate \u2192 paste your key.',
    faq_q3: '\u25b6\ufe0f Is it unlimited?',
    faq_a3: 'Yes! Lifetime license = unlimited videos, no restrictions.',
    faq_q4: '\u25b6\ufe0f What payment methods?',
    faq_a4: 'CryptoBot (USDT) or card transfer.',
    support_title: '\ud83d\udd27 <b>Support</b>',
    support_text: 'Having issues? Contact us:\n\n\ud83d\udcac @plopaja\n\u2709\ufe0f <a href="https://t.me/plopaja">Open Chat</a>\n\nWe reply within 24 hours.',
    community_title: '\ud83c\udf0d <b>Community</b>',
    community_text: 'Join our community!\n\n\ud83d\udc65 <a href="https://t.me/encodexchat">Chat</a>\n\ud83d\udce2 <a href="https://t.me/encodexhd">News Channel</a>'
  },
  ru: {
    lang_pick: '\ud83c\udf10 <b>\u0412\u044b\u0431\u0435\u0440\u0438\u0442\u0435 \u044f\u0437\u044b\u043a</b>\n\n\ud83c\uddfa\ud83c\uddf8 Choose your language',
    welcome: '\ud83d\udd25 <b>\u0414\u043e\u0431\u0440\u043e \u043f\u043e\u0436\u0430\u043b\u043e\u0432\u0430\u0442\u044c \u0432 EncodeX</b>\ud83d\udd25\n\n\u041f\u0440\u043e\u0444\u0435\u0441\u0441\u0438\u043e\u043d\u0430\u043b\u044c\u043d\u043e\u0435 \u0440\u0435\u0448\u0435\u043d\u0438\u0435 \u0434\u043b\u044f \u043f\u043e\u0434\u0433\u043e\u0442\u043e\u0432\u043a\u0438 \u0432\u0438\u0434\u0435\u043e.\n\n\u26a1 <b>\u0411\u044b\u0441\u0442\u0440\u043e</b>\n\ud83c\udfac <b>\u0423\u0434\u043e\u0431\u043d\u043e</b>\n\ud83d\udc8e <b>\u041f\u0440\u0435\u043c\u0438\u0443\u043c \u043a\u0430\u0447\u0435\u0441\u0442\u0432\u043e</b>\n\n\u041e\u0431\u0445\u043e\u0434 \u0441\u0436\u0430\u0442\u0438\u044f TikTok \u2022 \u0412\u0430\u0442\u0435\u0440\u043c\u0430\u0440\u043a <code>@encodexhd</code>\n\u0411\u0435\u0437\u043b\u0438\u043c\u0438\u0442\u043d\u043e \u2022 \u041d\u0430\u0432\u0441\u0435\u0433\u0434\u0430',
    welcome_back: '\ud83d\udc4b <b>\u0421 \u0432\u043e\u0437\u0432\u0440\u0430\u0449\u0435\u043d\u0438\u0435\u043c!</b>\n\n\u0413\u043e\u0442\u043e\u0432\u044b \u043f\u0440\u043e\u0434\u043e\u043b\u0436\u0438\u0442\u044c?',
    menu_main: '\ud83c\udfe0 <b>\u0413\u043b\u0430\u0432\u043d\u043e\u0435 \u043c\u0435\u043d\u044e</b>\n\n\u0412\u044b\u0431\u0435\u0440\u0438\u0442\u0435 \u0440\u0430\u0437\u0434\u0435\u043b:',
    menu_btn_main: '\ud83c\udfe0 \u0413\u043b\u0430\u0432\u043d\u0430\u044f',
    menu_btn_buy: '\ud83d\udc8e \u041a\u0443\u043f\u0438\u0442\u044c Premium',
    menu_btn_licenses: '\ud83d\udccb \u041c\u043e\u0438 \u043b\u0438\u0446\u0435\u043d\u0437\u0438\u0438',
    menu_btn_instructions: '\ud83d\udcd6 \u0418\u043d\u0441\u0442\u0440\u0443\u043a\u0446\u0438\u0438',
    menu_btn_faq: '\u2753 \u0427\u0410\u0412\u041e',
    menu_btn_support: '\ud83d\udd27 \u041f\u043e\u0434\u0434\u0435\u0440\u0436\u043a\u0430',
    menu_btn_profile: '\ud83d\udc64 \u041f\u0440\u043e\u0444\u0438\u043b\u044c',
    menu_btn_community: '\ud83c\udf0d \u0421\u043e\u043e\u0431\u0449\u0435\u0441\u0442\u0432\u043e',
    menu_btn_admin: '\ud83d\udd35 \u0410\u0434\u043c\u0438\u043d \u043f\u0430\u043d\u0435\u043b\u044c',
    admin_menu_title: '\ud83d\udd35 <b>\u0410\u0434\u043c\u0438\u043d \u043f\u0430\u043d\u0435\u043b\u044c</b>\n\n\u0418\u0441\u043f\u043e\u043b\u044c\u0437\u0443\u0439\u0442\u0435 \u043a\u043d\u043e\u043f\u043a\u0438 \u043d\u0438\u0436\u0435 \u0438\u043b\u0438 \u0432\u0432\u043e\u0434\u0438\u0442\u0435 \u043a\u043e\u043c\u0430\u043d\u0434\u044b:',
    admin_btn_panel: '\ud83d\udcca \u0414\u0430\u0448\u0431\u043e\u0440\u0434',
    admin_btn_pending: '\u23f3 \u041e\u0436\u0438\u0434\u0430\u044e\u0442',
    admin_btn_history: '\uD83D\uDCC4 \u0418\u0441\u0442\u043e\u0440\u0438\u044f',
    admin_btn_promos: '\ud83c\udfab \u041f\u0440\u043e\u043c\u043e',
    admin_btn_import: '\u2705 \u0418\u043c\u043f\u043e\u0440\u0442',
    admin_btn_genkeys: '\ud83d\udd11 \u0421\u0433\u0435\u043d 10',
    admin_btn_crypto: '\ud83d\udc8e \u0422\u0435\u0441\u0442 Crypto',
    plan_title: '\ud83d\udc51 <b>\u041d\u0430\u0432\u0441\u0435\u0433\u0434\u0430</b>',
    plan_price: '\ud83d\udcb0 <b>5 USDT</b>',
    plan_desc: '<i>\u041e\u0434\u0438\u043d \u043f\u043b\u0430\u0442\u0435\u0436 \u2022 \u0411\u0435\u0437 \u043b\u0438\u043c\u0438\u0442\u043e\u0432 \u2022 \u041d\u0430\u0432\u0441\u0435\u0433\u0434\u0430</i>',
    choose_payment: '<i>\u0412\u044b\u0431\u0435\u0440\u0438\u0442\u0435 \u043e\u043f\u043b\u0430\u0442\u0443:</i>',
    crypto: '\ud83d\udc8e CryptoBot (USDT)',
    back: '\u2190 \u041d\u0430\u0437\u0430\u0434',
    creating: '\u23f3 <b>\u0421\u043e\u0437\u0434\u0430\u0451\u043c \u0438\u043d\u0432\u043e\u0439\u0441...</b>',
    crypto_pay_title: '\ud83d\udc8e CryptoBot (USDT)',
    crypto_pay_info: '<i>\u041d\u0430\u0436\u043c\u0438\u0442\u0435 \u043a\u043d\u043e\u043f\u043a\u0443 \u0434\u043b\u044f \u043e\u043f\u043b\u0430\u0442\u044b</i>',
    pay_usdt: '\ud83d\udcb3 \u041e\u043f\u043b\u0430\u0442\u0438\u0442\u044c 5 USDT',
    card_transfer: '\ud83c\udfe6 \u041f\u0435\u0440\u0435\u0432\u043e\u0434 \u043d\u0430 \u043a\u0430\u0440\u0442\u0443',
    card_transfer_title: '\ud83c\udfe6 \u041f\u0435\u0440\u0435\u0432\u043e\u0434 \u043d\u0430 \u043a\u0430\u0440\u0442\u0443',
    card_transfer_info: '\u041e\u0442\u043f\u0440\u0430\u0432\u044c\u0442\u0435 <b>150 UAH</b> \u043d\u0430 \u043a\u0430\u0440\u0442\u0443 \u043d\u0438\u0436\u0435, \u0437\u0430\u0442\u0435\u043c \u043d\u0430\u0436\u043c\u0438\u0442\u0435 "\u041e\u043f\u043b\u0430\u0442\u0438\u043b":\n\n<code>{details}</code>',
    card_transfer_sent: '\u2705 \u041e\u043f\u043b\u0430\u0442\u0438\u043b',
    card_transfer_await: '\u23f3 \u041f\u043b\u0430\u0442\u0451\u0436 <b>#{id}</b> \u043e\u0436\u0438\u0434\u0430\u0435\u0442 \u043f\u043e\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043d\u0438\u044f.\n\n\u0410\u0434\u043c\u0438\u043d \u043f\u0440\u043e\u0432\u0435\u0440\u0438\u0442 \u0438 \u043e\u0442\u043f\u0440\u0430\u0432\u0438\u0442 \u043a\u043b\u044e\u0447 \u0432 \u0431\u043b\u0438\u0436\u0430\u0439\u0448\u0435\u0435 \u0432\u0440\u0435\u043c\u044f.',
    card_transfer_approve: '\u2705 \u041f\u043e\u0434\u0442\u0432\u0435\u0440\u0434\u0438\u0442\u044c',
    card_transfer_reject: '\u274c \u041e\u0442\u043a\u043b\u043e\u043d\u0438\u0442\u044c',
    pending_title: '\u23f3 <b>\u041e\u0436\u0438\u0434\u0430\u044e\u0442 \u043f\u043e\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043d\u0438\u044f:</b>',
    pending_empty: '\u041d\u0435\u0442 \u043e\u0436\u0438\u0434\u0430\u044e\u0449\u0438\u0445 \u043f\u043b\u0430\u0442\u0435\u0436\u0435\u0439.',
    success: '\u2705 <b>\u041e\u043f\u043b\u0430\u0442\u0430 \u043f\u0440\u043e\u0448\u043b\u0430!</b>',
    success_info: '\u041a\u043b\u044e\u0447: <code>{key}</code>\n\n\u041e\u0442\u043a\u0440\u043e\u0439\u0442\u0435 <b>EncodeX</b> \u2192 <b>\u041f\u0440\u043e\u0444\u0438\u043b\u044c</b> \u2192 <b>\u0410\u043a\u0442\u0438\u0432\u0430\u0446\u0438\u044f</b>',
    timeout: '\u274c <b>\u0422\u0430\u0439\u043c\u0430\u0443\u0442</b>\nCryptoBot API \u043d\u0435 \u043e\u0442\u0432\u0435\u0442\u0438\u043b \u0437\u0430 15\u0441',
    err_no_token: '\u274c \u0422\u043e\u043a\u0435\u043d Crypto \u043d\u0435 \u043d\u0430\u0441\u0442\u0440\u043e\u0435\u043d',
    err_plan: '\u274c \u041e\u0448\u0438\u0431\u043a\u0430 CryptoBot:\n<code>{data}</code>',
    err_exc: '\u274c <b>\u041e\u0448\u0438\u0431\u043a\u0430</b>\n<code>{msg}</code>',
    err_crypto: '\u274c \u041e\u0448\u0438\u0431\u043a\u0430 CryptoBot:\n<code>{data}</code>',
    stats: '\ud83d\udcca <b>\u0421\u0442\u0430\u0442\u0438\u0441\u0442\u0438\u043a\u0430:</b> {n}',
    genkeys: '\ud83d\udd11 <b>\u0421\u0433\u0435\u043d\u0435\u0440\u0438\u0440\u043e\u0432\u0430\u043d\u043e 10 \u043a\u043b\u044e\u0447\u0435\u0439:</b>\n<code>{keys}</code>',
    import_ok: '\u2705 \u0418\u043c\u043f\u043e\u0440\u0442\u0438\u0440\u043e\u0432\u0430\u043d\u043e <b>{n}</b> \u043a\u043b\u044e\u0447\u0435\u0439. {dup} \u0434\u0443\u0431\u043b\u0438\u043a\u0430\u0442\u043e\u0432 \u043f\u0440\u043e\u043f\u0443\u0449\u0435\u043d\u043e.',
    import_usage: '\u0418\u0441\u043f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u043d\u0438\u0435:\n/import <code>\u041a041042e042e042711 \u041a041042e042e042712</code>',
    promo_btn: '\ud83c\udfab \u041f\u0440\u043e\u043c\u043e\u043a\u043e\u0434',
    promo_ask: '\u041e\u0442\u043f\u0440\u0430\u0432\u044c\u0442\u0435 \u043f\u0440\u043e\u043c\u043e\u043a\u043e\u0434:',
    promo_invalid: '\u274c \u041d\u0435\u0432\u0435\u0440\u043d\u044b\u0439 \u0438\u043b\u0438 \u043f\u0440\u043e\u0441\u0440\u043e\u0447\u0435\u043d\u043d\u044b\u0439 \u043f\u0440\u043e\u043c\u043e\u043a\u043e\u0434.',
    promo_valid: '\u2705 \u041f\u0440\u043e\u043c\u043e\u043a\u043e\u0434 <b>{code}</b> \u043f\u0440\u0438\u043c\u0435\u043d\u0451\u043d! \u0421\u043a\u0438\u0434\u043a\u0430: <b>{d}%</b>',
    promo_used: '\u26a0\ufe0f \u041b\u0438\u043c\u0438\u0442 \u0438\u0441\u043f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u043d\u0438\u0439 \u043f\u0440\u043e\u043c\u043e\u043a\u043e\u0434\u0430 \u0438\u0441\u0447\u0435\u0440\u043f\u0430\u043d.',
    promo_active: '\u2705 \u0410\u043a\u0442\u0438\u0432\u043d\u044b\u0439 \u043f\u0440\u043e\u043c\u043e\u043a\u043e\u0434: <b>{code}</b> (\u0441\u043a\u0438\u0434\u043a\u0430 {d}%)',
    promo_title: '\ud83c\udfab <b>\u041f\u0440\u043e\u043c\u043e\u043a\u043e\u0434\u044b</b>',
    promo_empty: '\u041d\u0435\u0442 \u0441\u043e\u0437\u0434\u0430\u043d\u043d\u044b\u0445 \u043f\u0440\u043e\u043c\u043e\u043a\u043e\u0434\u043e\u0432.',
    promo_list: '\ud83c\udfab <b>\u041f\u0440\u043e\u043c\u043e\u043a\u043e\u0434\u044b:</b>\n{list}',
    promo_line: '<code>{code}</code> \u2014 \u0441\u043a\u0438\u0434\u043a\u0430 {d}%, {uses}/{max} \u0438\u0441\u043f.',
    promo_created: '\u2705 \u041f\u0440\u043e\u043c\u043e\u043a\u043e\u0434 <b>{code}</b> \u0441\u043e\u0437\u0434\u0430\u043d: \u0441\u043a\u0438\u0434\u043a\u0430 {d}%, {max} \u0438\u0441\u043f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u043d\u0438\u0439.',
    promo_deleted: '\u274c \u041f\u0440\u043e\u043c\u043e\u043a\u043e\u0434 <b>{code}</b> \u0443\u0434\u0430\u043b\u0451\u043d.',
    promo_delete_fail: '\u274c \u041f\u0440\u043e\u043c\u043e\u043a\u043e\u0434 <b>{code}</b> \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d.',
    createpromo_usage: '\u0418\u0441\u043f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u043d\u0438\u0435:\n/createpromo <code>\u041d04104170416 \u0421\u043a\u0438\u0434\u043a\u0430% \u041a\u043e\u043b-\u0432\u043e</code>',
    history_title: '\uD83D\uDCC4 <b>\u0418\u0441\u0442\u043e\u0440\u0438\u044f \u043f\u043e\u043a\u0443\u043f\u043e\u043a</b>\n{list}',
    history_empty: '\u041f\u043e\u043a\u0443\u043f\u043e\u043a \u0435\u0449\u0451 \u043d\u0435\u0442.',
    history_line: '<code>{key}</code> \u2192 {name} ({method}){promo}\n',
    panel_title: '\ud83d\udcca <b>\u0410\u0434\u043c\u0438\u043d \u043f\u0430\u043d\u0435\u043b\u044c</b>\n\n{n}\n\u23f3 \u041e\u0436\u0438\u0434\u0430\u0435\u0442: {pending}\n\ud83c\udfab \u0410\u043a\u0442\u0438\u0432\u043d\u044b\u0445 \u043f\u0440\u043e\u043c\u043e: {promos}\n\n\ud83d\udc41 /panel \u2014 \u043e\u0431\u043d\u043e\u0432\u0438\u0442\u044c\n/import \u2014 \u043a\u043b\u044e\u0447\u0438\n/createpromo \u2014 \u043f\u0440\u043e\u043c\u043e\n/promos \u2014 \u0441\u043f\u0438\u0441\u043e\u043a\n/history \u2014 \u043f\u043e\u043a\u0443\u043f\u043a\u0438',
    approved: '\u041f\u043b\u0430\u0442\u0451\u0436 #{id} \u043f\u043e\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0451\u043d. \u041a\u043b\u044e\u0447 \u043e\u0442\u043f\u0440\u0430\u0432\u043b\u0435\u043d.',
    rejected: '\u041f\u043b\u0430\u0442\u0451\u0436 #{id} \u043e\u0442\u043a\u043b\u043e\u043d\u0451\u043d.',
    profile_title: '\ud83d\udc64 <b>\u0412\u0430\u0448 \u043f\u0440\u043e\u0444\u0438\u043b\u044c</b>',
    profile_id: '\ud83d\udd11 ID: <code>{id}</code>',
    profile_name: '\ud83d\udcdd \u0418\u043c\u044f: <b>{name}</b>',
    profile_lang: '\ud83c\udf10 \u042f\u0437\u044b\u043a: <b>\u0420\u0443\u0441\u0441\u043a\u0438\u0439</b>',
    profile_status: '\ud83d\udfe2 \u0421\u0442\u0430\u0442\u0443\u0441: <b>\u0411\u0435\u0441\u043f\u043b\u0430\u0442\u043d\u044b\u0439</b>',
    profile_status_premium: '\ud83d\udfe1 \u0421\u0442\u0430\u0442\u0443\u0441: <b>Premium</b>',
    profile_no_keys: '\u0423 \u0432\u0430\u0441 \u0435\u0449\u0451 \u043d\u0435\u0442 \u0430\u043a\u0442\u0438\u0432\u043d\u044b\u0445 \u043b\u0438\u0446\u0435\u043d\u0437\u0438\u0439.',
    licenses_title: '\ud83d\udccb <b>\u041c\u043e\u0438 \u043b\u0438\u0446\u0435\u043d\u0437\u0438\u0438</b>',
    licenses_empty: '\u0423 \u0432\u0430\u0441 \u0435\u0449\u0451 \u043d\u0435\u0442 \u0430\u043a\u0442\u0438\u0432\u043d\u044b\u0445 \u043b\u0438\u0446\u0435\u043d\u0437\u0438\u0439.\n\n\u041d\u0430\u0436\u043c\u0438\u0442\u0435 <b>\u041a\u0443\u043f\u0438\u0442\u044c Premium</b>, \u0447\u0442\u043e\u0431\u044b \u043f\u0440\u0438\u043e\u0431\u0440\u0435\u0441\u0442\u0438 \u043b\u0438\u0446\u0435\u043d\u0437\u0438\u044e!',
    licenses_key: '\ud83d\udd11 \u041a\u043b\u044e\u0447: <code>{key}</code>\n\u2728 \u041c\u0435\u0442\u043e\u0434: {method}\n\ud83d\udcc5 \u0414\u0430\u0442\u0430: {date}',
    instructions_title: '\ud83d\udcd6 <b>\u0418\u043d\u0441\u0442\u0440\u0443\u043a\u0446\u0438\u0438</b>',
    instructions_text: '1. \ud83d\udfe2 <b>\u041f\u043e\u043a\u0443\u043f\u043a\u0430</b> \u2014 \u041f\u0440\u0438\u043e\u0431\u0440\u0435\u0442\u0438\u0442\u0435 \u043b\u0438\u0446\u0435\u043d\u0437\u0438\u044e \u0447\u0435\u0440\u0435\u0437 CryptoBot \u0438\u043b\u0438 \u043f\u0435\u0440\u0435\u0432\u043e\u0434 \u043d\u0430 \u043a\u0430\u0440\u0442\u0443\n2. \ud83d\udd11 <b>\u041f\u043e\u043b\u0443\u0447\u0435\u043d\u0438\u0435</b> \u2014 \u041a\u043b\u044e\u0447 \u043f\u0440\u0438\u0445\u043e\u0434\u0438\u0442 \u0430\u0432\u0442\u043e\u043c\u0430\u0442\u0438\u0447\u0435\u0441\u043a\u0438 \u043f\u043e\u0441\u043b\u0435 \u043e\u043f\u043b\u0430\u0442\u044b\n3. \ud83d\udd0c <b>\u0410\u043a\u0442\u0438\u0432\u0430\u0446\u0438\u044f</b> \u2014 \u041e\u0442\u043a\u0440\u043e\u0439\u0442\u0435 EncodeX \u2192 \u041f\u0440\u043e\u0444\u0438\u043b\u044c \u2192 \u0410\u043a\u0442\u0438\u0432\u0430\u0446\u0438\u044f\n4. \u2705 <b>\u0413\u043e\u0442\u043e\u0432\u043e!</b> \u2014 \u041f\u043e\u043b\u044c\u0437\u0443\u0439\u0442\u0435\u0441\u044c \u0431\u0435\u0437 \u043e\u0433\u0440\u0430\u043d\u0438\u0447\u0435\u043d\u0438\u0439',
    faq_title: '\u2753 <b>\u0427\u0410\u0412\u041e</b>',
    faq_q1: '\u25b6\ufe0f \u0427\u0442\u043e \u0442\u0430\u043a\u043e\u0435 EncodeX?',
    faq_a1: 'EncodeX \u043e\u0431\u0445\u043e\u0434\u0438\u0442 \u0441\u0436\u0430\u0442\u0438\u0435 TikTok, \u0441\u043e\u0445\u0440\u0430\u043d\u044f\u044f \u043a\u0430\u0447\u0435\u0441\u0442\u0432\u043e \u0432\u0438\u0434\u0435\u043e \u0441 \u0432\u0430\u0442\u0435\u0440\u043c\u0430\u0440\u043a\u043e\u0439 <code>@encodexhd</code>.',
    faq_q2: '\u25b6\ufe0f \u041a\u0430\u043a \u0430\u043a\u0442\u0438\u0432\u0438\u0440\u043e\u0432\u0430\u0442\u044c \u043a\u043b\u044e\u0447?',
    faq_a2: '\u041e\u0442\u043a\u0440\u043e\u0439\u0442\u0435 EncodeX \u2192 \u041f\u0440\u043e\u0444\u0438\u043b\u044c \u2192 \u0410\u043a\u0442\u0438\u0432\u0430\u0446\u0438\u044f \u2192 \u0432\u0441\u0442\u0430\u0432\u044c\u0442\u0435 \u043a\u043b\u044e\u0447.',
    faq_q3: '\u25b6\ufe0f \u042d\u0442\u043e \u0431\u0435\u0437\u043b\u0438\u043c\u0438\u0442\u043d\u043e?',
    faq_a3: '\u0414\u0430! \u041b\u0438\u0446\u0435\u043d\u0437\u0438\u044f \u043d\u0430\u0432\u0441\u0435\u0433\u0434\u0430 = \u0431\u0435\u0437\u043b\u0438\u043c\u0438\u0442\u043d\u043e\u0435 \u0432\u0438\u0434\u0435\u043e, \u0431\u0435\u0437 \u043e\u0433\u0440\u0430\u043d\u0438\u0447\u0435\u043d\u0438\u0439.',
    faq_q4: '\u25b6\ufe0f \u041a\u0430\u043a\u0438\u0435 \u0441\u043f\u043e\u0441\u043e\u0431\u044b \u043e\u043f\u043b\u0430\u0442\u044b?',
    faq_a4: 'CryptoBot (USDT) \u0438\u043b\u0438 \u043f\u0435\u0440\u0435\u0432\u043e\u0434 \u043d\u0430 \u043a\u0430\u0440\u0442\u0443.',
    support_title: '\ud83d\udd27 <b>\u041f\u043e\u0434\u0434\u0435\u0440\u0436\u043a\u0430</b>',
    support_text: '\u041f\u0440\u043e\u0431\u043b\u0435\u043c\u044b? \u0421\u0432\u044f\u0436\u0438\u0442\u0435\u0441\u044c \u0441 \u043d\u0430\u043c\u0438:\n\n\ud83d\udcac @plopaja\n\u2709\ufe0f <a href="https://t.me/plopaja">\u041e\u0442\u043a\u0440\u044b\u0442\u044c \u0447\u0430\u0442</a>\n\n\u041e\u0442\u0432\u0435\u0447\u0430\u0435\u043c \u0432 \u0442\u0435\u0447\u0435\u043d\u0438\u0438 24 \u0447\u0430\u0441\u043e\u0432.',
    community_title: '\ud83c\udf0d <b>\u0421\u043e\u043e\u0431\u0449\u0435\u0441\u0442\u0432\u043e</b>',
    community_text: '\u041f\u0440\u0438\u0441\u043e\u0435\u0434\u0438\u043d\u044f\u0439\u0442\u0435\u0441\u044c!\n\n\ud83d\udc65 <a href="https://t.me/encodexchat">\u0427\u0430\u0442</a>\n\ud83d\udce2 <a href="https://t.me/encodexhd">\u041a\u0430\u043d\u0430\u043b \u043d\u043e\u0432\u043e\u0441\u0442\u0435\u0439</a>'
  }
};

function buildMenu(t, userId) {
  const kb = new InlineKeyboard()
    .text(t.menu_btn_buy, 'menu_buy').text(t.menu_btn_licenses, 'menu_licenses').row()
    .text(t.menu_btn_instructions, 'menu_instructions').text(t.menu_btn_faq, 'menu_faq').row()
    .text(t.menu_btn_support, 'menu_support').text(t.menu_btn_profile, 'menu_profile').row()
    .text(t.menu_btn_community, 'menu_community');
  if (userId && ADMIN_IDS.includes(Number(userId))) {
    kb.row().text(t.menu_btn_admin, 'menu_admin');
  }
  return kb;
}

function mainMenuText(t, premium) {
  const status = premium ? '\ud83d\udfe1' : '\ud83d\udfe2';
  const statusText = premium ? 'Premium \u2714\ufe0f' : 'Free';
  return t.menu_main + '\n\n' + status + ' Status: <b>' + statusText + '</b>';
}

function hasLicense(userId) {
  return Object.values(store.keys).some(k => String(k.userId) === String(userId));
}

function getUserKeys(userId) {
  return Object.values(store.keys).filter(k => String(k.userId) === String(userId));
}

bot.command('start', async (ctx) => {
  const id = ctx.from.id;
  if (userLang.has(id)) {
    const lang = userLang.get(id);
    const t = L[lang];
    await ctx.reply(
      t.welcome_back + '\n\n' + mainMenuText(t, hasLicense(id)),
      { parse_mode: 'HTML', reply_markup: buildMenu(t, ctx.from.id) }
    );
    return;
  }
  const kb = new InlineKeyboard()
    .text('\ud83c\uddf7\ud83c\uddfa \u0420\u0443\u0441\u0441\u043a\u0438\u0439', 'lang_ru')
    .text('\ud83c\uddfa\ud83c\uddf8 English', 'lang_en');
  await ctx.reply(L.en.lang_pick, { parse_mode: 'HTML', reply_markup: kb });
});

bot.callbackQuery(/^lang_(ru|en)$/, async (ctx) => {
  const lang = ctx.match[1];
  userLang.set(ctx.from.id, lang);
  const t = L[lang];
  const isFirst = ctx.callbackQuery.message?.reply_markup?.inline_keyboard?.flat()?.some(b => b.callback_data === 'lang_ru' || b.callback_data === 'lang_en');
  await ctx.editMessageText(
    (isFirst ? t.welcome : t.welcome_back) + '\n\n' + mainMenuText(t, hasLicense(ctx.from.id)),
    { parse_mode: 'HTML', reply_markup: buildMenu(t, ctx.from.id) }
  );
  await ctx.answerCallbackQuery();
});

bot.callbackQuery(/^menu_main$/, async (ctx) => {
  const t = L[getLang(ctx)];
  await ctx.editMessageText(
    mainMenuText(t, hasLicense(ctx.from.id)),
    { parse_mode: 'HTML', reply_markup: buildMenu(t, ctx.from.id) }
  ).catch(() => {});
  await ctx.answerCallbackQuery();
});

bot.callbackQuery(/^menu_buy$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const t = L[getLang(ctx)];
  const kb = new InlineKeyboard();
  if (CRYPTOBOT_TOKEN) kb.text(t.crypto, 'pay_crypto_lifetime');
  kb.text(t.card_transfer, 'pay_card_transfer_lifetime');
  kb.row().text(t.promo_btn, 'promo_enter');
  kb.row().text(t.back, 'back_start');
  await ctx.editMessageText(
    t.plan_title + '\n\n' + t.plan_price + '\n' + t.plan_desc + '\n\n' + t.choose_payment,
    { parse_mode: 'HTML', reply_markup: kb }
  ).catch(() => {});
});

bot.callbackQuery(/^buy_lifetime$/, async (ctx) => {
  const t = L[getLang(ctx)];
  const kb = new InlineKeyboard();
  if (CRYPTOBOT_TOKEN) kb.text(t.crypto, 'pay_crypto_lifetime');
  kb.text(t.card_transfer, 'pay_card_transfer_lifetime');
  kb.row().text(t.promo_btn, 'promo_enter');
  kb.row().text(t.back, 'back_start');
  await ctx.editMessageText(
    t.plan_title + '\n\n' + t.plan_price + '\n' + t.plan_desc + '\n\n' + t.choose_payment,
    { parse_mode: 'HTML', reply_markup: kb }
  ).catch(() => {});
  await ctx.answerCallbackQuery();
});

bot.callbackQuery(/^promo_enter$/, async (ctx) => {
  const t = L[getLang(ctx)];
  promoEntry.add(ctx.from.id);
  const kb = new InlineKeyboard().text(t.back, 'buy_lifetime');
  let txt = t.promo_ask;
  if (userPromo.has(ctx.from.id)) {
    const code = userPromo.get(ctx.from.id);
    const p = promoCodes.get(code);
    txt = t.promo_active.replace('{code}', code).replace('{d}', p?.discount || '?') + '\n\n' + t.promo_ask;
  }
  await ctx.editMessageText(t.promo_btn + '\n\n' + txt, { parse_mode: 'HTML', reply_markup: kb }).catch(() => {});
  await ctx.answerCallbackQuery();
});

bot.on('message:text', async (ctx) => {
  if (!promoEntry.has(ctx.from.id)) return;
  const text = ctx.message.text.trim();
  if (text.startsWith('/')) return;
  promoEntry.delete(ctx.from.id);
  const t = L[getLang(ctx)];
  const code = text.toUpperCase();
  if (!promoCodes.has(code)) {
    await ctx.reply(t.promo_invalid, { parse_mode: 'HTML' });
    return;
  }
  const promo = promoCodes.get(code);
  if (promo.uses >= promo.maxUses) {
    await ctx.reply(t.promo_used, { parse_mode: 'HTML' });
    return;
  }
  userPromo.set(ctx.from.id, code);
  await ctx.reply(t.promo_valid.replace('{code}', code).replace('{d}', promo.discount), { parse_mode: 'HTML' });
});

bot.callbackQuery(/^pay_crypto_lifetime$/, async (ctx) => {
  const t = L[getLang(ctx)];
  if (!CRYPTOBOT_TOKEN) {
    await ctx.editMessageText(t.err_no_token).catch(() => {});
    await ctx.answerCallbackQuery();
    return;
  }
  await ctx.answerCallbackQuery();

  const promoCode = userPromo.get(ctx.from.id);
  let promo = null;
  let amount = 5;
  if (promoCode && promoCodes.has(promoCode)) {
    promo = promoCodes.get(promoCode);
    if (promo.uses >= promo.maxUses) { userPromo.delete(ctx.from.id); promo = null; }
    else amount = promo.discount === 100 ? 0.1 : +(5 * (100 - promo.discount) / 100).toFixed(2);
  }

  const msg = await ctx.reply(t.creating, { parse_mode: 'HTML' });

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    const res = await fetch('https://pay.crypt.bot/api/createInvoice', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Crypto-Pay-API-Token': CRYPTOBOT_TOKEN },
      body: JSON.stringify({
        asset: 'USDT',
        amount: String(amount),
        description: 'EncodeX Premium' + (promo ? ' (-' + promo.discount + '%)' : '') + ' \u2014 Lifetime',
        paid_btn_name: 'openBot',
        paid_btn_url: 'https://t.me/' + (BOT_USERNAME || 'encodex_bot'),
        payload: 'crypto_lifetime_' + ctx.from.id + (promo ? '_' + promoCode : '')
      }),
      signal: controller.signal
    });
    clearTimeout(timer);
    const data = await res.json();
    if (!data.ok) {
      await ctx.api.editMessageText(msg.chat.id, msg.message_id,
        t.err_crypto.replace('{data}', esc(JSON.stringify(data))),
        { parse_mode: 'HTML' }
      ).catch(() => {});
      return;
    }
    const priceLine = amount + ' USDT' + (promo ? ' (\u2193' + promo.discount + '%)' : '');
    await ctx.api.editMessageText(msg.chat.id, msg.message_id,
      '<b>' + t.crypto_pay_title + '</b>\n\n' + priceLine + '\n\n' + t.crypto_pay_info,
      {
        parse_mode: 'HTML',
        reply_markup: new InlineKeyboard()
          .url(t.pay_usdt, data.result.bot_invoice_url).row()
          .text(t.back, 'buy_lifetime')
      }
    );
  } catch (e) {
    await ctx.api.editMessageText(msg.chat.id, msg.message_id,
      e.name === 'AbortError' ? t.timeout : t.err_exc.replace('{msg}', esc(e.message || String(e))),
      { parse_mode: 'HTML' }
    ).catch(() => {});
  }
});

bot.callbackQuery(/^pay_card_transfer_lifetime$/, async (ctx) => {
  const t = L[getLang(ctx)];
  const promoCode = userPromo.get(ctx.from.id);
  let priceText = '150 UAH';
  if (promoCode && promoCodes.has(promoCode)) {
    const promo = promoCodes.get(promoCode);
    if (promo.uses < promo.maxUses) {
      priceText = (promo.discount === 100 ? 1 : Math.round(150 * (100 - promo.discount) / 100)) + ' UAH (\u2193' + promo.discount + '%)';
    } else {
      userPromo.delete(ctx.from.id);
    }
  }
  await ctx.editMessageText(
    '<b>' + t.card_transfer_title + '</b>\n\n' + priceText + '\n\n' + t.card_transfer_info.replace('{details}', esc(CARD_DETAILS)),
    {
      parse_mode: 'HTML',
      reply_markup: new InlineKeyboard()
        .text(t.card_transfer_sent, 'card_transfer_done')
        .row()
        .text(t.back, 'buy_lifetime')
    }
  ).catch(() => {});
  await ctx.answerCallbackQuery();
});

bot.callbackQuery(/^card_transfer_done$/, async (ctx) => {
  const lang = getLang(ctx);
  awaitingReceipt.add(ctx.from.id);
  await ctx.editMessageText(
    (lang === 'ru' ? '\ud83c\udfe6' : '\ud83c\udfe6') + ' ' + (lang === 'ru' ? '\u041e\u0442\u043f\u0440\u0430\u0432\u044c\u0442\u0435 \u0444\u043e\u0442\u043e \u043a\u0432\u0438\u0442\u0430\u043d\u0446\u0438\u0438 \u043e\u0431 \u043e\u043f\u043b\u0430\u0442\u0435' : 'Send a photo of the payment receipt'),
    { parse_mode: 'HTML' }
  ).catch(() => {});
  await ctx.answerCallbackQuery();
});

bot.on(':photo', async (ctx) => {
  if (!awaitingReceipt.has(ctx.from.id)) return;
  awaitingReceipt.delete(ctx.from.id);
  const lang = getLang(ctx);
  const t = L[lang];
  const id = ++pendingIdCounter;
  const userId = ctx.from.id;
  const promoCode = userPromo.get(userId) || null;
  const msg = await ctx.reply(t.card_transfer_await.replace('{id}', id), { parse_mode: 'HTML' });
  pendingPayments.set(id, { id, userId, name: ctx.from.first_name || 'User', lang, promoCode, photoMsgId: msg.message_id, chatId: msg.chat.id });

  const fileId = ctx.msg.photo[ctx.msg.photo.length - 1].file_id;
  for (const adminId of ADMIN_IDS) {
    try {
      await bot.api.sendPhoto(adminId, fileId, {
        caption: '\ud83d\udcb3 ' + (lang === 'ru' ? '\u041d\u043e\u0432\u044b\u0439 \u043f\u043b\u0430\u0442\u0451\u0436' : 'New payment') + ' #' + id + '\n\ud83d\udc64 ' + (ctx.from.first_name || 'User') + ' (ID: ' + userId + ')',
        reply_markup: new InlineKeyboard()
          .text(t.card_transfer_approve, 'approve_payment_' + id)
          .text(t.card_transfer_reject, 'reject_payment_' + id)
      });
    } catch {}
  }
});

bot.callbackQuery(/^approve_payment_(\d+)$/, async (ctx) => {
  if (!ADMIN_IDS.includes(ctx.from.id)) { await ctx.answerCallbackQuery(); return; }
  const id = Number(ctx.match[1]);
  const p = pendingPayments.get(id);
  if (!p) { await ctx.answerCallbackQuery('Not found'); return; }
  pendingPayments.delete(id);
  const t = L[p.lang || 'en'];
  const key = issueKey(String(p.userId), p.name, 'card_transfer');

  if (p.promoCode && promoCodes.has(p.promoCode)) promoCodes.get(p.promoCode).uses++;
  addHistory({ key, userId: String(p.userId), name: p.name, method: 'card_transfer', promo: p.promoCode || null });

  try {
    await bot.api.sendMessage(p.userId,
      t.success + '\n\n' + t.success_info.replace('{key}', key),
      { parse_mode: 'HTML' }
    );
  } catch {}
  await ctx.editMessageCaption({
    caption: (ctx.msg?.caption || '') + '\n\n\u2705 ' + t.approved.replace('{id}', id)
  }).catch(() => {});
  await ctx.answerCallbackQuery(t.approved.replace('{id}', id));
});

bot.callbackQuery(/^reject_payment_(\d+)$/, async (ctx) => {
  if (!ADMIN_IDS.includes(ctx.from.id)) { await ctx.answerCallbackQuery(); return; }
  const id = Number(ctx.match[1]);
  const p = pendingPayments.get(id);
  if (!p) { await ctx.answerCallbackQuery('Not found'); return; }
  pendingPayments.delete(id);
  const t = L[p.lang || 'en'];
  try {
    await bot.api.sendMessage(p.userId,
      t.rejected.replace('{id}', id) + '\n\n' + (p.lang === 'ru' ? '\u0421\u0432\u044f\u0436\u0438\u0442\u0435\u0441\u044c \u0441 @plopaja' : 'Contact @plopaja'),
      { parse_mode: 'HTML' }
    );
  } catch {}
  await ctx.editMessageCaption({
    caption: (ctx.msg?.caption || '') + '\n\n\u274c ' + t.rejected.replace('{id}', id)
  }).catch(() => {});
  await ctx.answerCallbackQuery(t.rejected.replace('{id}', id));
});

bot.callbackQuery(/^back_start$/, async (ctx) => {
  const t = L[getLang(ctx)];
  await ctx.editMessageText(
    mainMenuText(t, hasLicense(ctx.from.id)),
    { parse_mode: 'HTML', reply_markup: buildMenu(t, ctx.from.id) }
  ).catch(() => {});
  await ctx.answerCallbackQuery();
});

bot.callbackQuery(/^menu_profile$/, async (ctx) => {
  const t = L[getLang(ctx)];
  const id = ctx.from.id;
  const premium = hasLicense(id);
  const txt = t.profile_title + '\n\n' +
    t.profile_id.replace('{id}', id) + '\n' +
    t.profile_name.replace('{name}', esc(ctx.from.first_name || 'User')) + '\n' +
    (getLang(ctx) === 'ru' ? '\ud83c\udf10 \u042f\u0437\u044b\u043a: <b>\u0420\u0443\u0441\u0441\u043a\u0438\u0439</b>' : t.profile_lang) + '\n' +
    (premium ? t.profile_status_premium : t.profile_status) + '\n\n' +
    (premium ? '' : t.profile_no_keys);
  await ctx.editMessageText(txt, {
    parse_mode: 'HTML',
    reply_markup: new InlineKeyboard()
      .text('\ud83d\udc8e ' + (getLang(ctx) === 'ru' ? '\u041a\u0443\u043f\u0438\u0442\u044c Premium' : 'Buy Premium'), 'menu_buy').row()
      .text(t.back, 'menu_main')
  }).catch(() => {});
  await ctx.answerCallbackQuery();
});

bot.callbackQuery(/^menu_licenses$/, async (ctx) => {
  const t = L[getLang(ctx)];
  const keys = getUserKeys(ctx.from.id);
  let txt;
  if (!keys.length) {
    txt = t.licenses_title + '\n\n' + t.licenses_empty;
  } else {
    txt = t.licenses_title + '\n\n' + keys.map(k =>
      t.licenses_key
        .replace('{key}', k.key)
        .replace('{method}', k.method)
        .replace('{date}', new Date(k.time).toLocaleDateString(getLang(ctx) === 'ru' ? 'ru-RU' : 'en-US'))
    ).join('\n\n');
  }
  await ctx.editMessageText(txt, {
    parse_mode: 'HTML',
    reply_markup: new InlineKeyboard()
      .text('\ud83d\udc8e ' + (getLang(ctx) === 'ru' ? '\u041a\u0443\u043f\u0438\u0442\u044c Premium' : 'Buy Premium'), 'menu_buy').row()
      .text(t.back, 'menu_main')
  }).catch(() => {});
  await ctx.answerCallbackQuery();
});

bot.callbackQuery(/^menu_instructions$/, async (ctx) => {
  const t = L[getLang(ctx)];
  await ctx.editMessageText(t.instructions_title + '\n\n' + t.instructions_text, {
    parse_mode: 'HTML',
    reply_markup: new InlineKeyboard().text(t.back, 'menu_main')
  }).catch(() => {});
  await ctx.answerCallbackQuery();
});

bot.callbackQuery(/^menu_faq$/, async (ctx) => {
  const t = L[getLang(ctx)];
  await ctx.editMessageText(
    t.faq_title + '\n\n' + t.faq_q1 + '\n' + t.faq_a1 + '\n\n' + t.faq_q2 + '\n' + t.faq_a2 + '\n\n' + t.faq_q3 + '\n' + t.faq_a3 + '\n\n' + t.faq_q4 + '\n' + t.faq_a4,
    { parse_mode: 'HTML', reply_markup: new InlineKeyboard().text(t.back, 'menu_main') }
  ).catch(() => {});
  await ctx.answerCallbackQuery();
});

bot.callbackQuery(/^menu_support$/, async (ctx) => {
  const t = L[getLang(ctx)];
  await ctx.editMessageText(t.support_title + '\n\n' + t.support_text, {
    parse_mode: 'HTML',
    reply_markup: new InlineKeyboard()
      .url('\u2709\ufe0f ' + (getLang(ctx) === 'ru' ? '\u041d\u0430\u043f\u0438\u0441\u0430\u0442\u044c' : 'Contact'), 'https://t.me/plopaja').row()
      .text(t.back, 'menu_main'),
    disable_web_page_preview: true
  }).catch(() => {});
  await ctx.answerCallbackQuery();
});

bot.callbackQuery(/^menu_community$/, async (ctx) => {
  const t = L[getLang(ctx)];
  await ctx.editMessageText(t.community_title + '\n\n' + t.community_text, {
    parse_mode: 'HTML',
    reply_markup: new InlineKeyboard()
      .url('\ud83d\udc65 ' + (getLang(ctx) === 'ru' ? '\u0427\u0430\u0442' : 'Chat'), 'https://t.me/encodexchat')
      .url('\ud83d\udce2 ' + (getLang(ctx) === 'ru' ? '\u041d\u043e\u0432\u043e\u0441\u0442\u0438' : 'News'), 'https://t.me/encodexhd').row()
      .text(t.back, 'menu_main'),
    disable_web_page_preview: true
  }).catch(() => {});
  await ctx.answerCallbackQuery();
});

// ── Admin Menu ───────────────────────────────────────

bot.callbackQuery(/^menu_admin$/, async (ctx) => {
  if (!ADMIN_IDS.includes(ctx.from.id)) return;
  const t = L[getLang(ctx)];
  await ctx.editMessageText(t.admin_menu_title, {
    parse_mode: 'HTML',
    reply_markup: new InlineKeyboard()
      .text(t.admin_btn_panel, 'ad_panel').text(t.admin_btn_pending, 'ad_pending').text(t.admin_btn_history, 'ad_history').row()
      .text(t.admin_btn_promos, 'ad_promos').text(t.admin_btn_import, 'ad_import').text(t.admin_btn_genkeys, 'ad_genkeys').row()
      .text(t.admin_btn_crypto, 'ad_testcrypto')
      .row().text(t.back, 'menu_main')
  }).catch(() => {});
  await ctx.answerCallbackQuery();
});

bot.callbackQuery(/^ad_panel$/, async (ctx) => {
  if (!ADMIN_IDS.includes(ctx.from.id)) return;
  const t = L[getLang(ctx)];
  const available = Object.values(store.keys).filter(k => !k.userId).length;
  const recent = Object.values(store.keys).sort((a, b) => b.time - a.time).slice(0, 5);
  const recentText = recent.map(e =>
    (e.userId ? '\u2705' : '\u26aa') + ' <code>' + e.key.slice(0, 16) + '...</code> ' + (e.userId ? '\u2192 ' + esc(e.name || e.userId) : '\ud83d\udfe2 free')
  ).join('\n');
  const activePromos = [...promoCodes.entries()].filter(([, p]) => p.uses < p.maxUses).length;
  await ctx.editMessageText(
    t.panel_title
      .replace('{n}', '\uD83D\uDCCA <b>Keys:</b> ' + store.total + ' total, ' + store.sold + ' sold, ' + available + ' available\n\n<b>\uD83D\uDD0D Recent:</b>\n' + recentText)
      .replace('{pending}', pendingPayments.size)
      .replace('{promos}', activePromos),
    { parse_mode: 'HTML', reply_markup: new InlineKeyboard().text(t.back, 'menu_admin') }
  ).catch(() => {});
  await ctx.answerCallbackQuery();
});

bot.callbackQuery(/^ad_pending$/, async (ctx) => {
  if (!ADMIN_IDS.includes(ctx.from.id)) return;
  const t = L[getLang(ctx)];
  if (!pendingPayments.size) {
    await ctx.editMessageText(t.pending_title + '\n' + t.pending_empty, { parse_mode: 'HTML', reply_markup: new InlineKeyboard().text(t.back, 'menu_admin') }).catch(() => {});
  } else {
    const lines = [...pendingPayments.entries()].map(([id, p]) => '#' + id + ' \u2014 \ud83d\udc64 ' + p.name + ' (ID: ' + p.userId + ')').join('\n');
    await ctx.editMessageText(t.pending_title + '\n' + lines, { parse_mode: 'HTML', reply_markup: new InlineKeyboard().text(t.back, 'menu_admin') }).catch(() => {});
  }
  await ctx.answerCallbackQuery();
});

bot.callbackQuery(/^ad_history$/, async (ctx) => {
  if (!ADMIN_IDS.includes(ctx.from.id)) return;
  const t = L[getLang(ctx)];
  if (!purchaseHistory.length) {
    await ctx.editMessageText(t.history_empty, { parse_mode: 'HTML', reply_markup: new InlineKeyboard().text(t.back, 'menu_admin') }).catch(() => {});
    await ctx.answerCallbackQuery();
    return;
  }
  const lines = purchaseHistory.slice(-30).reverse().map(e =>
    t.history_line
      .replace('{key}', e.key.slice(0, 20) + '...')
      .replace('{name}', esc(e.name || e.userId))
      .replace('{method}', e.method)
      .replace('{promo}', e.promo ? ' \ud83c\udfab ' + e.promo : '')
  ).join('');
  await ctx.editMessageText(t.history_title.replace('{list}', lines), { parse_mode: 'HTML', reply_markup: new InlineKeyboard().text(t.back, 'menu_admin') }).catch(() => {});
  await ctx.answerCallbackQuery();
});

bot.callbackQuery(/^ad_promos$/, async (ctx) => {
  if (!ADMIN_IDS.includes(ctx.from.id)) return;
  const t = L[getLang(ctx)];
  if (!promoCodes.size) {
    await ctx.editMessageText(t.promo_empty, { parse_mode: 'HTML', reply_markup: new InlineKeyboard().text(t.back, 'menu_admin') }).catch(() => {});
    await ctx.answerCallbackQuery();
    return;
  }
  const lines = [...promoCodes.entries()].map(([code, p]) =>
    t.promo_line.replace('{code}', code).replace('{d}', p.discount).replace('{uses}', p.uses).replace('{max}', p.maxUses)
  ).join('\n');
  await ctx.editMessageText(t.promo_list.replace('{list}', lines), { parse_mode: 'HTML', reply_markup: new InlineKeyboard().text(t.back, 'menu_admin') }).catch(() => {});
  await ctx.answerCallbackQuery();
});

bot.callbackQuery(/^ad_import$/, async (ctx) => {
  if (!ADMIN_IDS.includes(ctx.from.id)) return;
  const t = L[getLang(ctx)];
  await ctx.editMessageText(t.import_usage, { parse_mode: 'HTML', reply_markup: new InlineKeyboard().text(t.back, 'menu_admin') }).catch(() => {});
  await ctx.answerCallbackQuery();
});

bot.callbackQuery(/^ad_genkeys$/, async (ctx) => {
  if (!ADMIN_IDS.includes(ctx.from.id)) return;
  const t = L[getLang(ctx)];
  const keys = [];
  for (let i = 0; i < 10; i++) { const k = genKey(); saveKey(k); keys.push(k); }
  await ctx.editMessageText(t.genkeys.replace('{keys}', keys.join('\n')), { parse_mode: 'HTML', reply_markup: new InlineKeyboard().text(t.back, 'menu_admin') }).catch(() => {});
  await ctx.answerCallbackQuery();
});

bot.callbackQuery(/^ad_testcrypto$/, async (ctx) => {
  if (!ADMIN_IDS.includes(ctx.from.id)) return;
  if (!CRYPTOBOT_TOKEN) { await ctx.answerCallbackQuery('No token'); return; }
  await ctx.answerCallbackQuery();
  for (const host of ['pay.crypt.bot/api', 'api.crypt.bot/v1']) {
    try {
      const res = await fetch('https://' + host + '/getMe', { headers: { 'Crypto-Pay-API-Token': CRYPTOBOT_TOKEN } });
      const data = await res.json();
      await ctx.reply(host + '/getMe:\n<code>' + esc(JSON.stringify(data, null, 2)) + '</code>', { parse_mode: 'HTML' });
    } catch (e) {
      await ctx.reply(host + '/getMe error:\n<code>' + esc(e.message) + '</code>', { parse_mode: 'HTML' });
    }
  }
});

bot.command('pending', async (ctx) => {
  if (!ADMIN_IDS.includes(ctx.from.id)) return;
  const t = L[getLang(ctx)];
  if (!pendingPayments.size) { await ctx.reply(t.pending_title + '\n' + t.pending_empty, { parse_mode: 'HTML' }); return; }
  const lines = [...pendingPayments.entries()].map(([id, p]) => '#' + id + ' \u2014 \ud83d\udc64 ' + p.name + ' (ID: ' + p.userId + ')').join('\n');
  await ctx.reply(t.pending_title + '\n' + lines, { parse_mode: 'HTML' });
});

bot.command('stats', async (ctx) => {
  if (!ADMIN_IDS.includes(ctx.from.id)) return;
  await ctx.reply(L[getLang(ctx)].stats.replace('{n}', getStats()), { parse_mode: 'HTML' });
});

bot.command('genkeys', async (ctx) => {
  if (!ADMIN_IDS.includes(ctx.from.id)) return;
  const t = L[getLang(ctx)];
  const keys = [];
  for (let i = 0; i < 10; i++) { const k = genKey(); saveKey(k); keys.push(k); }
  await ctx.reply(t.genkeys.replace('{keys}', keys.join('\n')), { parse_mode: 'HTML' });
});

bot.command('testcrypto', async (ctx) => {
  if (!ADMIN_IDS.includes(ctx.from.id)) return;
  if (!CRYPTOBOT_TOKEN) { await ctx.reply('CRYPTOBOT_TOKEN not set'); return; }
  for (const host of ['pay.crypt.bot/api', 'api.crypt.bot/v1']) {
    try {
      const res = await fetch('https://' + host + '/getMe', { headers: { 'Crypto-Pay-API-Token': CRYPTOBOT_TOKEN } });
      const data = await res.json();
      await ctx.reply(host + '/getMe:\n<code>' + esc(JSON.stringify(data, null, 2)) + '</code>', { parse_mode: 'HTML' });
    } catch (e) {
      await ctx.reply(host + '/getMe error:\n<code>' + esc(e.message) + '</code>', { parse_mode: 'HTML' });
    }
  }
});

bot.command('import', async (ctx) => {
  if (!ADMIN_IDS.includes(ctx.from.id)) return;
  const t = L[getLang(ctx)];
  const parts = (ctx.message?.text || '').split(/[\s,;\n]+/).slice(1).filter(Boolean);
  if (!parts.length) { await ctx.reply(t.import_usage, { parse_mode: 'HTML' }); return; }
  let imported = 0, dups = 0;
  for (const raw of parts) {
    const key = raw.trim().toUpperCase();
    if (key.length < 5) continue;
    if (saveKey(key)) imported++; else dups++;
  }
  await ctx.reply(t.import_ok.replace('{n}', imported).replace('{dup}', dups), { parse_mode: 'HTML' });
});

bot.command('panel', async (ctx) => {
  if (!ADMIN_IDS.includes(ctx.from.id)) return;
  const t = L[getLang(ctx)];
  const available = Object.values(store.keys).filter(k => !k.userId).length;
  const recent = Object.values(store.keys).sort((a, b) => b.time - a.time).slice(0, 5);
  const recentText = recent.map(e =>
    (e.userId ? '\u2705' : '\u26aa') + ' <code>' + e.key.slice(0, 16) + '...</code> ' + (e.userId ? '\u2192 ' + esc(e.name || e.userId) : '\ud83d\udfe2 free')
  ).join('\n');
  const activePromos = [...promoCodes.entries()].filter(([, p]) => p.uses < p.maxUses).length;
  await ctx.reply(
    t.panel_title
      .replace('{n}', '\uD83D\uDCCA <b>Keys:</b> ' + store.total + ' total, ' + store.sold + ' sold, ' + available + ' available\n\n<b>\uD83D\uDD0D Recent:</b>\n' + recentText)
      .replace('{pending}', pendingPayments.size)
      .replace('{promos}', activePromos),
    { parse_mode: 'HTML' }
  );
});

bot.command('createpromo', async (ctx) => {
  if (!ADMIN_IDS.includes(ctx.from.id)) return;
  const t = L[getLang(ctx)];
  const parts = (ctx.message?.text || '').split(/\s+/);
  if (parts.length < 4) { await ctx.reply(t.createpromo_usage, { parse_mode: 'HTML' }); return; }
  const code = parts[1].toUpperCase();
  const discount = Math.min(100, Math.max(1, parseInt(parts[2]) || 0));
  const maxUses = parseInt(parts[3]) || 1;
  promoCodes.set(code, { code, discount, maxUses, uses: 0, createdBy: ctx.from.id, createdAt: Date.now() });
  await ctx.reply(t.promo_created.replace('{code}', code).replace('{d}', discount).replace('{max}', maxUses), { parse_mode: 'HTML' });
});

bot.command('promos', async (ctx) => {
  if (!ADMIN_IDS.includes(ctx.from.id)) return;
  const t = L[getLang(ctx)];
  if (!promoCodes.size) { await ctx.reply(t.promo_empty, { parse_mode: 'HTML' }); return; }
  const lines = [...promoCodes.entries()].map(([code, p]) =>
    t.promo_line.replace('{code}', code).replace('{d}', p.discount).replace('{uses}', p.uses).replace('{max}', p.maxUses)
  ).join('\n');
  await ctx.reply(t.promo_list.replace('{list}', lines), { parse_mode: 'HTML' });
});

bot.command('deletepromo', async (ctx) => {
  if (!ADMIN_IDS.includes(ctx.from.id)) return;
  const t = L[getLang(ctx)];
  const code = (ctx.message?.text || '').split(/\s+/)[1]?.toUpperCase();
  if (!code || !promoCodes.has(code)) { await ctx.reply(t.promo_delete_fail.replace('{code}', code || ''), { parse_mode: 'HTML' }); return; }
  promoCodes.delete(code);
  await ctx.reply(t.promo_deleted.replace('{code}', code), { parse_mode: 'HTML' });
});

bot.command('history', async (ctx) => {
  if (!ADMIN_IDS.includes(ctx.from.id)) return;
  const t = L[getLang(ctx)];
  if (!purchaseHistory.length) { await ctx.reply(t.history_empty, { parse_mode: 'HTML' }); return; }
  const lines = purchaseHistory.slice(-30).reverse().map(e =>
    t.history_line
      .replace('{key}', e.key.slice(0, 20) + '...')
      .replace('{name}', esc(e.name || e.userId))
      .replace('{method}', e.method)
      .replace('{promo}', e.promo ? ' \ud83c\udfab ' + e.promo : '')
  ).join('');
  await ctx.reply(t.history_title.replace('{list}', lines), { parse_mode: 'HTML' });
});

const app = express();
app.use(express.json());

app.post('/cryptobot-webhook', async (req, res) => {
  try {
    if (req.body?.update_type === 'invoice_paid') {
      const payload = req.body.payload || '';
      const parts = payload.split('_');
      const userId = parts[2];
      const promoCode = parts.length > 3 ? parts.slice(3).join('_') : null;
      const key = issueKey(userId, 'crypto', 'cryptobot');
      const t = L[userLang.get(Number(userId)) || 'en'];
      if (promoCode && promoCodes.has(promoCode)) promoCodes.get(promoCode).uses++;
      addHistory({ key, userId, name: 'crypto', method: 'cryptobot', promo: promoCode || null });
      try {
        await bot.api.sendMessage(userId,
          t.success + '\n\n' + t.success_info.replace('{key}', key),
          { parse_mode: 'HTML' }
        );
      } catch {}
    }
  } catch {}
  res.sendStatus(200);
});

app.get('/', (req, res) => res.send('EncodeX Bot'));

if (WEBHOOK_DOMAIN) {
  app.post('/webhook', webhookCallback(bot, 'express'));
  const url = (WEBHOOK_DOMAIN.startsWith('http') ? '' : 'https://') + WEBHOOK_DOMAIN + '/webhook';
  bot.api.setWebhook(url, { drop_pending_updates: true }).then(() => {
    console.log('Webhook set to ' + url);
    app.listen(PORT, () => console.log('Bot on port ' + PORT));
  }).catch(e => { console.error('Webhook failed:', e.message); process.exit(1); });
} else {
  bot.api.deleteWebhook({ drop_pending_updates: true }).then(() => {
    app.listen(PORT, () => { console.log('Bot on port ' + PORT); setTimeout(() => bot.start().catch(e => console.error(e.message)), 3000); });
  }).catch(() => {
    app.listen(PORT, () => { console.log('Bot on port ' + PORT); setTimeout(() => bot.start().catch(e => console.error(e.message)), 3000); });
  });
}
