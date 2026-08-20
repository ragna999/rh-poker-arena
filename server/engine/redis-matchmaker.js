// Redis-backed Matchmaker for Vercel serverless
// All state persisted to Redis

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

  r() {
    return getRedis();
  }

  // --- Queue ---

  async joinQueue(agentId) {
    const r = this.r();
    if (!r) return { error: "Redis unavailable" };

    const tableId = await r.get(PREFIX + "at:" + agentId);
    if (tableId) {
      return { status: "already_at_table", tableId };
    }

    const inQueue = await r.sismember(PREFIX + "q", agentId);
    if (inQueue) {
      const pos = await r.scard(PREFIX + "q");
      return { status: "already_queued", position: pos };
    }

    await r.sadd(PREFIX + "q", agentId);
    console.log("joinQueue:", agentId);

    try {
      await this.formTables();
    } catch (e) {
      console.error("formTables error:", e.message);
    }

    const pos = await r.scard(PREFIX + "q");
    return { status: "queued", position: pos, queueSize: pos };
  }

  async leaveQueue(agentId) {
    const r = this.r();
    if (!r) return false;
    await r.srem(PREFIX + "q", agentId);
    return true;
  }

  // --- Table Formation ---

  async formTables() {
    const r = this.r();
    if (!r) return;

    const members = await r.smembers(PREFIX + "q");
    console.log("formTables queue:", members.length, "members");
    if (!members || members.length < this.config.minPlayers) return;

    const players = members.slice(0, this.config.maxPlayers);
    if (players.length > 0) {
      await r.srem(PREFIX + "q", ...players);
    }

    const tid = "t" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const table = new Table(tid, this.config);

    for (const agentId of players) {
      table.addPlayer(agentId);
    }

    const started = table.startHand();
    if (!started) {
      for (const agentId of players) {
        await r.sadd(PREFIX + "q", agentId);
      }
      return;
    }

    console.log("formTables creating:", tid, "for");
    await r.set(PREFIX + "t:" + tid, table.serialize());
    await r.sadd(PREFIX + "ts", tid);
    for (const agentId of players) {
      await r.set(PREFIX + "at:" + agentId, tid);
    }
  }

  // --- Game Actions ---

  async getPendingActions(agentId) {
    const r = this.r();
    if (!r) return { tables: [], queuePosition: null };

    try {
      const tableId = await r.get(PREFIX + "at:" + agentId);
      if (!tableId) {
        const inQueue = await r.sismember(PREFIX + "q", agentId);
        return {
          tables: [],
          queuePosition: inQueue ? await r.scard(PREFIX + "q") : null
        };
      }

      const tableJson = await r.get(PREFIX + "t:" + tableId);
      if (!tableJson) {
        await r.del(PREFIX + "at:" + agentId);
        return { tables: [], queuePosition: null };
      }

      const table = Table.deserialize(tableJson);
      const ps = table.getPlayerState(agentId);
      if (!ps) return { tables: [], queuePosition: null };

      const isMyTurn = table.getCurrentPlayer()?.agentId === agentId;

      // Check for cached showdown result
      const lastResult = await r.get(PREFIX + "lr:" + tableId);
      let showdownResult = null;
      if (lastResult) {
        showdownResult = lastResult;
      }

      return {
        tables: [{
          tableId: table.id,
          stage: table.stage,
          board: table.board,
          pot: table.pot,
          handNumber: table.handNumber,
          holeCards: ps.holeCards,
          chips: ps.chips,
          folded: ps.folded,
          allIn: ps.allIn,
          actions: isMyTurn ? ps.actions : [],
          callAmount: ps.callAmount,
          minRaiseTo: ps.minRaiseTo,
          maxCommit: ps.maxCommit,
          isMyTurn,
          seats: table.seats.map(s => ({
            agentId: s.agentId,
            chips: s.chips,
            bet: s.bet,
            folded: s.folded,
            seatIndex: s.seatIndex,
          })),
          lastHand: showdownResult,
        }],
        queuePosition: null,
      };
    } catch (e) {
      console.error("getPending error:", e.message);
      return { tables: [], queuePosition: null };
    }
  }

  async submitAction(agentId, tableId, action, amount) {
    const r = this.r();
    if (!r) return { error: "Redis unavailable" };

    const tableJson = await r.get(PREFIX + "t:" + tableId);
    if (!tableJson) return { error: "Table not found" };

    const table = Table.deserialize(tableJson);

    const seat = table.seats.find(s => s.agentId === agentId);
    if (!seat) return { error: "Not at this table" };

    const current = table.getCurrentPlayer();
    if (!current || current.agentId !== agentId) return { error: "Not your turn" };

    const result = table.executeAction(seat.seatIndex, action, amount);
    if (result.error) return result;

    table.advanceToNextPlayer();

    let showdownData = null;

    if (table.stage === "showdown") {
      showdownData = {
        winners: table.winners,
        board: table.board,
        pot: table.pot,
      };

      const busted = table.seats.filter(s => s.chips <= 0 && s.folded);
      for (const s of busted) {
        await r.del(PREFIX + "at:" + s.agentId);
      }

      if (!table.canStartHand()) {
        for (const s of table.seats) {
          if (s.chips > 0) await r.del(PREFIX + "at:" + s.agentId);
        }
        await r.del(PREFIX + "t:" + tableId);
        await r.srem(PREFIX + "ts", tableId);
      } else {
        table.startHand();
        // Cache showdown result for pending to pick up
        await r.set(PREFIX + "lr:" + tableId, JSON.stringify(showdownData));
        // Auto-expire after 60 seconds
        await r.expire(PREFIX + "lr:" + tableId, 60);
      }
    } else {
      // Clear stale showdown cache if hand is still in progress
      await r.del(PREFIX + "lr:" + tableId);
    }

    await r.set(PREFIX + "t:" + tableId, table.serialize());

    return {
      success: true,
      table: table.getState(),
      lastHand: showdownData,
    };
  }



  // --- Spectator ---

  async getActiveTables() {
    const r = this.r();
    if (!r) return [];
    try {
      const tableIds = await r.smembers(PREFIX + 'ts');
      const tables = [];
      for (const tid of (tableIds || [])) {
        const json = await r.get(PREFIX + 't:' + tid);
        if (!json) continue;
        const t = Table.deserialize(json);
        const current = t.getCurrentPlayer();
        tables.push({
          tableId: t.id,
          stage: t.stage || 'waiting',
          board: t.board,
          pot: t.pot,
          handNumber: t.handNumber,
          currentPlayer: current ? current.agentId : null,
          seats: t.seats.map(s => ({
            agentId: s.agentId,
            chips: s.chips,
            bet: s.bet,
            folded: s.folded,
            seatIndex: s.seatIndex,
          })),
        });
      }
      return tables;
    } catch(e) {
      console.error('getActiveTables error:', e.message);
      return [];
    }
  }

  async getTableDetail(tableId) {
    const r = this.r();
    if (!r) return null;
    try {
      const json = await r.get(PREFIX + 't:' + tableId);
      if (!json) return null;
      const t = Table.deserialize(json);
      const current = t.getCurrentPlayer();
      const lastResult = await r.get(PREFIX + 'lr:' + tableId);
      return {
        tableId: t.id,
        stage: t.stage,
        board: t.board,
        pot: t.pot,
        handNumber: t.handNumber,
        dealerIndex: t.dealerIndex,
        currentPlayer: current ? current.agentId : null,
        seats: t.seats.map(s => ({
          agentId: s.agentId,
          chips: s.chips,
          bet: s.bet,
          folded: s.folded,
          allIn: s.allIn,
          seatIndex: s.seatIndex,
        })),
        lastHand: lastResult || null,
      };
    } catch(e) {
      console.error('getTableDetail error:', e.message);
      return null;
    }
  }

  // --- Stats ---

  async getStats() {
    const r = this.r();
    if (!r) return { queueSize: 0, activeTables: 0, totalPlayers: 0 };

    try {
      const queueSize = await r.scard(PREFIX + "q");
      const tableIds = await r.smembers(PREFIX + "ts");
      let totalPlayers = 0;
      for (const tid of (tableIds || [])) {
        const json = await r.get(PREFIX + "t:" + tid);
        if (json) {
          const t = Table.deserialize(json);
          totalPlayers += t.seats.length;
        }
      }
      return { queueSize: queueSize || 0, activeTables: (tableIds || []).length, totalPlayers };
    } catch (e) {
      console.error("getStats error:", e.message);
      return { queueSize: 0, activeTables: 0, totalPlayers: 0 };
    }
  }
}

module.exports = { RedisMatchmaker };
