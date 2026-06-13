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

const L = {
  en: {
    title: '\u2728 <b>EncodeX Premium</b>',
    desc: 'Bypass TikTok compression \u2022 Watermark <code>@encodexhd</code>\nUnlimited videos \u2022 No limits \u2022 Lifetime',
    select: '<b>Select:</b>',
    lifetime: '\uD83D\uDC51 Lifetime \u2014 50 USDT',
    lifetime_stars: '\uD83D\uDC51 Lifetime \u2014 50 USDT / 150 \u2B50',
    plan_title: '\uD83D\uDC51 <b>Lifetime Access</b>',
    plan_price: '\uD83D\uDCB0 <b>50 USDT</b>' + (PROVIDER_TOKEN ? ' / <b>150 \u2B50</b>' : ''),
    plan_desc: '<i>One-time payment \u2022 Unlimited usage \u2022 No expiry</i>',
    choose_payment: '<i>Choose payment:</i>',
    stars: '\u2B50 Telegram Stars',
    crypto: '\uD83D\uDC8E CryptoBot (USDT)',
    back: '\u2190 Back',
    creating: '\u23F3 <b>Creating invoice...</b>',
    pay_stars: '\uD83D\uDCB3 Pay 150 \u2B50',
    stars_pay_title: '\u2B50 Telegram Stars',
    stars_pay_info: '<i>Tap the button to complete payment</i>',
    crypto_pay_title: '\uD83D\uDC8E CryptoBot (USDT)',
    crypto_pay_info: '<i>Tap the button to pay with CryptoBot</i>',
    pay_usdt: '\uD83D\uDCB3 Pay 50 USDT',
    success: '\u2705 <b>Payment Successful!</b>',
    success_info: 'Your key: <code>{key}</code>\n\nOpen <b>EncodeX</b> \u2192 <b>Profile</b> \u2192 <b>Activate</b>',
    timeout: '\u274C <b>Timeout</b>\nCryptoBot API did not respond in 15s',
    err_no_token: '\u274C Crypto token not configured',
    err_plan: '\u274C CryptoBot error:\n<code>{data}</code>',
    err_exc: '\u274C <b>Error</b>\n<code>{msg}</code>',
    err_crypto: '\u274C CryptoBot error:\n<code>{data}</code>',
    stats: '\uD83D\uDCCA <b>Stats:</b> {n}',
    genkeys: '\uD83D\uDD11 <b>Generated 10 keys:</b>\n<code>{keys}</code>'
  },
  ru: {
    title: '\u2728 <b>EncodeX Premium</b>',
    desc: '\u041E\u0431\u0445\u043E\u0434 \u0441\u0436\u0430\u0442\u0438\u044F TikTok \u2022 \u0412\u0430\u0442\u0435\u0440\u043C\u0430\u0440\u043A <code>@encodexhd</code>\n\u0411\u0435\u0437\u043B\u0438\u043C\u0438\u0442\u043D\u043E \u2022 \u041D\u0430\u0432\u0441\u0435\u0433\u0434\u0430',
    select: '<b>\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435:</b>',
    lifetime: '\uD83D\uDC51 \u041D\u0430\u0432\u0441\u0435\u0433\u0434\u0430 \u2014 50 USDT',
    lifetime_stars: '\uD83D\uDC51 \u041D\u0430\u0432\u0441\u0435\u0433\u0434\u0430 \u2014 50 USDT / 150 \u2B50',
    plan_title: '\uD83D\uDC51 <b>\u041D\u0430\u0432\u0441\u0435\u0433\u0434\u0430</b>',
    plan_price: '\uD83D\uDCB0 <b>50 USDT</b>' + (PROVIDER_TOKEN ? ' / <b>150 \u2B50</b>' : ''),
    plan_desc: '<i>\u041E\u0434\u0438\u043D \u043F\u043B\u0430\u0442\u0435\u0436 \u2022 \u0411\u0435\u0437 \u043B\u0438\u043C\u0438\u0442\u043E\u0432 \u2022 \u041D\u0430\u0432\u0441\u0435\u0433\u0434\u0430</i>',
    choose_payment: '<i>\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u043E\u043F\u043B\u0430\u0442\u0443:</i>',
    stars: '\u2B50 Telegram Stars',
    crypto: '\uD83D\uDC8E CryptoBot (USDT)',
    back: '\u2190 \u041D\u0430\u0437\u0430\u0434',
    creating: '\u23F3 <b>\u0421\u043E\u0437\u0434\u0430\u0451\u043C \u0438\u043D\u0432\u043E\u0439\u0441...</b>',
    pay_stars: '\uD83D\uDCB3 \u041E\u043F\u043B\u0430\u0442\u0438\u0442\u044C 150 \u2B50',
    stars_pay_title: '\u2B50 Telegram Stars',
    stars_pay_info: '<i>\u041D\u0430\u0436\u043C\u0438\u0442\u0435 \u043A\u043D\u043E\u043F\u043A\u0443 \u0434\u043B\u044F \u043E\u043F\u043B\u0430\u0442\u044B</i>',
    crypto_pay_title: '\uD83D\uDC8E CryptoBot (USDT)',
    crypto_pay_info: '<i>\u041D\u0430\u0436\u043C\u0438\u0442\u0435 \u043A\u043D\u043E\u043F\u043A\u0443 \u0434\u043B\u044F \u043E\u043F\u043B\u0430\u0442\u044B</i>',
    pay_usdt: '\uD83D\uDCB3 \u041E\u043F\u043B\u0430\u0442\u0438\u0442\u044C 50 USDT',
    success: '\u2705 <b>\u041E\u043F\u043B\u0430\u0442\u0430 \u043F\u0440\u043E\u0448\u043B\u0430!</b>',
    success_info: '\u041A\u043B\u044E\u0447: <code>{key}</code>\n\n\u041E\u0442\u043A\u0440\u043E\u0439\u0442\u0435 <b>EncodeX</b> \u2192 <b>\u041F\u0440\u043E\u0444\u0438\u043B\u044C</b> \u2192 <b>\u0410\u043A\u0442\u0438\u0432\u0430\u0446\u0438\u044F</b>',
    timeout: '\u274C <b>\u0422\u0430\u0439\u043C\u0430\u0443\u0442</b>\nCryptoBot API \u043D\u0435 \u043E\u0442\u0432\u0435\u0442\u0438\u043B \u0437\u0430 15\u0441',
    err_no_token: '\u274C \u0422\u043E\u043A\u0435\u043D Crypto \u043D\u0435 \u043D\u0430\u0441\u0442\u0440\u043E\u0435\u043D',
    err_plan: '\u274C \u041E\u0448\u0438\u0431\u043A\u0430 CryptoBot:\n<code>{data}</code>',
    err_exc: '\u274C <b>\u041E\u0448\u0438\u0431\u043A\u0430</b>\n<code>{msg}</code>',
    err_crypto: '\u274C \u041E\u0448\u0438\u0431\u043A\u0430 CryptoBot:\n<code>{data}</code>',
    stats: '\uD83D\uDCCA <b>\u0421\u0442\u0430\u0442\u0438\u0441\u0442\u0438\u043A\u0430:</b> {n}',
    genkeys: '\uD83D\uDD11 <b>\u0421\u0433\u0435\u043D\u0435\u0440\u0438\u0440\u043E\u0432\u0430\u043D\u043E 10 \u043A\u043B\u044E\u0447\u0435\u0439:</b>\n<code>{keys}</code>'
  }
};

