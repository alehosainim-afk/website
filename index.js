const express = require('express');
const session = require('express-session');
const axios = require('axios');
const { MongoClient } = require('mongodb');
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
      <img class="sellauth-icon" src="https://chroto.mysellauth.com/favicon.ico" alt="SellAuth">
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
    const response = await axios.get('https://plisio.net/api/v1/invoices/new', {
      params: {
        api_key: process.env.PLISIO_API_KEY,
        currency: 'LTC',
        amount,
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
    if (data.status !== 'completed') return res.sendStatus(200);
 
    const orderNumber = data.order_number;
    const pending = await db.collection('pending').findOne({ order_number: orderNumber });
    if (!pending) return res.sendStatus(200);
 
    await addBalance(pending.user_id, pending.amount);
    await db.collection('pending').deleteOne({ order_number: orderNumber });
 
    console.log(`Added $${pending.amount} to user ${pending.user_id}`);
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
 
