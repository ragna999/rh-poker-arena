// Matchmaking Engine
// Manages queue and table formation

const { Table } = require('./table');
const { nanoid } = require('nanoid');

class Matchmaker {
  constructor(config = {}) {
    this.queue = [];                    // [{agentId, apiKey, joinedAt}]
    this.tables = new Map();            // tableId -> Table
    this.agentTable = new Map();        // agentId -> tableId
    this.config = {
      minPlayers: config.minPlayers || 2,
      maxPlayers: config.maxPlayers || 6,
      tableTimeout: config.tableTimeout || 30000,  // 30s to fill table
      startingChips: config.startingChips || 1000,
      smallBlind: config.smallBlind || 5,
      bigBlind: config.bigBlind || 10,
    };
  }

  // --- Queue ---

  joinQueue(agentId, apiKey) {
    // Already in queue?
    if (this.queue.find(q => q.agentId === agentId)) {
      return { status: 'already_queued' };
    }

    // Already at a table?
    if (this.agentTable.has(agentId)) {
      return { status: 'already_at_table', tableId: this.agentTable.get(agentId) };
    }

    this.queue.push({
      agentId,
      apiKey,
      joinedAt: Date.now()
    });

    // Try to form tables
    this.tryFormTables();

    return {
      status: 'queued',
      position: this.queue.findIndex(q => q.agentId === agentId) + 1,
      queueSize: this.queue.length
    };
  }

  leaveQueue(agentId) {
    const idx = this.queue.findIndex(q => q.agentId === agentId);
    if (idx === -1) return false;
    this.queue.splice(idx, 1);
    return true;
  }

  removeFromAll(agentId) {
    this.leaveQueue(agentId);
    const tableId = this.agentTable.get(agentId);
    if (tableId) {
      const table = this.tables.get(tableId);
      if (table) {
        table.removePlayer(agentId);
        if (table.getPlayerCount() === 0) {
          this.tables.delete(tableId);
        }
      }
      this.agentTable.delete(agentId);
    }
  }

  // --- Table Formation ---

  tryFormTables() {
    while (this.queue.length >= this.config.minPlayers) {
      const players = this.queue.splice(0, this.config.maxPlayers);
      const tableId = nanoid(12);
      const table = new Table(tableId, this.config);

      for (const player of players) {
        table.addPlayer(player.agentId);
        this.agentTable.set(player.agentId, tableId);
      }

      this.tables.set(tableId, table);

      // Start first hand
      if (table.canStartHand()) {
        table.startHand();
      }
    }
  }

  // --- Game Actions ---

  getPendingActions(agentId) {
    const tableId = this.agentTable.get(agentId);
    if (!tableId) {
      return { tables: [], queuePosition: this.getQueuePosition(agentId) };
    }

    const table = this.tables.get(tableId);
    if (!table) {
      this.agentTable.delete(agentId);
      return { tables: [], queuePosition: null };
    }

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
          seatIndex: s.seatIndex
        }))
      }],
      winners: table.stage === "showdown" ? table.winners : undefined,
      queuePosition: null
    };
  }

  submitAction(agentId, tableId, action, amount = 0) {
    const table = this.tables.get(tableId);
    if (!table) return { error: 'Table not found' };

    const seat = table.seats.find(s => s.agentId === agentId);
    if (!seat) return { error: 'Not at this table' };

    const current = table.getCurrentPlayer();
    if (!current || current.agentId !== agentId) return { error: 'Not your turn' };

    const result = table.executeAction(seat.seatIndex, action, amount);
    if (result.error) return result;

    // Advance game
    const advance = table.advanceToNextPlayer();

    // Check if hand is over
    if (table.stage === 'showdown') {
      this.handleHandComplete(table);
    }

    return {
      success: true,
      table: table.getState(),
      advance
    };
  }

  handleHandComplete(table) {
    // Remove busted players
    const busted = table.seats.filter(s => s.chips <= 0 && s.folded);
    for (const seat of busted) {
      this.agentTable.delete(seat.agentId);
    }

    // Check if enough players for next hand
    if (!table.canStartHand()) {
      // Move remaining players back to queue or remove
      for (const seat of table.seats) {
        if (seat.chips > 0) {
          this.agentTable.delete(seat.agentId);
        }
      }
      this.tables.delete(table.id);
      return;
    }

    // Start next hand after short delay
    setTimeout(() => {
      if (this.tables.has(table.id)) {
        table.startHand();
      }
    }, 2000);
  }

  // --- Status ---

  getQueuePosition(agentId) {
    const idx = this.queue.findIndex(q => q.agentId === agentId);
    return idx === -1 ? null : idx + 1;
  }

  getTable(agentId) {
    const tableId = this.agentTable.get(agentId);
    return tableId ? this.tables.get(tableId) : null;
  }

  getStats() {
    return {
      queueSize: this.queue.length,
      activeTables: this.tables.size,
      totalPlayers: this.agentTable.size
    };
  }
}

module.exports = { Matchmaker };
