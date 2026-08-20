// Server handler (used by both local server and Vercel)
try { require("dotenv").config(); } catch(e) {}

const express = require("express");
const path = require("path");
const { router: apiRoutes, setMatchmaker } = require("./api/routes");
const { RedisMatchmaker } = require("./engine/redis-matchmaker");

const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, "..", "public")));

// Use Redis-backed matchmaker
const matchmaker = new RedisMatchmaker({
  minPlayers: 2,
  maxPlayers: 6,
  startingChips: 10000,
  smallBlind: 5,
  bigBlind: 10
});
setMatchmaker(matchmaker);

app.use("/api", apiRoutes);

app.get("/health", async (req, res) => {
  const stats = await matchmaker.getStats();
  res.json({ status: "ok", ...stats });
});

app.get("/{*splat}", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "index.html"));
});

module.exports = app;