// ── Commands ────────────────────────────────────────

bot.command('start', async (ctx) => {
  const lang = ctx.from.language_code === 'ru' ? 'ru' : 'en';
  const t = L[lang];
  const kb = new InlineKeyboard()
    .text(t.lifetime_stars, 'buy_lifetime');
  await ctx.reply(
    t.title + '\n\n' + t.desc + '\n\n' + t.select,
    { parse_mode: 'HTML', reply_markup: kb }
  );
});

// ── Buy Lifetime (anchored!) ─────────────────────────

bot.callbackQuery(/^buy_lifetime$/, async (ctx) => {
  const lang = ctx.from.language_code === 'ru' ? 'ru' : 'en';
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

// ── Stars Payment ────────────────────────────────────

bot.callbackQuery(/^pay_stars_lifetime$/, async (ctx) => {
  if (!PROVIDER_TOKEN) { await ctx.answerCallbackQuery(); return; }
  const lang = ctx.from.language_code === 'ru' ? 'ru' : 'en';
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
  const lang = ctx.from.language_code === 'ru' ? 'ru' : 'en';
  const t = L[lang];
  const key = genKey();
  saveKey(key, String(ctx.from.id), ctx.from.username || ctx.from.first_name || 'user', 'stars');
  await ctx.reply(
    t.success + '\n\n' + t.success_info.replace('{key}', key),
    { parse_mode: 'HTML' }
  );
});

// ── CryptoBot Payment ────────────────────────────────

bot.callbackQuery(/^pay_crypto_lifetime$/, async (ctx) => {
  const lang = ctx.from.language_code === 'ru' ? 'ru' : 'en';
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
      headers: { 'Content-Type': 'application/json', 'Crypto-Pay-API-Key': CRYPTOBOT_TOKEN },
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

// ── Back to start ────────────────────────────────────

bot.callbackQuery(/^back_start$/, async (ctx) => {
  const lang = ctx.from.language_code === 'ru' ? 'ru' : 'en';
  const t = L[lang];
  const kb = new InlineKeyboard().text(t.lifetime_stars, 'buy_lifetime');
  await ctx.editMessageText(
    t.title + '\n\n' + t.desc + '\n\n' + t.select,
    { parse_mode: 'HTML', reply_markup: kb }
  ).catch(() => {});
  await ctx.answerCallbackQuery();
});

// ── Admin ────────────────────────────────────────────

bot.command('stats', async (ctx) => {
  if (!ADMIN_IDS.includes(ctx.from.id)) return;
  const lang = ctx.from.language_code === 'ru' ? 'ru' : 'en';
  await ctx.reply(L[lang].stats.replace('{n}', getStats()), { parse_mode: 'HTML' });
});

bot.command('genkeys', async (ctx) => {
  if (!ADMIN_IDS.includes(ctx.from.id)) return;
  const lang = ctx.from.language_code === 'ru' ? 'ru' : 'en';
  const keys = [];
  for (let i = 0; i < 10; i++) { const k = genKey(); saveKey(k); keys.push(k); }
  await ctx.reply(
    L[lang].genkeys.replace('{keys}', keys.join('\n')),
    { parse_mode: 'HTML' }
  );
});

// ── Express ──────────────────────────────────────────

const app = express();
app.use(express.json());

app.post('/cryptobot-webhook', async (req, res) => {
  try {
    if (req.body?.update_type === 'invoice_paid') {
      const payload = req.body.payload || '';
      const userId = String(payload.split('_').pop() || '');
      const key = genKey();
      saveKey(key, userId, 'crypto', 'cryptobot');
      const lang = userId.startsWith('ru') ? 'ru' : 'en';
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
