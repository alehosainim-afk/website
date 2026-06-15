const express = require('express');
const session = require('express-session');
const axios = require('axios');
const { MongoClient } = require('mongodb');
const { Client: DiscordClient, GatewayIntentBits } = require('discord.js');
const discordBot = new DiscordClient({ intents: [GatewayIntentBits.Guilds] });
discordBot.login(process.env.BOT_TOKEN);
const path = require('path');
 
const app = express();
const mongoClient = new MongoClient(process.env.MONGODB_URI);
let db;
 
async function connectDB() {
  await mongoClient.connect();
  db = mongoClient.db('chroto-balance');
  console.log('Connected to MongoDB');
}
 
app.use(express.json());
app.use(express.static('.'));
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, maxAge: 7 * 24 * 60 * 60 * 1000 }
}));
 
const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const REDIRECT_URI = 'https://chroto.store/callback';
 
async function getBalance(userId) {
  const doc = await db.collection('balances').findOne({ _id: userId });
  return doc?.balance || 0;
}
 
async function addBalance(userId, amount) {
  const current = await getBalance(userId);
  const newBalance = current + amount;
  await db.collection('balances').updateOne(
    { _id: userId },
    { $set: { balance: newBalance } },
    { upsert: true }
  );
  return newBalance;
}
 
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});
 
app.get('/login', (req, res) => {
  const url = `https://discord.com/oauth2/authorize?client_id=${DISCORD_CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=identify`;
  res.redirect(url);
});
 
app.get('/callback', async (req, res) => {
  const code = req.query.code;
  if (!code) return res.redirect('/');
 
  try {
    const tokenRes = await axios.post('https://discord.com/api/oauth2/token', new URLSearchParams({
      client_id: DISCORD_CLIENT_ID,
      client_secret: DISCORD_CLIENT_SECRET,
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT_URI
    }), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
 
    const userRes = await axios.get('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${tokenRes.data.access_token}` }
    });
 
    req.session.user = {
      id: userRes.data.id,
      username: userRes.data.username,
      avatar: userRes.data.avatar
    };
 
    res.redirect('/dashboard');
  } catch (e) {
    console.log('OAuth error:', e.message);
    res.redirect('/');
  }
});
 
app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/');
});
 
app.get('/dashboard', async (req, res) => {
  if (!req.session.user) return res.redirect('/login');
  const balance = await getBalance(req.session.user.id);
  const avatarUrl = req.session.user.avatar
    ? `https://cdn.discordapp.com/avatars/${req.session.user.id}/${req.session.user.avatar}.png`
    : 'https://cdn.discordapp.com/embed/avatars/0.png';
 
  res.send(`<!DOCTYPE html>
<html>
<head>
  <title>Chroto Shop - Dashboard</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: #0d0d0d; color: white; font-family: 'Segoe UI', sans-serif; min-height: 100vh; display: flex; flex-direction: column; align-items: center; }
    .navbar { width: 100%; display: flex; justify-content: center; gap: 24px; padding: 20px; }
    .navbar a { display: flex; align-items: center; gap: 8px; text-decoration: none; color: #aaa; font-size: 15px; transition: color 0.2s; }
    .navbar a:hover { color: white; }
    .discord-icon { width: 40px; height: 24px; object-fit: contain; }
    .sellauth-icon { width: 32px; height: 32px; object-fit: contain; border-radius: 4px; }
    .card { background: #1a1a1a; border-radius: 12px; padding: 32px; margin-top: 40px; width: 90%; max-width: 400px; text-align: center; }
    .avatar { width: 80px; height: 80px; border-radius: 50%; margin-bottom: 12px; }
    .username { font-size: 20px; font-weight: 700; margin-bottom: 4px; }
    .balance { font-size: 36px; font-weight: 700; margin: 20px 0; color: #f0c040; }
    .balance-label { color: #888; font-size: 14px; margin-bottom: 20px; }
    .btn { display: inline-block; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; cursor: pointer; border: none; font-size: 15px; margin: 6px; transition: opacity 0.2s; }
    .btn:hover { opacity: 0.8; }
    .btn-green { background: #3ba55d; color: white; }
    .btn-red { background: #ed4245; color: white; }
    .topup-section { margin-top: 20px; }
    .topup-section input { background: #2a2a2a; border: 1px solid #333; color: white; padding: 10px 16px; border-radius: 8px; font-size: 15px; width: 100%; margin-bottom: 10px; }
    .topup-section input::placeholder { color: #666; }
    .msg { margin-top: 12px; font-size: 14px; }
  </style>
</head>
<body>
  <nav class="navbar">
    <a href="https://discord.gg/MuX5XyUyPC" target="_blank">
      <img class="discord-icon" src="https://assets-global.website-files.com/6257adef93867e50d84d30e2/636e0a6a49cf127bf92de1e2_icon_clyde_blurple_RGB.png" alt="Discord">
      Discord
    </a>
    <a href="https://chroto.mysellauth.com/" target="_blank">
      <img class="sellauth-icon" src="data:image/jpeg;base64,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" alt="SellAuth">
      Shop
    </a>
  </nav>
 
  <div class="card">
    <img class="avatar" src="${avatarUrl}" alt="Avatar">
    <div class="username">${req.session.user.username}</div>
    <div class="balance">$${balance.toFixed(2)}</div>
    <div class="balance-label">Chroto Balance</div>
 
    <div class="topup-section">
      <input type="number" id="amount" placeholder="Enter amount in USD (e.g. 10)" min="1" step="0.01">
      <button class="btn btn-green" onclick="topup()">Top Up with LTC</button>
      <div class="msg" id="msg"></div>
    </div>
 
    <a href="/logout" class="btn btn-red" style="margin-top: 20px; display: block;">Logout</a>
  </div>
 
  <script>
    async function topup() {
      const amount = document.getElementById('amount').value;
      if (!amount || amount <= 0) return document.getElementById('msg').innerText = 'Please enter a valid amount!';
      document.getElementById('msg').innerText = 'Creating invoice...';
      const res = await fetch('/create-invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount })
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        document.getElementById('msg').innerText = 'Error creating invoice. Try again!';
      }
    }
  </script>
</body>
</html>`);
});
 
