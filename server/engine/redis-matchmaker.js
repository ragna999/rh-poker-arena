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
    await this.tryFormTables();

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

    while (true) {
      const members = await r.smembers(PREFIX + "queue");
      if (members.length < this.config.minPlayers) break;

      // Take up to maxPlayers from queue
      const players = members.slice(0, this.config.maxPlayers);

      // Remove from queue
      for (const p of players) {
        await r.srem(PREFIX + "queue", p);
      }

      // Create table
      const tableId = "tbl_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      const table = new Table(tableId, this.config);

      for (const agentId of players) {
        table.addPlayer(agentId);
        await r.set(PREFIX + "agent-table:" + agentId, tableId);
      }

      // Start first hand
      if (table.canStartHand()) {
        table.startHand();
      }

      // Save table
      await r.set(PREFIX + "table:" + tableId, table.serialize());
      await r.sadd(PREFIX + "tables", tableId);
    }
  }

  // --- Game Actions ---

  async getPendingActions(agentId) {
    const r = this.redis();
    if (!r) return { tables: [], queuePosition: null };

    const tableId = await r.get(PREFIX + "agent-table:" + agentId);
    if (!tableId) {
      const pos = await this.getQueuePosition(agentId);
      return { tables: [], queuePosition: pos };
    }

    const tableJson = await r.get(PREFIX + "table:" + tableId);
    if (!tableJson) {
      await r.del(PREFIX + "agent-table:" + agentId);
      return { tables: [], queuePosition: null };
    }

    const table = Table.deserialize(tableJson);
    const playerState = table.getPlayerState(agentId);
    if (!playerState) return { tables: [], queuePosition: null };

    const seat = table.seats.find(s => s.agentId === agentId);
    const isMyTurn = table.getCurrentPlayer()?.agentId === agentId;

    return {
      tables: [{
        tableId: table.id,
        stage: table.stage,
        board: table.board,
        pot: table.pot,
        handNumber: table.handNumber,
        holeCards: playerState.holeCards,
        chips: playerState.chips,
        folded: playerState.folded,
        allIn: playerState.allIn,
        actions: isMyTurn ? playerState.actions : [],
        callAmount: playerState.callAmount,
        minRaiseTo: playerState.minRaiseTo,
        maxCommit: playerState.maxCommit,
        isMyTurn,
        seats: table.seats.map(s => ({
          agentId: s.agentId,
          chips: s.chips,
          bet: s.bet,
          folded: s.folded,
          seatIndex: s.seatIndex,
        })),
        winners: table.stage === "showdown" ? table.winners : undefined,
      }],
      queuePosition: null,
    };
  }

  async submitAction(agentId, tableId, action, amount) {
    const r = this.redis();
    if (!r) return { error: "Redis unavailable" };

    const tableJson = await r.get(PREFIX + "table:" + tableId);
    if (!tableJson) return { error: "Table not found" };

    const table = Table.deserialize(tableJson);

    const seat = table.seats.find(s => s.agentId === agentId);
    if (!seat) return { error: "Not at this table" };

    const current = table.getCurrentPlayer();
    if (!current || current.agentId !== agentId) return { error: "Not your turn" };

    const result = table.executeAction(seat.seatIndex, action, amount);
    if (result.error) return result;

    // Advance game
    table.advanceToNextPlayer();

    // Check if hand is over
    if (table.stage === "showdown") {
      await this.handleHandComplete(table, r);
    }

    // Save table
    await r.set(PREFIX + "table:" + tableId, table.serialize());

    return {
      success: true,
      table: table.getState(),
    };
  }

  async handleHandComplete(table, r) {
    // Remove busted players
    const busted = table.seats.filter(s => s.chips <= 0 && s.folded);
    for (const seat of busted) {
      await r.del(PREFIX + "agent-table:" + seat.agentId);
    }

    // Check if enough players for next hand
    if (!table.canStartHand()) {
      for (const seat of table.seats) {
        if (seat.chips > 0) {
          await r.del(PREFIX + "agent-table:" + seat.agentId);
        }
      }
      await r.del(PREFIX + "table:" + table.id);
      await r.srem(PREFIX + "tables", table.id);
      return;
    }

    // Start next hand immediately
    table.startHand();
    await r.set(PREFIX + "table:" + table.id, table.serialize());
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
