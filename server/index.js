// RH Poker Arena - Server Entry Point
// Express 5 API server

const express = require('express');
const path = require('path');
const { router: apiRoutes, setMatchmaker } = require('./api/routes');
const { Matchmaker } = require('./engine/matchmaker');

const app = express();
const PORT = process.env.PORT || 3000;

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

// Catch-all: serve public/index.html (Express 5 syntax)
app.get('/{*splat}', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`RH Poker Arena running on port ${PORT}`);
});

module.exports = app;