app.post('/create-invoice', async (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Not logged in' });
  const amount = parseFloat(req.body.amount);
  if (!amount || amount <= 0) return res.status(400).json({ error: 'Invalid amount' });
 
  try {
        const ltcPrice = await axios.get('https://api.coingecko.com/api/v3/simple/price?ids=litecoin&vs_currencies=usd');
        const ltcAmount = (amount / ltcPrice.data.litecoin.usd).toFixed(8);

        const response = await axios.get('https://plisio.net/api/v1/invoices/new', {
          params: {
            api_key: process.env.PLISIO_API_KEY,
           currency: 'LTC',
            amount: ltcAmount,
        order_name: `Balance Top Up - ${req.session.user.username}`,
        order_number: `${req.session.user.id}-${Date.now()}`,
        callback_url: `https://chroto.store/plisio-webhook`,
        email: `${req.session.user.id}@chroto.store`
      }
    });
 
    if (response.data.status === 'success') {
      await db.collection('pending').insertOne({
        order_number: `${req.session.user.id}-${Date.now()}`,
        user_id: req.session.user.id,
        amount,
        created_at: new Date()
      });
      res.json({ url: response.data.data.invoice_url });
    } else {
      res.status(500).json({ error: 'Plisio error' });
    }
  } catch (e) {
    console.log('Plisio error:', e.message);
    res.status(500).json({ error: 'Error creating invoice' });
  }
});
 
app.post('/plisio-webhook', async (req, res) => {
  try {
    const data = req.body;
    console.log('Plisio webhook:', JSON.stringify(data));
    if (data.status !== 'completed') return res.sendStatus(200);
 
    const orderNumber = data.order_number;
    const pending = await db.collection('pending').findOne({ order_number: orderNumber });
    if (!pending) return res.sendStatus(200);
 
        await addBalance(pending.user_id, pending.amount);
        await db.collection('pending').deleteOne({ order_number: orderNumber });
        console.log(`Added $${pending.amount} to user ${pending.user_id}`);
        try {
          const user = await discordBot.users.fetch(pending.user_id);
          await user.send(`✅ Your balance has been topped up with **$${pending.amount}**!`);
        } catch (e) {
          console.log('DM error:', e.message);
        }
    res.sendStatus(200);
  } catch (e) {
    console.log('Webhook error:', e.message);
    res.sendStatus(500);
  }
});
 
app.get('/api/balance', async (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Not logged in' });
  const balance = await getBalance(req.session.user.id);
  res.json({ balance });
});
 
connectDB().then(() => {
  app.listen(3000, () => console.log('Website running on port 3000'));
});
 
