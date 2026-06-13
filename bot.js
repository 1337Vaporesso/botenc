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
function getStats() { return 'Keys: ' + store.total; }

const PLANS = {
  buy_1month:  { label: '1 Month',  stars: 30,  usdt: 10 },
  buy_3months: { label: '3 Months', stars: 70,  usdt: 25 },
  buy_lifetime:{ label: 'Lifetime', stars: 150, usdt: 50 },
};

const bot = new Bot(BOT_TOKEN);

// ── Helpers ──────────────────────────────────────────

function H(text) { return { parse_mode: 'HTML', disable_web_page_preview: true, text }; }
function escapeHtml(s) { return String(s).replace(/[<>&"']/g, function(m) { return {'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'}[m]; }); }

const backBtn = new InlineKeyboard().text('← Back', 'back');

// ── /start ───────────────────────────────────────────

bot.command('start', async (ctx) => {
  const kb = new InlineKeyboard()
    .text('1 Month  —  10 USDT  /  30 \u2B50', 'buy_1month').row()
    .text('3 Months  —  25 USDT  /  70 \u2B50', 'buy_3months').row()
    .text('Lifetime  —  50 USDT  /  150 \u2B50', 'buy_lifetime');
  await ctx.reply(
    '<b>\u2728 EncodeX Premium</b>\n\n'
    + 'Bypass TikTok compression \u2022 Watermark <code>@encodexhd</code>\n'
    + 'Unlimited videos \u2022 No limits \u2022 Lifetime access\n\n'
    + '<b>Select a plan:</b>',
    { parse_mode: 'HTML', reply_markup: kb }
  );
});

// ── Plan selection ───────────────────────────────────

bot.callbackQuery(/buy_(.+)/, async (ctx) => {
  const plan = PLANS[ctx.match[0]];
  if (!plan) { await ctx.answerCallbackQuery(); return; }
  const kb = new InlineKeyboard();
  if (PROVIDER_TOKEN) kb.text('\u2B50 Telegram Stars', 'pay_stars_' + ctx.match[0]);
  if (PROVIDER_TOKEN && CRYPTOBOT_TOKEN) kb.row();
  if (CRYPTOBOT_TOKEN) kb.text('\uD83D\uDC8E CryptoBot (USDT)', 'pay_crypto_' + ctx.match[0]);
  kb.row().text('\u2190 Back', 'back');
  await ctx.editMessageText(
    '<b>' + plan.label + '</b>\n\n'
    + '\uD83D\uDCB0 Price: <b>' + plan.usdt + ' USDT</b>'
    + (PROVIDER_TOKEN ? ' / <b>' + plan.stars + ' \u2B50</b>' : '') + '\n\n'
    + '<i>Choose payment method:</i>',
    { parse_mode: 'HTML', reply_markup: kb }
  ).catch(() => {});
  await ctx.answerCallbackQuery();
});

// ── Stars Payment ────────────────────────────────────

bot.callbackQuery(/pay_stars_(.+)/, async (ctx) => {
  if (!PROVIDER_TOKEN) { await ctx.answerCallbackQuery(); return; }
  const plan = PLANS[ctx.match[1]];
  if (!plan) { await ctx.answerCallbackQuery(); return; }
  try {
    const invoice = await bot.api.createInvoiceLink(
      'EncodeX \u2014 ' + plan.label,
      'Premium key for ' + plan.label,
      'stars_' + plan.label + '_' + ctx.from.id, '',
      'XTR',
      [{ label: 'EncodeX ' + plan.label, amount: plan.stars }],
      { provider_token: PROVIDER_TOKEN }
    );
    const kb = new InlineKeyboard().url('\uD83D\uDCB3 Pay ' + plan.stars + ' \u2B50', invoice).row().text('\u2190 Back', 'back');
    await ctx.editMessageText(
      '<b>\u2B50 Telegram Stars</b>\n\n'
      + 'Plan: <b>' + plan.label + '</b>\n'
      + 'Price: <b>' + plan.stars + ' \u2B50</b>\n\n'
      + '<i>Click the button below to complete payment:</i>',
      { parse_mode: 'HTML', reply_markup: kb }
    );
  } catch (e) {
    await ctx.answerCallbackQuery();
    await ctx.reply('\u274C Error: ' + escapeHtml(e.message || e), { parse_mode: 'HTML' });
    return;
  }
  await ctx.answerCallbackQuery();
});

bot.on('pre_checkout_query', async (ctx) => ctx.answerPreCheckoutQuery(true));

bot.on('message:successful_payment', async (ctx) => {
  const key = genKey();
  saveKey(key, String(ctx.from.id), ctx.from.username || ctx.from.first_name || 'user', 'stars');
  await ctx.reply(
    '\u2705 <b>Payment Successful!</b>\n\n'
    + 'Your key: <code>' + key + '</code>\n\n'
    + 'Open <b>EncodeX</b> \u2192 <b>Profile</b> \u2192 <b>Activate</b>',
    { parse_mode: 'HTML' }
  );
});

// ── CryptoBot Payment ────────────────────────────────

bot.callbackQuery(/pay_crypto_(.+)/, async (ctx) => {
  if (!CRYPTOBOT_TOKEN) {
    await ctx.editMessageText('\u274C CRYPTOBOT_TOKEN not set').catch(() => {});
    await ctx.answerCallbackQuery();
    return;
  }
  const plan = PLANS[ctx.match[1]];
  if (!plan) { await ctx.answerCallbackQuery(); return; }
  try {
    const payload = 'crypto_' + plan.label + '_' + ctx.from.id;
    const body = {
      asset: 'USDT',
      amount: plan.usdt,
      description: 'EncodeX Premium \u2014 ' + plan.label,
      paid_btn_name: 'openBot',
      paid_btn_url: 'https://t.me/' + (BOT_USERNAME || 'encodex_bot'),
      payload: payload
    };
    const res = await fetch('https://pay.crypt.bot/api/createInvoice', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Crypto-Pay-API-Key': CRYPTOBOT_TOKEN
      },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (!data.ok) {
      await ctx.answerCallbackQuery();
      await ctx.reply(
        '\u274C <b>CryptoBot Error</b>\n<code>' + escapeHtml(JSON.stringify(data, null, 2)) + '</code>',
        { parse_mode: 'HTML' }
      );
      return;
    }
    const kb = new InlineKeyboard()
      .url('\uD83D\uDCB3 Pay ' + plan.usdt + ' USDT', data.result.bot_invoice_url)
      .row()
      .text('\u2190 Back', 'back');
    await ctx.editMessageText(
      '<b>\uD83D\uDC8E CryptoBot (USDT)</b>\n\n'
      + 'Plan: <b>' + plan.label + '</b>\n'
      + 'Price: <b>' + plan.usdt + ' USDT</b>\n\n'
      + '<i>Click the button below to pay with CryptoBot:</i>',
      { parse_mode: 'HTML', reply_markup: kb }
    );
  } catch (e) {
    await ctx.answerCallbackQuery();
    await ctx.reply(
      '\u274C <b>Exception</b>\n<code>' + escapeHtml(e.message || String(e)) + '</code>',
      { parse_mode: 'HTML' }
    );
    return;
  }
  await ctx.answerCallbackQuery();
});

// ── Back button ──────────────────────────────────────

bot.callbackQuery('back', async (ctx) => {
  const kb = new InlineKeyboard()
    .text('1 Month  \u2014  10 USDT  /  30 \u2B50', 'buy_1month').row()
    .text('3 Months  \u2014  25 USDT  /  70 \u2B50', 'buy_3months').row()
    .text('Lifetime  \u2014  50 USDT  /  150 \u2B50', 'buy_lifetime');
  await ctx.editMessageText(
    '<b>\u2728 EncodeX Premium</b>\n\nSelect a plan:',
    { parse_mode: 'HTML', reply_markup: kb }
  ).catch(() => {});
  await ctx.answerCallbackQuery();
});

// ── Admin commands ───────────────────────────────────

bot.command('stats', async (ctx) => {
  if (!ADMIN_IDS.includes(ctx.from.id)) return;
  await ctx.reply('\uD83D\uDCCA <b>Stats:</b> ' + getStats(), { parse_mode: 'HTML' });
});

bot.command('genkeys', async (ctx) => {
  if (!ADMIN_IDS.includes(ctx.from.id)) return;
  const keys = [];
  for (let i = 0; i < 10; i++) { const k = genKey(); saveKey(k); keys.push(k); }
  await ctx.reply(
    '\uD83D\uDD11 <b>Generated 10 keys:</b>\n<code>' + keys.join('\n') + '</code>',
    { parse_mode: 'HTML' }
  );
});

// ── Express ──────────────────────────────────────────

const app = express();
app.use(express.json());

app.post('/cryptobot-webhook', async (req, res) => {
  try {
    if (req.body?.update_type === 'invoice_paid') {
      const userId = String((req.body.payload || '').split('_').pop() || '');
      const key = genKey();
      saveKey(key, userId, 'crypto', 'cryptobot');
      try {
        await bot.api.sendMessage(
          userId,
          '\u2705 <b>Payment Successful!</b>\n\nYour key: <code>' + key + '</code>\n\nOpen <b>EncodeX</b> \u2192 <b>Profile</b> \u2192 <b>Activate</b>',
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
