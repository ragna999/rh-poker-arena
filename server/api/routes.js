// Game API Routes (async for Redis-backed matchmaker)

const { Router } = require("express");
const { nanoid } = require("nanoid");
const { createAgent, getAgentByWallet, getAgent, updateChips, recordHandResult, recordHand, getLeaderboard, getStats } = require("../../db/redis");
const { authMiddleware } = require("../middleware/auth");

const router = Router();

let matchmaker = null;
function setMatchmaker(mm) { matchmaker = mm; }

// --- Register ---
router.post("/register", async (req, res) => {
  try {
    const { walletAddress, handle, name } = req.body;
    if (!walletAddress) {
      return res.status(400).json({ error: "walletAddress required" });
    }

    const existing = await getAgentByWallet(walletAddress);
    if (existing) {
      return res.json({
        agentId: existing.agentId,
        apiKey: existing.apiKey,
        chips: existing.chips,
        message: "Already registered"
      });
    }

    const baseChips = 10000;
    const agentId = nanoid(16);
    const apiKey = "rhp_" + nanoid(48);

    await createAgent({
      agentId,
      walletAddress,
      handle: handle || agentId.slice(0, 8),
      name: name || handle || "Anonymous",
      apiKey,
      chips: baseChips
    });

    res.json({
      agentId,
      apiKey,
      chips: baseChips,
      message: "Registered successfully"
    });
  } catch (err) {
    console.error("Register error:", err.stack || err.message || err);
    res.status(500).json({ error: "Internal error" });
  }
});

// --- Join Queue ---
router.post("/join", authMiddleware, async (req, res) => {
  try {
    const result = await matchmaker.joinQueue(req.agent.agentId);
    res.json(result);
  } catch (err) {
    console.error("Join error:", err.stack);
    res.status(500).json({ error: err.message });
  }
});

// --- Leave Queue ---
router.post("/leave", authMiddleware, async (req, res) => {
  try {
    const result = await matchmaker.leaveQueue(req.agent.agentId);
    res.json({ left: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Pending Actions ---
router.get("/pending", authMiddleware, async (req, res) => {
  try {
    const result = await matchmaker.getPendingActions(req.agent.agentId);
    res.json(result);
  } catch (err) {
    console.error("Pending error:", err.stack);
    res.status(500).json({ error: err.message });
  }
});

// --- Submit Action ---
router.post("/action", authMiddleware, async (req, res) => {
  try {
    const { tableId, action, amount } = req.body;
    if (!tableId || !action) {
      return res.status(400).json({ error: "tableId and action required" });
    }

    const result = await matchmaker.submitAction(req.agent.agentId, tableId, action, amount);
    if (result.error) {
      return res.status(400).json(result);
    }

    if (result.table && result.table.stage === "showdown" && result.table.winners) {
      for (const winner of result.table.winners) {
        await recordHandResult(winner.agentId, true);
      }
      const seatIds = result.table.seats.map(s => s.agentId);
      const winnerIds = result.table.winners.map(w => w.agentId);
      for (const id of seatIds) {
        if (!winnerIds.includes(id)) {
          await recordHandResult(id, false);
        }
      }
      for (const seat of result.table.seats) {
        await updateChips(seat.agentId, seat.chips);
      }
      await recordHand({
        tableId,
        handNumber: result.table.handNumber,
        board: result.table.board,
        pot: result.table.pot,
        winners: result.table.winners
      });
    }

    res.json(result);
  } catch (err) {
    console.error("Action error:", err.stack);
    res.status(500).json({ error: err.message });
  }
});

// --- Leaderboard ---
router.get("/leaderboard", async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 50, 100);
  const leaderboard = await getLeaderboard(limit);
  res.json(leaderboard);
});

// --- Stats ---
router.get("/stats", async (req, res) => {
  try {
    const dbStats = await getStats();
    const mmStats = matchmaker ? await matchmaker.getStats() : {};
    res.json({ ...dbStats, ...mmStats });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Agent Profile ---
router.get("/agent/:agentId", async (req, res) => {
  const agent = await getAgent(req.params.agentId);
  if (!agent) return res.status(404).json({ error: "Agent not found" });
  const { apiKey, ...safe } = agent;
  res.json(safe);
});

// --- My Profile ---
router.get("/me", authMiddleware, async (req, res) => {
  const { apiKey, ...safe } = req.agent;
  res.json(safe);
});

module.exports = { router, setMatchmaker };
