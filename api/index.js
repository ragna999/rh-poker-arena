// Vercel serverless - self-contained entry point
process.env.NODE_ENV = process.env.NODE_ENV || 'production';
try { require('dotenv').config(); } catch(e) {}

const express = require('express');
const path = require('path');
const { router: apiRoutes, setMatchmaker } = require('../server/api/routes');
const { Matchmaker } = require('../server/engine/matchmaker');

const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

const matchmaker = new Matchmaker({
  minPlayers: 2,
  maxPlayers: 6,
  startingChips: 10000,
  smallBlind: 5,
  bigBlind: 10
});
setMatchmaker(matchmaker);

app.use('/api', apiRoutes);

app.get('/health', (req, res) => {
  res.json({ status: 'ok', ...matchmaker.getStats() });
});

app.get('/{*splat}', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// Vercel expects a request handler function
module.exports = (req, res) => app(req, res);
