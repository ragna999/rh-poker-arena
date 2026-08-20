// Redis-backed Matchmaker
// All state persisted to Redis for Vercel serverless

const { Table } = require("./table");
const { getRedis } = require("../../db/redis");

const PREFIX = "rh:mm:";

class RedisMatchmaker {
  constructor(config = {}) {
    this.config = {
      minPlayers: config.minPlayers || 2,
      maxPlayers: config.maxPlayers || 6,
      startingChips: config.startingChips || 10000,
      smallBlind: config.smallBlind || 5,
      bigBlind: config.bigBlind || 10,
    };
  }

  redis() {
    return getRedis();
  }

  // --- Queue ---

  async joinQueue(agentId) {
    const r = this.redis();
    if (!r) return { error: "Redis unavailable" };

    // Check if already at a table
    const tableId = await r.get(PREFIX + "agent-table:" + agentId);
    if (tableId) {
      return { status: "already_at_table", tableId };
    }

    // Check if already in queue
    const inQueue = await r.sismember(PREFIX + "queue", agentId);
    if (inQueue) {
      const pos = await r.scard(PREFIX + "queue");
      return { status: "already_queued", position: pos };
    }

    // Add to queue
    await r.sadd(PREFIX + "queue", agentId);

    // Try to form tables
    await this.safeFormTables()

    const pos = await r.scard(PREFIX + "queue");
    return { status: "queued", position: pos, queueSize: pos };
  }

  async leaveQueue(agentId) {
    const r = this.redis();
    if (!r) return false;
    await r.srem(PREFIX + "queue", agentId);
    return true;
  }

  async getQueuePosition(agentId) {
    const r = this.redis();
    if (!r) return null;
    const inQueue = await r.sismember(PREFIX + "queue", agentId);
    if (!inQueue) return null;
    return await r.scard(PREFIX + "queue");
  }

  // --- Table Formation ---

  async tryFormTables() {
    const r = this.redis();
    if (!r) return;

    const members = await r.smembers(PREFIX + 'queue');
    if (!members || members.length < this.config.minPlayers) return;

    const players = members.slice(0, this.config.maxPlayers);

    // Remove from queue
    await r.srem(PREFIX + 'queue', ...players);

    // Create table
    const tableId = 'tbl_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const table = new Table(tableId, this.config);

    for (const agentId of players) {
      table.addPlayer(agentId);
    }

    // Start hand
    table.startHand();

    // Save all to Redis in one batch if possible
    await r.set(PREFIX + 'table:' + tableId, table.serialize());
    await r.sadd(PREFIX + 'tables', tableId);
    for (const agentId of players) {
      await r.set(PREFIX + 'agent-table:' + agentId, tableId);
    }
  }

  async safeFormTables() {
    try {
      await this.tryFormTables();
    } catch(e) {
      console.error('safeFormTables error:', e.message);
    }
  }

  // --- Stats ---

  async getStats() {
    const r = this.redis();
    if (!r) return { queueSize: 0, activeTables: 0, totalPlayers: 0 };

    const queueSize = await r.scard(PREFIX + "queue");
    const tableIds = await r.smembers(PREFIX + "tables");
    let totalPlayers = 0;
    for (const tid of tableIds) {
      const json = await r.get(PREFIX + "table:" + tid);
      if (json) {
        const t = Table.deserialize(json);
        totalPlayers += t.seats.length;
      }
    }

    return {
      queueSize,
      activeTables: tableIds.length,
      totalPlayers,
    };
  }
}

module.exports = { RedisMatchmaker };
