const express = require('express');
const { Bot, InlineKeyboard, webhookCallback } = require('grammy');
const { randomUUID } = require('crypto');

const BOT_TOKEN = process.env.BOT_TOKEN;
const PROVIDER_TOKEN = process.env.PROVIDER_TOKEN;
const CRYPTOBOT_TOKEN = process.env.CRYPTOBOT_TOKEN;
const ADMIN_IDS = (process.env.ADMIN_IDS || '').split(',').map(Number);
const PORT = process.env.PORT || 8080;
const BOT_USERNAME = process.env.BOT_USERNAME || '';
const WEBHOOK_DOMAIN = process.env.WEBHOOK_DOMAIN || '';

function genKey() {
  const r = () => randomUUID().slice(0, 4).toUpperCase();
  return 'ENCODEX-' + r() + '-' + r() + '-' + r() + '-' + r();
}

const store = { keys: {}, total: 0 };
function saveKey(key, userId, name, method) {
  store.keys[key] = { key, userId, name, method, time: Date.now() };
  store.total++;
}
function getStats() { return '\uD83D\uDCCA Keys: ' + store.total; }

const bot = new Bot(BOT_TOKEN);

function esc(s) { return String(s).replace(/[<>&"']/g, m => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'})[m]); }

// ── User language store ──────────────────────────────
const userLang = new Map();

function getLang(ctx) {
  const id = ctx.from?.id || ctx.chat?.id || 0;
  return userLang.get(id) || ctx.from?.language_code === 'ru' ? 'ru' : 'en';
}

// ── Language strings ─────────────────────────────────

const L = {
  en: {
    // Welcome & Language
    lang_pick: '\ud83c\udf10 <b>Choose your language</b>\n\n\ud83c\uddf7\ud83c\uddfa \u0412\u044b\u0431\u0435\u0440\u0438\u0442\u0435 \u044f\u0437\u044b\u043a',
    welcome: '\ud83d\udd25 <b>Welcome to EncodeX</b>\ud83d\udd25\n\nProfessional solution for video preparation.\n\n\u26a1 <b>Fast</b>\n\ud83c\udfac <b>Convenient</b>\n\ud83d\udc8e <b>Premium quality</b>\n\nBypass TikTok compression \u2022 Watermark <code>@encodexhd</code>\nUnlimited videos \u2022 Lifetime access',
    welcome_back: '\ud83d\udc4b <b>Welcome back!</b>\n\nReady to continue?',

    // Main menu
    menu_main: '\ud83c\udfe0 <b>Main Menu</b>\n\nSelect a section below:',
    menu_btn_main: '\ud83c\udfe0 Main',
    menu_btn_buy: '\ud83d\udc8e Buy Premium',
    menu_btn_licenses: '\ud83d\udccb My Licenses',
    menu_btn_instructions: '\ud83d\udcd6 Instructions',
    menu_btn_faq: '\u2753 FAQ',
    menu_btn_support: '\ud83d\udd27 Support',
    menu_btn_profile: '\ud83d\udc64 Profile',
    menu_btn_community: '\ud83c\udf0d Community',

    // Premium purchase
    title: '\u2728 <b>EncodeX Premium</b>',
    desc: 'Bypass TikTok compression \u2022 Watermark <code>@encodexhd</code>\nUnlimited videos \u2022 No limits \u2022 Lifetime',
    select: '<b>Select:</b>',
    lifetime: '\ud83d\udc51 Lifetime \u2014 50 USDT',
    lifetime_stars: '\ud83d\udc51 Lifetime \u2014 50 USDT / 150 \u2b50',
    plan_title: '\ud83d\udc51 <b>Lifetime Access</b>',
    plan_price: '\ud83d\udcb0 <b>50 USDT</b>' + (PROVIDER_TOKEN ? ' / <b>150 \u2b50</b>' : ''),
    plan_desc: '<i>One-time payment \u2022 Unlimited usage \u2022 No expiry</i>',
    choose_payment: '<i>Choose payment:</i>',
    stars: '\u2b50 Telegram Stars',
    crypto: '\ud83d\udc8e CryptoBot (USDT)',
    back: '\u2190 Back',
    creating: '\u23f3 <b>Creating invoice...</b>',
    pay_stars: '\ud83d\udcb3 Pay 150 \u2b50',
    stars_pay_title: '\u2b50 Telegram Stars',
    stars_pay_info: '<i>Tap the button to complete payment</i>',
    crypto_pay_title: '\ud83d\udc8e CryptoBot (USDT)',
    crypto_pay_info: '<i>Tap the button to pay with CryptoBot</i>',
    pay_usdt: '\ud83d\udcb3 Pay 50 USDT',
    success: '\u2705 <b>Payment Successful!</b>',
    success_info: 'Your key: <code>{key}</code>\n\nOpen <b>EncodeX</b> \u2192 <b>Profile</b> \u2192 <b>Activate</b>',
    timeout: '\u274c <b>Timeout</b>\nCryptoBot API did not respond in 15s',
    err_no_token: '\u274c Crypto token not configured',
    err_plan: '\u274c CryptoBot error:\n<code>{data}</code>',
    err_exc: '\u274c <b>Error</b>\n<code>{msg}</code>',
    err_crypto: '\u274c CryptoBot error:\n<code>{data}</code>',
    stats: '\ud83d\udcca <b>Stats:</b> {n}',
    genkeys: '\ud83d\udd11 <b>Generated 10 keys:</b>\n<code>{keys}</code>',

    // Profile
    profile_title: '\ud83d\udc64 <b>Your Profile</b>',
    profile_id: '\ud83d\udd11 ID: <code>{id}</code>',
    profile_name: '\ud83d\udcdd Name: <b>{name}</b>',
    profile_lang: '\ud83c\udf10 Language: <b>English</b>',
    profile_status: '\ud83d\udfe2 Status: <b>Free user</b>',
    profile_status_premium: '\ud83d\udfe1 Status: <b>Premium</b>',
    profile_no_keys: 'You don\u2019t have any active licenses yet.',

    // My Licenses
    licenses_title: '\ud83d\udccb <b>My Licenses</b>',
    licenses_empty: 'You don\u2019t have any active licenses.\n\nTap <b>Buy Premium</b> to get one!',
    licenses_key: '\ud83d\udd11 Key: <code>{key}</code>\n\u2728 Method: {method}\n\ud83d\udcc5 Date: {date}',
    plan_label: 'Lifetime',

    // Instructions
    instructions_title: '\ud83d\udcd6 <b>Instructions</b>',
    instructions_text: '1. \ud83d\udfe2 <b>Purchase</b> \u2014 Buy a license via CryptoBot or Stars\n2. \ud83d\udd11 <b>Get key</b> \u2014 The key arrives automatically after payment\n3. \ud83d\udd0c <b>Activate</b> \u2014 Open EncodeX \u2192 Profile \u2192 Activate\n4. \u2705 <b>Done!</b> \u2014 Enjoy unlimited video processing\n\nFor detailed video guide, contact support.',

    // FAQ
    faq_title: '\u2753 <b>FAQ</b>',
    faq_q1: '\u25b6\ufe0f What is EncodeX?',
    faq_a1: 'EncodeX bypasses TikTok compression, keeping your video quality intact with watermark <code>@encodexhd</code>.',
    faq_q2: '\u25b6\ufe0f How do I activate my key?',
    faq_a2: 'Open EncodeX \u2192 Profile \u2192 Activate \u2192 paste your key.',
    faq_q3: '\u25b6\ufe0f Is it unlimited?',
    faq_a3: 'Yes! Lifetime license = unlimited videos, no restrictions.',
    faq_q4: '\u25b6\ufe0f What payment methods?',
    faq_a4: 'CryptoBot (USDT) and Telegram Stars.',

    // Support
    support_title: '\ud83d\udd27 <b>Support</b>',
    support_text: 'Having issues? Contact us:\n\n\ud83d\udcac @encodex_support\n\u2709\ufe0f <a href="https://t.me/encodex_support">Open Chat</a>\n\nWe reply within 24 hours.',

    // Community
    community_title: '\ud83c\udf0d <b>Community</b>',
    community_text: 'Join our community!\n\n\ud83d\udc65 <a href="https://t.me/encodex_chat">Chat</a>\n\ud83d\udce2 <a href="https://t.me/encodex_news">News Channel</a>'
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

    title: '\u2728 <b>EncodeX Premium</b>',
    desc: '\u041e\u0431\u0445\u043e\u0434 \u0441\u0436\u0430\u0442\u0438\u044f TikTok \u2022 \u0412\u0430\u0442\u0435\u0440\u043c\u0430\u0440\u043a <code>@encodexhd</code>\n\u0411\u0435\u0437\u043b\u0438\u043c\u0438\u0442\u043d\u043e \u2022 \u041d\u0430\u0432\u0441\u0435\u0433\u0434\u0430',
    select: '<b>\u0412\u044b\u0431\u0435\u0440\u0438\u0442\u0435:</b>',
    lifetime: '\ud83d\udc51 \u041d\u0430\u0432\u0441\u0435\u0433\u0434\u0430 \u2014 50 USDT',
    lifetime_stars: '\ud83d\udc51 \u041d\u0430\u0432\u0441\u0435\u0433\u0434\u0430 \u2014 50 USDT / 150 \u2b50',
    plan_title: '\ud83d\udc51 <b>\u041d\u0430\u0432\u0441\u0435\u0433\u0434\u0430</b>',
    plan_price: '\ud83d\udcb0 <b>50 USDT</b>' + (PROVIDER_TOKEN ? ' / <b>150 \u2b50</b>' : ''),
    plan_desc: '<i>\u041e\u0434\u0438\u043d \u043f\u043b\u0430\u0442\u0435\u0436 \u2022 \u0411\u0435\u0437 \u043b\u0438\u043c\u0438\u0442\u043e\u0432 \u2022 \u041d\u0430\u0432\u0441\u0435\u0433\u0434\u0430</i>',
    choose_payment: '<i>\u0412\u044b\u0431\u0435\u0440\u0438\u0442\u0435 \u043e\u043f\u043b\u0430\u0442\u0443:</i>',
    stars: '\u2b50 Telegram Stars',
    crypto: '\ud83d\udc8e CryptoBot (USDT)',
    back: '\u2190 \u041d\u0430\u0437\u0430\u0434',
    creating: '\u23f3 <b>\u0421\u043e\u0437\u0434\u0430\u0451\u043c \u0438\u043d\u0432\u043e\u0439\u0441...</b>',
    pay_stars: '\ud83d\udcb3 \u041e\u043f\u043b\u0430\u0442\u0438\u0442\u044c 150 \u2b50',
    stars_pay_title: '\u2b50 Telegram Stars',
    stars_pay_info: '<i>\u041d\u0430\u0436\u043c\u0438\u0442\u0435 \u043a\u043d\u043e\u043f\u043a\u0443 \u0434\u043b\u044f \u043e\u043f\u043b\u0430\u0442\u044b</i>',
    crypto_pay_title: '\ud83d\udc8e CryptoBot (USDT)',
    crypto_pay_info: '<i>\u041d\u0430\u0436\u043c\u0438\u0442\u0435 \u043a\u043d\u043e\u043f\u043a\u0443 \u0434\u043b\u044f \u043e\u043f\u043b\u0430\u0442\u044b</i>',
    pay_usdt: '\ud83d\udcb3 \u041e\u043f\u043b\u0430\u0442\u0438\u0442\u044c 50 USDT',
    success: '\u2705 <b>\u041e\u043f\u043b\u0430\u0442\u0430 \u043f\u0440\u043e\u0448\u043b\u0430!</b>',
    success_info: '\u041a\u043b\u044e\u0447: <code>{key}</code>\n\n\u041e\u0442\u043a\u0440\u043e\u0439\u0442\u0435 <b>EncodeX</b> \u2192 <b>\u041f\u0440\u043e\u0444\u0438\u043b\u044c</b> \u2192 <b>\u0410\u043a\u0442\u0438\u0432\u0430\u0446\u0438\u044f</b>',
    timeout: '\u274c <b>\u0422\u0430\u0439\u043c\u0430\u0443\u0442</b>\nCryptoBot API \u043d\u0435 \u043e\u0442\u0432\u0435\u0442\u0438\u043b \u0437\u0430 15\u0441',
    err_no_token: '\u274c \u0422\u043e\u043a\u0435\u043d Crypto \u043d\u0435 \u043d\u0430\u0441\u0442\u0440\u043e\u0435\u043d',
    err_plan: '\u274c \u041e\u0448\u0438\u0431\u043a\u0430 CryptoBot:\n<code>{data}</code>',
    err_exc: '\u274c <b>\u041e\u0448\u0438\u0431\u043a\u0430</b>\n<code>{msg}</code>',
    err_crypto: '\u274c \u041e\u0448\u0438\u0431\u043a\u0430 CryptoBot:\n<code>{data}</code>',
    stats: '\ud83d\udcca <b>\u0421\u0442\u0430\u0442\u0438\u0441\u0442\u0438\u043a\u0430:</b> {n}',
    genkeys: '\ud83d\udd11 <b>\u0421\u0433\u0435\u043d\u0435\u0440\u0438\u0440\u043e\u0432\u0430\u043d\u043e 10 \u043a\u043b\u044e\u0447\u0435\u0439:</b>\n<code>{keys}</code>',

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
    plan_label: '\u041d\u0430\u0432\u0441\u0435\u0433\u0434\u0430',

    instructions_title: '\ud83d\udcd6 <b>\u0418\u043d\u0441\u0442\u0440\u0443\u043a\u0446\u0438\u0438</b>',
    instructions_text: '1. \ud83d\udfe2 <b>\u041f\u043e\u043a\u0443\u043f\u043a\u0430</b> \u2014 \u041f\u0440\u0438\u043e\u0431\u0440\u0435\u0442\u0438\u0442\u0435 \u043b\u0438\u0446\u0435\u043d\u0437\u0438\u044e \u0447\u0435\u0440\u0435\u0437 CryptoBot \u0438\u043b\u0438 Stars\n2. \ud83d\udd11 <b>\u041f\u043e\u043b\u0443\u0447\u0435\u043d\u0438\u0435</b> \u2014 \u041a\u043b\u044e\u0447 \u043f\u0440\u0438\u0445\u043e\u0434\u0438\u0442 \u0430\u0432\u0442\u043e\u043c\u0430\u0442\u0438\u0447\u0435\u0441\u043a\u0438 \u043f\u043e\u0441\u043b\u0435 \u043e\u043f\u043b\u0430\u0442\u044b\n3. \ud83d\udd0c <b>\u0410\u043a\u0442\u0438\u0432\u0430\u0446\u0438\u044f</b> \u2014 \u041e\u0442\u043a\u0440\u043e\u0439\u0442\u0435 EncodeX \u2192 \u041f\u0440\u043e\u0444\u0438\u043b\u044c \u2192 \u0410\u043a\u0442\u0438\u0432\u0430\u0446\u0438\u044f\n4. \u2705 <b>\u0413\u043e\u0442\u043e\u0432\u043e!</b> \u2014 \u041f\u043e\u043b\u044c\u0437\u0443\u0439\u0442\u0435\u0441\u044c \u0431\u0435\u0437 \u043e\u0433\u0440\u0430\u043d\u0438\u0447\u0435\u043d\u0438\u0439',

    faq_title: '\u2753 <b>\u0427\u0410\u0412\u041e</b>',
    faq_q1: '\u25b6\ufe0f \u0427\u0442\u043e \u0442\u0430\u043a\u043e\u0435 EncodeX?',
    faq_a1: 'EncodeX \u043e\u0431\u0445\u043e\u0434\u0438\u0442 \u0441\u0436\u0430\u0442\u0438\u0435 TikTok, \u0441\u043e\u0445\u0440\u0430\u043d\u044f\u044f \u043a\u0430\u0447\u0435\u0441\u0442\u0432\u043e \u0432\u0438\u0434\u0435\u043e \u0441 \u0432\u0430\u0442\u0435\u0440\u043c\u0430\u0440\u043a\u043e\u0439 <code>@encodexhd</code>.',
    faq_q2: '\u25b6\ufe0f \u041a\u0430\u043a \u0430\u043a\u0442\u0438\u0432\u0438\u0440\u043e\u0432\u0430\u0442\u044c \u043a\u043b\u044e\u0447?',
    faq_a2: '\u041e\u0442\u043a\u0440\u043e\u0439\u0442\u0435 EncodeX \u2192 \u041f\u0440\u043e\u0444\u0438\u043b\u044c \u2192 \u0410\u043a\u0442\u0438\u0432\u0430\u0446\u0438\u044f \u2192 \u0432\u0441\u0442\u0430\u0432\u044c\u0442\u0435 \u043a\u043b\u044e\u0447.',
    faq_q3: '\u25b6\ufe0f \u042d\u0442\u043e \u0431\u0435\u0437\u043b\u0438\u043c\u0438\u0442\u043d\u043e?',
    faq_a3: '\u0414\u0430! \u041b\u0438\u0446\u0435\u043d\u0437\u0438\u044f \u043d\u0430\u0432\u0441\u0435\u0433\u0434\u0430 = \u0431\u0435\u0437\u043b\u0438\u043c\u0438\u0442\u043d\u043e\u0435 \u0432\u0438\u0434\u0435\u043e, \u0431\u0435\u0437 \u043e\u0433\u0440\u0430\u043d\u0438\u0447\u0435\u043d\u0438\u0439.',
    faq_q4: '\u25b6\ufe0f \u041a\u0430\u043a\u0438\u0435 \u0441\u043f\u043e\u0441\u043e\u0431\u044b \u043e\u043f\u043b\u0430\u0442\u044b?',
    faq_a4: 'CryptoBot (USDT) \u0438 Telegram Stars.',

    support_title: '\ud83d\udd27 <b>\u041f\u043e\u0434\u0434\u0435\u0440\u0436\u043a\u0430</b>',
    support_text: '\u041f\u0440\u043e\u0431\u043b\u0435\u043c\u044b? \u0421\u0432\u044f\u0436\u0438\u0442\u0435\u0441\u044c \u0441 \u043d\u0430\u043c\u0438:\n\n\ud83d\udcac @encodex_support\n\u2709\ufe0f <a href="https://t.me/encodex_support">\u041e\u0442\u043a\u0440\u044b\u0442\u044c \u0447\u0430\u0442</a>\n\n\u041e\u0442\u0432\u0435\u0447\u0430\u0435\u043c \u0432 \u0442\u0435\u0447\u0435\u043d\u0438\u0438 24 \u0447\u0430\u0441\u043e\u0432.',

    community_title: '\ud83c\udf0d <b>\u0421\u043e\u043e\u0431\u0449\u0435\u0441\u0442\u0432\u043e</b>',
    community_text: '\u041f\u0440\u0438\u0441\u043e\u0435\u0434\u0438\u043d\u044f\u0439\u0442\u0435\u0441\u044c!\n\n\ud83d\udc65 <a href="https://t.me/encodex_chat">\u0427\u0430\u0442</a>\n\ud83d\udce2 <a href="https://t.me/encodex_news">\u041a\u0430\u043d\u0430\u043b \u043d\u043e\u0432\u043e\u0441\u0442\u0435\u0439</a>'
  }
};

// ── Helpers ──────────────────────────────────────────

function buildMenu(t) {
  return new InlineKeyboard()
    .text(t.menu_btn_buy, 'menu_buy').text(t.menu_btn_licenses, 'menu_licenses').row()
    .text(t.menu_btn_instructions, 'menu_instructions').text(t.menu_btn_faq, 'menu_faq').row()
    .text(t.menu_btn_support, 'menu_support').text(t.menu_btn_profile, 'menu_profile').row()
    .text(t.menu_btn_community, 'menu_community');
}

function mainMenuText(t, premium) {
  const status = premium ? '\ud83d\udfe1' : '\ud83d\udfe2';
  const statusText = premium ? 'Premium \u2714\ufe0f' : 'Free';
  return t.menu_main + '\n\n' + status + ' Status: <b>' + statusText + '</b>';
}

function hasLicense(userId) {
  const id = String(userId);
  return Object.values(store.keys).some(k => String(k.userId) === id);
}

function getUserKeys(userId) {
  const id = String(userId);
  return Object.values(store.keys).filter(k => String(k.userId) === id);
}

// ── /start ───────────────────────────────────────────

bot.command('start', async (ctx) => {
  const id = ctx.from.id;
  // If language already chosen, go to main menu
  if (userLang.has(id)) {
    const lang = userLang.get(id);
    const t = L[lang];
    const premium = hasLicense(id);
    await ctx.reply(
      t.welcome_back + '\n\n' + mainMenuText(t, premium),
      { parse_mode: 'HTML', reply_markup: buildMenu(t) }
    );
    return;
  }
  // First visit — language selection
  const kb = new InlineKeyboard()
    .text('\ud83c\uddf7\ud83c\uddfa \u0420\u0443\u0441\u0441\u043a\u0438\u0439', 'lang_ru')
    .text('\ud83c\uddfa\ud83c\uddf8 English', 'lang_en');
  await ctx.reply(L.en.lang_pick, { parse_mode: 'HTML', reply_markup: kb });
});

// ── Language selection ───────────────────────────────

bot.callbackQuery(/^lang_(ru|en)$/, async (ctx) => {
  const lang = ctx.match[1];
  const id = ctx.from.id;
  userLang.set(id, lang);
  const t = L[lang];
  const premium = hasLicense(id);
  // Show different buttons based on whether it's language change or first setup
  if (ctx.callbackQuery.message?.text?.includes('Welcome') || ctx.callbackQuery.message?.text?.includes('\u0414\u043e\u0431\u0440\u043e')) {
    // Language change (not first time)
    await ctx.editMessageText(
      t.welcome_back + '\n\n' + mainMenuText(t, premium),
      { parse_mode: 'HTML', reply_markup: buildMenu(t) }
    );
  } else {
    await ctx.editMessageText(
      t.welcome + '\n\n' + mainMenuText(t, premium),
      { parse_mode: 'HTML', reply_markup: buildMenu(t) }
    );
  }
  await ctx.answerCallbackQuery();
});

// ── Main menu ────────────────────────────────────────

bot.callbackQuery(/^menu_main$/, async (ctx) => {
  const lang = getLang(ctx);
  const t = L[lang];
  const premium = hasLicense(ctx.from.id);
  await ctx.editMessageText(
    mainMenuText(t, premium),
    { parse_mode: 'HTML', reply_markup: buildMenu(t) }
  ).catch(() => {});
  await ctx.answerCallbackQuery();
});

// ── Buy (redirect to existing buy_lifetime) ──────────

bot.callbackQuery(/^menu_buy$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  // Reuse existing buy_lifetime logic
  const lang = getLang(ctx);
  const t = L[lang];
  const kb = new InlineKeyboard();
  if (PROVIDER_TOKEN) kb.text(t.stars, 'pay_stars_lifetime');
  if (PROVIDER_TOKEN && CRYPTOBOT_TOKEN) kb.row();
  if (CRYPTOBOT_TOKEN) kb.text(t.crypto, 'pay_crypto_lifetime');
  kb.row().text(t.back, 'back_start');
  try {
    await ctx.editMessageText(
      t.plan_title + '\n\n' + t.plan_price + '\n' + t.plan_desc + '\n\n' + t.choose_payment,
      { parse_mode: 'HTML', reply_markup: kb }
    );
  } catch (e) {}
});

// ── Profile ──────────────────────────────────────────

bot.callbackQuery(/^menu_profile$/, async (ctx) => {
  const lang = getLang(ctx);
  const t = L[lang];
  const id = ctx.from.id;
  const name = ctx.from.first_name || 'User';
  const premium = hasLicense(id);
  const status = premium ? t.profile_status_premium : t.profile_status;
  const txt =
    t.profile_title + '\n\n'
    + t.profile_id.replace('{id}', id) + '\n'
    + t.profile_name.replace('{name}', esc(name)) + '\n'
    + (lang === 'ru' ? t.profile_lang.replace('English', '\u0420\u0443\u0441\u0441\u043a\u0438\u0439') : t.profile_lang) + '\n'
    + status + '\n\n'
    + (premium ? '' : t.profile_no_keys);
  const kb = new InlineKeyboard()
    .text('\ud83d\udc8e ' + (lang === 'ru' ? '\u041a\u0443\u043f\u0438\u0442\u044c Premium' : 'Buy Premium'), 'menu_buy').row()
    .text(t.back, 'menu_main');
  await ctx.editMessageText(txt, { parse_mode: 'HTML', reply_markup: kb }).catch(() => {});
  await ctx.answerCallbackQuery();
});

// ── My Licenses ──────────────────────────────────────

bot.callbackQuery(/^menu_licenses$/, async (ctx) => {
  const lang = getLang(ctx);
  const t = L[lang];
  const id = ctx.from.id;
  const keys = getUserKeys(id);
  let txt;
  if (keys.length === 0) {
    txt = t.licenses_title + '\n\n' + t.licenses_empty;
  } else {
    const lines = keys.map(k =>
      t.licenses_key
        .replace('{key}', k.key)
        .replace('{method}', k.method)
        .replace('{date}', new Date(k.time).toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'en-US'))
    );
    txt = t.licenses_title + '\n\n' + lines.join('\n\n');
  }
  const kb = new InlineKeyboard()
    .text('\ud83d\udc8e ' + (lang === 'ru' ? '\u041a\u0443\u043f\u0438\u0442\u044c Premium' : 'Buy Premium'), 'menu_buy').row()
    .text(t.back, 'menu_main');
  await ctx.editMessageText(txt, { parse_mode: 'HTML', reply_markup: kb }).catch(() => {});
  await ctx.answerCallbackQuery();
});

// ── Instructions ─────────────────────────────────────

bot.callbackQuery(/^menu_instructions$/, async (ctx) => {
  const lang = getLang(ctx);
  const t = L[lang];
  const kb = new InlineKeyboard().text(t.back, 'menu_main');
  await ctx.editMessageText(
    t.instructions_title + '\n\n' + t.instructions_text,
    { parse_mode: 'HTML', reply_markup: kb }
  ).catch(() => {});
  await ctx.answerCallbackQuery();
});

// ── FAQ ──────────────────────────────────────────────

bot.callbackQuery(/^menu_faq$/, async (ctx) => {
  const lang = getLang(ctx);
  const t = L[lang];
  const txt =
    t.faq_title + '\n\n'
    + t.faq_q1 + '\n' + t.faq_a1 + '\n\n'
    + t.faq_q2 + '\n' + t.faq_a2 + '\n\n'
    + t.faq_q3 + '\n' + t.faq_a3 + '\n\n'
    + t.faq_q4 + '\n' + t.faq_a4;
  const kb = new InlineKeyboard().text(t.back, 'menu_main');
  await ctx.editMessageText(txt, { parse_mode: 'HTML', reply_markup: kb }).catch(() => {});
  await ctx.answerCallbackQuery();
});

// ── Support ──────────────────────────────────────────

bot.callbackQuery(/^menu_support$/, async (ctx) => {
  const lang = getLang(ctx);
  const t = L[lang];
  const kb = new InlineKeyboard()
    .url('\u2709\ufe0f ' + (lang === 'ru' ? '\u041d\u0430\u043f\u0438\u0441\u0430\u0442\u044c' : 'Contact'), 'https://t.me/encodex_support').row()
    .text(t.back, 'menu_main');
  await ctx.editMessageText(
    t.support_title + '\n\n' + t.support_text,
    { parse_mode: 'HTML', reply_markup: kb, disable_web_page_preview: true }
  ).catch(() => {});
  await ctx.answerCallbackQuery();
});

// ── Community ────────────────────────────────────────

bot.callbackQuery(/^menu_community$/, async (ctx) => {
  const lang = getLang(ctx);
  const t = L[lang];
  const kb = new InlineKeyboard()
    .url('\ud83d\udc65 ' + (lang === 'ru' ? '\u0427\u0430\u0442' : 'Chat'), 'https://t.me/encodex_chat')
    .url('\ud83d\udce2 ' + (lang === 'ru' ? '\u041d\u043e\u0432\u043e\u0441\u0442\u0438' : 'News'), 'https://t.me/encodex_news').row()
    .text(t.back, 'menu_main');
  await ctx.editMessageText(
    t.community_title + '\n\n' + t.community_text,
    { parse_mode: 'HTML', reply_markup: kb, disable_web_page_preview: true }
  ).catch(() => {});
  await ctx.answerCallbackQuery();
});

// ── Buy Lifetime (anchored! - UNCHANGED) ─────────────

bot.callbackQuery(/^buy_lifetime$/, async (ctx) => {
  const lang = getLang(ctx);
  const t = L[lang];
  const kb = new InlineKeyboard();
  if (PROVIDER_TOKEN) kb.text(t.stars, 'pay_stars_lifetime');
  if (PROVIDER_TOKEN && CRYPTOBOT_TOKEN) kb.row();
  if (CRYPTOBOT_TOKEN) kb.text(t.crypto, 'pay_crypto_lifetime');
  kb.row().text(t.back, 'back_start');
  await ctx.editMessageText(
    t.plan_title + '\n\n' + t.plan_price + '\n' + t.plan_desc + '\n\n' + t.choose_payment,
    { parse_mode: 'HTML', reply_markup: kb }
  ).catch(() => {});
  await ctx.answerCallbackQuery();
});

// ── Stars Payment (UNCHANGED) ────────────────────────

bot.callbackQuery(/^pay_stars_lifetime$/, async (ctx) => {
  if (!PROVIDER_TOKEN) { await ctx.answerCallbackQuery(); return; }
  const lang = getLang(ctx);
  const t = L[lang];
  try {
    const invoice = await bot.api.createInvoiceLink(
      'EncodeX Lifetime',
      'Premium lifetime key',
      'stars_lifetime_' + ctx.from.id, '', 'XTR',
      [{ label: 'EncodeX Lifetime', amount: 150 }],
      { provider_token: PROVIDER_TOKEN }
    );
    const kb = new InlineKeyboard()
      .url(t.pay_stars, invoice).row()
      .text(t.back, 'buy_lifetime');
    await ctx.editMessageText(
      '<b>' + t.stars_pay_title + '</b>\n\n150 \u2B50\n\n' + t.stars_pay_info,
      { parse_mode: 'HTML', reply_markup: kb }
    );
  } catch (e) {
    await ctx.answerCallbackQuery();
    await ctx.reply(t.err_exc.replace('{msg}', esc(e.message || e)), { parse_mode: 'HTML' });
    return;
  }
  await ctx.answerCallbackQuery();
});

bot.on('pre_checkout_query', async (ctx) => ctx.answerPreCheckoutQuery(true));

bot.on('message:successful_payment', async (ctx) => {
  const lang = getLang(ctx);
  const t = L[lang];
  const key = genKey();
  saveKey(key, String(ctx.from.id), ctx.from.username || ctx.from.first_name || 'user', 'stars');
  await ctx.reply(
    t.success + '\n\n' + t.success_info.replace('{key}', key),
    { parse_mode: 'HTML' }
  );
});

// ── CryptoBot Payment (UNCHANGED) ────────────────────

bot.callbackQuery(/^pay_crypto_lifetime$/, async (ctx) => {
  const lang = getLang(ctx);
  const t = L[lang];

  if (!CRYPTOBOT_TOKEN) {
    await ctx.editMessageText(t.err_no_token).catch(() => {});
    await ctx.answerCallbackQuery();
    return;
  }
  await ctx.answerCallbackQuery();

  const msg = await ctx.reply(t.creating, { parse_mode: 'HTML' });
  const chatId = msg.chat.id;
  const msgId = msg.message_id;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    const res = await fetch('https://pay.crypt.bot/api/createInvoice', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Crypto-Pay-API-Token': CRYPTOBOT_TOKEN },
      body: JSON.stringify({
        asset: 'USDT', amount: 50,
        description: 'EncodeX Premium \u2014 Lifetime',
        paid_btn_name: 'openBot',
        paid_btn_url: 'https://t.me/' + (BOT_USERNAME || 'encodex_bot'),
        payload: 'crypto_lifetime_' + ctx.from.id
      }),
      signal: controller.signal
    });
    clearTimeout(timer);
    const data = await res.json();
    if (!data.ok) {
      await ctx.api.editMessageText(chatId, msgId,
        t.err_crypto.replace('{data}', esc(JSON.stringify(data))),
        { parse_mode: 'HTML' }
      ).catch(() => {});
      return;
    }
    const kb = new InlineKeyboard()
      .url(t.pay_usdt, data.result.bot_invoice_url).row()
      .text(t.back, 'buy_lifetime');
    await ctx.api.editMessageText(chatId, msgId,
      '<b>' + t.crypto_pay_title + '</b>\n\n50 USDT\n\n' + t.crypto_pay_info,
      { parse_mode: 'HTML', reply_markup: kb }
    );
  } catch (e) {
    const text = e.name === 'AbortError'
      ? t.timeout
      : t.err_exc.replace('{msg}', esc(e.message || String(e)));
    await ctx.api.editMessageText(chatId, msgId, text, { parse_mode: 'HTML' }).catch(() => {});
  }
});

