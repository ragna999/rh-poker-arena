// RH Poker Arena - Server Entry Point (local dev)
const app = require('./app');

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`RH Poker Arena running on port ${PORT}`);
});
