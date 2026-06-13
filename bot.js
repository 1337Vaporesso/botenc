const express = require('express');
const { Bot, InlineKeyboard, webhookCallback } = require('grammy');
const { randomUUID } = require('crypto');

const BOT_TOKEN = process.env.BOT_TOKEN;
const PROVIDER_TOKEN = process.env.PROVIDER_TOKEN;
const CRYPTOBOT_TOKEN = process.env.CRYPTOBOT_TOKEN;
const ADMIN_IDS = (process.env.ADMIN_IDS || '').split(',').map(Number);
const PORT = process.env.PORT || 8080;
const BOT_USERNAME = process.env.BOT_USERNAME || '';
// Railway даёт домен автоматом, но можно указать вручную
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
function getStats() { return '📊 Keys: ' + store.total; }

const PLANS = {
  buy_1month:  { label: '1 Month',  stars: 30,  usdt: 10 },
  buy_3months: { label: '3 Months', stars: 70,  usdt: 25 },
  buy_lifetime:{ label: 'Lifetime', stars: 150, usdt: 50 },
};

const bot = new Bot(BOT_TOKEN);

function ignore(e) {
  if (e?.error_code === 400 && e?.description?.includes('message is not modified')) return;
  throw e;
}

bot.command('start', async (ctx) => {
  const kb = new InlineKeyboard()
    .text('1 Month — 10 USDT / 30 ⭐', 'buy_1month').row()
    .text('3 Months — 25 USDT / 70 ⭐', 'buy_3months').row()
    .text('Lifetime — 50 USDT / 150 ⭐', 'buy_lifetime');
  await ctx.reply('╔══ EncodeX Premium ══╗\n\nBypass TikTok compression.\nWatermark: @encodexhd\n\nChoose:', { reply_markup: kb });
});

bot.callbackQuery(/buy_(.+)/, async (ctx) => {
  const plan = PLANS[ctx.match[0]];
  if (!plan) { await ctx.answerCallbackQuery(); return; }
  const kb = new InlineKeyboard();
  if (PROVIDER_TOKEN) kb.text('⭐ Telegram Stars', 'pay_stars_' + ctx.match[0]);
  if (PROVIDER_TOKEN && CRYPTOBOT_TOKEN) kb.row();
  if (CRYPTOBOT_TOKEN) kb.text('💎 CryptoBot (USDT)', 'pay_crypto_' + ctx.match[0]);
  try { await ctx.editMessageText('Plan: ' + plan.label + '\nPrice: ' + plan.usdt + ' USDT' + (PROVIDER_TOKEN ? ' / ' + plan.stars + ' ⭐' : '') + '\n\nChoose payment:', { reply_markup: kb }); } catch (e) { ignore(e); }
  await ctx.answerCallbackQuery();
});

bot.callbackQuery(/pay_stars_(.+)/, async (ctx) => {
  if (!PROVIDER_TOKEN) { await ctx.answerCallbackQuery(); return; }
  const plan = PLANS[ctx.match[1]];
  if (!plan) { await ctx.answerCallbackQuery(); return; }
  try {
    const invoice = await bot.api.createInvoiceLink(
      'EncodeX Premium — ' + plan.label,
      'Premium key for ' + plan.label,
      'stars_' + plan.label + '_' + ctx.from.id, '',
      'XTR',
      [{ label: 'EncodeX ' + plan.label, amount: plan.stars }],
      { provider_token: PROVIDER_TOKEN }
    );
    await ctx.editMessageText('⭐ ' + plan.stars + ' Stars\n\nPay:', { reply_markup: new InlineKeyboard().url('💳 Pay', invoice) });
  } catch (e) { ignore(e); }
  await ctx.answerCallbackQuery();
});

bot.on('pre_checkout_query', async (ctx) => ctx.answerPreCheckoutQuery(true));

bot.on('message:successful_payment', async (ctx) => {
  const key = genKey();
  saveKey(key, String(ctx.from.id), ctx.from.username || ctx.from.first_name || 'user', 'stars');
  await ctx.reply('✅ Paid!\n\nKey: `' + key + '`\n\nOpen EncodeX → Profile → Activate', { parse_mode: 'Markdown' });
});

