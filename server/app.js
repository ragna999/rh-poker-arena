// Server handler (used by both local server and Vercel)
require('dotenv').config();

const express = require('express');
const path = require('path');
const { router: apiRoutes, setMatchmaker } = require('./api/routes');
const { Matchmaker } = require('./engine/matchmaker');

const app = express();

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// Initialize matchmaker
const matchmaker = new Matchmaker({
  minPlayers: 2,
  maxPlayers: 6,
  startingChips: 10000,
  smallBlind: 5,
  bigBlind: 10
});
setMatchmaker(matchmaker);

// API Routes
app.use('/api', apiRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', ...matchmaker.getStats() });
});

// Catch-all: serve public/index.html
app.get('/{*splat}', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

module.exports = app;
