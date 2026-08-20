// Database layer
// In-memory store for development, Upstash Redis for production

const PREFIX = "rh:";

// In-memory fallback
const memStore = new Map();

// Try Upstash Redis if configured
let redis = null;
if (process.env.UPSTASH_REDIS_REST_URL && !process.env.UPSTASH_REDIS_REST_URL.includes("placeholder")) {
  try {
    const { Redis } = require("@upstash/redis");
    redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });
    console.log("Using Upstash Redis");
  } catch (e) {
    console.log("Redis unavailable, using in-memory store");
  }
} else {
  console.log("No Redis configured, using in-memory store");
}

// Generic get/set
async function storeGet(key) {
  if (redis) return redis.get(key);
  return memStore.get(key) || null;
}

async function storeSet(key, value) {
  if (redis) return redis.set(key, value);
  memStore.set(key, value);
}

async function storeHset(key, data) {
  if (redis) return redis.hset(key, data);
  const existing = memStore.get(key) || {};
  memStore.set(key, { ...existing, ...data });
}

async function storeHgetall(key) {
  if (redis) return redis.hgetall(key);
  return memStore.get(key) || null;
}

async function storeKeys(pattern) {
  if (redis) return redis.keys(pattern);
  const prefix = pattern.replace("*", "");
  const results = [];
  for (const k of memStore.keys()) {
    if (k.startsWith(prefix)) results.push(k);
  }
  return results;
}

async function storeLpush(key, value) {
  if (redis) return redis.lpush(key, value);
  const list = memStore.get(key) || [];
  list.unshift(value);
  memStore.set(key, list.slice(0, 1000));
}

async function storeLrange(key, start, stop) {
  if (redis) return redis.lrange(key, start, stop);
  const list = memStore.get(key) || [];
  return list.slice(start, stop + 1);
}

// --- Agent Management ---

async function createAgent({ agentId, walletAddress, handle, name, apiKey, chips }) {
  const key = PREFIX + "agent:" + agentId;
  const data = {
    agentId,
    walletAddress: walletAddress.toLowerCase(),
    handle: handle || agentId.slice(0, 8),
    name: name || handle || "Anonymous",
    apiKey,
    chips,
    handsPlayed: 0,
    handsWon: 0,
    totalChips: chips,
    createdAt: Date.now(),
    lastActive: Date.now()
  };
  await storeHset(key, data);
  await storeSet(PREFIX + "wallet:" + walletAddress.toLowerCase(), agentId);
  var akIndex = PREFIX + "apikey:" + apiKey;
  await storeSet(akIndex, agentId);
  return data;
}

async function getAgent(agentId) {
  const data = await storeHgetall(PREFIX + "agent:" + agentId);
  if (!data || Object.keys(data).length === 0) return null;
  data.chips = Number(data.chips) || 0;
  data.handsPlayed = Number(data.handsPlayed) || 0;
  data.handsWon = Number(data.handsWon) || 0;
  data.totalChips = Number(data.totalChips) || 0;
  return data;
}

async function getAgentByApiKey(ak) {
  const agentId = await storeGet(PREFIX + "apikey:" + ak);
  if (!agentId) return null;
  return getAgent(agentId);
}

async function getAgentByWallet(walletAddress) {
  const agentId = await storeGet(PREFIX + "wallet:" + walletAddress.toLowerCase());
  if (!agentId) return null;
  return getAgent(agentId);
}

async function updateAgent(agentId, updates) {
  const key = PREFIX + "agent:" + agentId;
  await storeHset(key, { ...updates, lastActive: Date.now() });
}

async function updateChips(agentId, newChips) {
  await updateAgent(agentId, { chips: newChips, totalChips: newChips });
}

async function recordHandResult(agentId, won) {
  const agent = await getAgent(agentId);
  if (!agent) return;
  await updateAgent(agentId, {
    handsPlayed: agent.handsPlayed + 1,
    handsWon: agent.handsWon + (won ? 1 : 0)
  });
}

// --- Leaderboard ---

async function getLeaderboard(limit = 50) {
  const keys = await storeKeys(PREFIX + "agent:*");
  if (!keys.length) return [];

  const agents = [];
  for (const key of keys) {
    const data = await storeHgetall(key);
    if (data && data.agentId) {
      agents.push({
        agentId: data.agentId,
        handle: data.handle || data.agentId.slice(0, 8),
        name: data.name || "Anonymous",
        chips: Number(data.chips) || 0,
        handsPlayed: Number(data.handsPlayed) || 0,
        handsWon: Number(data.handsWon) || 0
      });
    }
  }

  agents.sort((a, b) => b.chips - a.chips);
  return agents.slice(0, limit).map((a, i) => ({
    rank: i + 1,
    ...a,
    winRate: a.handsPlayed > 0 ? Math.round(a.handsWon * 100 / a.handsPlayed) : 0
  }));
}

// --- Hand History ---

async function recordHand(handData) {
  const id = Date.now() + "-" + Math.random().toString(36).slice(2, 6);
  await storeHset(PREFIX + "hand:" + id, {
    ...handData,
    id,
    timestamp: Date.now()
  });
  await storeLpush(PREFIX + "hands:recent", id);
}

async function getRecentHands(limit = 20) {
  const ids = await storeLrange(PREFIX + "hands:recent", 0, limit - 1);
  const hands = [];
  for (const id of ids) {
    const hand = await storeHgetall(PREFIX + "hand:" + id);
    if (hand) hands.push(hand);
  }
  return hands;
}

// --- Stats ---

async function getStats() {
  const keys = await storeKeys(PREFIX + "agent:*");
  const handKeys = await storeKeys(PREFIX + "hand:*");
  return {
    totalAgents: keys.length,
    totalHands: handKeys.length
  };
}

function getRedis() { return redis; }

module.exports = { getRedis,
  createAgent, getAgent, getAgentByApiKey, getAgentByWallet,
  updateAgent, updateChips, recordHandResult,
  getLeaderboard, recordHand, getRecentHands, getStats
};