// ── Back to main menu (was back_start) ───────────────

bot.callbackQuery(/^back_start$/, async (ctx) => {
  const lang = getLang(ctx);
  const t = L[lang];
  const premium = hasLicense(ctx.from.id);
  await ctx.editMessageText(
    mainMenuText(t, premium),
    { parse_mode: 'HTML', reply_markup: buildMenu(t) }
  ).catch(() => {});
  await ctx.answerCallbackQuery();
});

// ── Admin (UNCHANGED) ────────────────────────────────

bot.command('stats', async (ctx) => {
  if (!ADMIN_IDS.includes(ctx.from.id)) return;
  const lang = getLang(ctx);
  await ctx.reply(L[lang].stats.replace('{n}', getStats()), { parse_mode: 'HTML' });
});

bot.command('genkeys', async (ctx) => {
  if (!ADMIN_IDS.includes(ctx.from.id)) return;
  const lang = getLang(ctx);
  const keys = [];
  for (let i = 0; i < 10; i++) { const k = genKey(); saveKey(k); keys.push(k); }
  await ctx.reply(
    L[lang].genkeys.replace('{keys}', keys.join('\n')),
    { parse_mode: 'HTML' }
  );
});

bot.command('testcrypto', async (ctx) => {
  if (!ADMIN_IDS.includes(ctx.from.id)) return;
  if (!CRYPTOBOT_TOKEN) { await ctx.reply('CRYPTOBOT_TOKEN not set'); return; }

  try {
    const res = await fetch('https://pay.crypt.bot/api/getMe', {
      headers: { 'Crypto-Pay-API-Token': CRYPTOBOT_TOKEN }
    });
    const data = await res.json();
    await ctx.reply('pay.crypt.bot/getMe:\n<code>' + esc(JSON.stringify(data, null, 2)) + '</code>', { parse_mode: 'HTML' });
  } catch (e) {
    await ctx.reply('pay.crypt.bot/getMe error:\n<code>' + esc(e.message) + '</code>', { parse_mode: 'HTML' });
  }

  try {
    const res2 = await fetch('https://api.crypt.bot/v1/getMe', {
      headers: { 'Crypto-Pay-API-Token': CRYPTOBOT_TOKEN }
    });
    const data2 = await res2.json();
    await ctx.reply('api.crypt.bot/getMe:\n<code>' + esc(JSON.stringify(data2, null, 2)) + '</code>', { parse_mode: 'HTML' });
  } catch (e) {
    await ctx.reply('api.crypt.bot/getMe error:\n<code>' + esc(e.message) + '</code>', { parse_mode: 'HTML' });
  }
});

// ── Express (UNCHANGED) ──────────────────────────────

const app = express();
app.use(express.json());

app.post('/cryptobot-webhook', async (req, res) => {
  try {
    if (req.body?.update_type === 'invoice_paid') {
      const payload = req.body.payload || '';
      const userId = String(payload.split('_').pop() || '');
      const key = genKey();
      saveKey(key, userId, 'crypto', 'cryptobot');
      const lang = userLang.get(Number(userId)) || 'en';
      const t = L[lang];
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
  }).catch(e => {
    console.error('Webhook failed:', e.message);
    process.exit(1);
  });
} else {
  bot.api.deleteWebhook({ drop_pending_updates: true }).then(() => {
    app.listen(PORT, () => {
      console.log('Bot on port ' + PORT);
      setTimeout(() => bot.start().catch(e => console.error(e.message)), 3000);
    });
  }).catch(() => {
    app.listen(PORT, () => {
      console.log('Bot on port ' + PORT);
      setTimeout(() => bot.start().catch(e => console.error(e.message)), 3000);
    });
  });
}