bot.callbackQuery(/pay_crypto_(.+)/, async (ctx) => {
  if (!CRYPTOBOT_TOKEN) {
    await ctx.editMessageText('❌ CRYPTOBOT_TOKEN not set'); await ctx.answerCallbackQuery(); return;
  }
  const plan = PLANS[ctx.match[1]];
  if (!plan) { await ctx.answerCallbackQuery(); return; }
  try {
    const res = await fetch('https://pay.crypt.bot/api/createInvoice', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Crypto-Pay-API-Key': CRYPTOBOT_TOKEN },
      body: JSON.stringify({
        asset: 'USDT', amount: plan.usdt,
        description: 'EncodeX Premium — ' + plan.label,
        paid_btn_name: 'openBot',
        paid_btn_url: 'https://t.me/' + BOT_USERNAME,
        payload: 'crypto_' + plan.label + '_' + ctx.from.id
      })
    });
    const data = await res.json();
    if (!data.ok) {
      await ctx.answerCallbackQuery(); await ctx.reply('❌ CryptoBot error:\n' + JSON.stringify(data)); return;
    }
    await ctx.editMessageText('💎 ' + plan.usdt + ' USDT\n\nPay:', { reply_markup: new InlineKeyboard().url('💳 Pay', data.result.bot_invoice_url) });
  } catch (e) {
    await ctx.answerCallbackQuery(); await ctx.reply('❌ Exception:\n' + (e.message || e)); return;
  }
  await ctx.answerCallbackQuery();
});

bot.callbackQuery('back', async (ctx) => {
  const kb = new InlineKeyboard()
    .text('1 Month — 10 USDT / 30 ⭐', 'buy_1month').row()
    .text('3 Months — 25 USDT / 70 ⭐', 'buy_3months').row()
    .text('Lifetime — 50 USDT / 150 ⭐', 'buy_lifetime');
  try { await ctx.editMessageText('Choose:', { reply_markup: kb }); } catch (e) { ignore(e); }
  await ctx.answerCallbackQuery();
});

bot.command('stats', async (ctx) => {
  if (!ADMIN_IDS.includes(ctx.from.id)) return;
  await ctx.reply(getStats());
});

bot.command('genkeys', async (ctx) => {
  if (!ADMIN_IDS.includes(ctx.from.id)) return;
  const keys = [];
  for (let i = 0; i < 10; i++) { const k = genKey(); saveKey(k); keys.push(k); }
  await ctx.reply('Generated 10 keys:\n```\n' + keys.join('\n') + '\n```', { parse_mode: 'Markdown' });
});

// Express
const app = express();
app.use(express.json());

// CryptoBot webhook
app.post('/cryptobot-webhook', async (req, res) => {
  try {
    if (req.body?.update_type === 'invoice_paid') {
      const userId = String(req.body.payload?.split('_')?.pop() || '');
      const key = genKey();
      saveKey(key, userId, 'crypto', 'cryptobot');
      try { await bot.api.sendMessage(userId, '✅ Paid!\n\nKey: `' + key + '`\n\nOpen EncodeX → Profile → Activate', { parse_mode: 'Markdown' }); } catch {}
    }
  } catch {}
  res.sendStatus(200);
});

app.get('/', (req, res) => res.send('EncodeX Bot'));

// Webhook mode
if (WEBHOOK_DOMAIN) {
  app.post('/webhook', webhookCallback(bot, 'express'));
  bot.api.setWebhook(WEBHOOK_DOMAIN + '/webhook', { drop_pending_updates: true }).then(() => {
    console.log('Webhook set to ' + WEBHOOK_DOMAIN + '/webhook');
    app.listen(PORT, () => console.log('Bot on port ' + PORT));
  }).catch(e => {
    console.error('Webhook setup failed:', e.message);
    process.exit(1);
  });
} else {
  // Polling mode
  bot.api.deleteWebhook({ drop_pending_updates: true }).then(() => {
    bot.start();
    app.listen(PORT, () => console.log('Bot on port ' + PORT));
  }).catch(e => {
    console.error('Polling setup failed:', e.message);
    process.exit(1);
  });
}
