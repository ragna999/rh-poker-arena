// Poker Table Engine
// Manages table state, dealing, betting rounds, winner determination

const { createDeck, shuffle, rankValue } = require('./deck');
const { evaluateHand, compareHands } = require('./evaluator');

const STAGES = ['preflop', 'flop', 'turn', 'river', 'showdown'];

class Table {
  constructor(id, config = {}) {
    this.id = id;
    this.maxPlayers = config.maxPlayers || 6;
    this.smallBlind = config.smallBlind || 5;
    this.bigBlind = config.bigBlind || 10;
    this.startingChips = config.startingChips || 1000;

    this.seats = [];        // [{agentId, chips, holeCards, bet, folded, allIn, seatIndex}]
    this.board = [];
    this.pot = 0;
    this.sidePots = [];
    this.deck = [];
    this.stage = null;      // null = waiting, 'preflop'..'showdown'
    this.dealerIndex = 0;
    this.currentPlayerIndex = 0;
    this.minRaise = this.bigBlind;
    this.lastRaise = 0;
    this.actedThisRound = new Set();
    this.handNumber = 0;
    this.winners = [];
    this.activeCount = 0;
  }

  // --- Seat Management ---

  addPlayer(agentId) {
    if (this.seats.length >= this.maxPlayers) return null;
    if (this.seats.find(s => s.agentId === agentId)) return null;

    const seatIndex = this.seats.length;
    const seat = {
      agentId,
      chips: this.startingChips,
      holeCards: [],
      bet: 0,
      totalBet: 0,
      folded: false,
      allIn: false,
      seatIndex
    };
    this.seats.push(seat);
    return seatIndex;
  }

  removePlayer(agentId) {
    const idx = this.seats.findIndex(s => s.agentId === agentId);
    if (idx === -1) return false;
    this.seats.splice(idx, 1);
    // Reindex seats
    this.seats.forEach((s, i) => s.seatIndex = i);
    return true;
  }

  getPlayerCount() {
    return this.seats.length;
  }

  getActivePlayers() {
    return this.seats.filter(s => !s.folded && s.chips >= 0);
  }

  // --- Hand Flow ---

  canStartHand() {
    const active = this.seats.filter(s => s.chips > 0);
    return active.length >= 2;
  }

  startHand() {
    if (!this.canStartHand()) return false;

    this.handNumber++;
    this.board = [];
    this.pot = 0;
    this.sidePots = [];
    this.winners = [];
    this.minRaise = this.bigBlind;
    this.lastRaise = 0;
    this.actedThisRound = new Set();

    // Reset seat state
    for (const seat of this.seats) {
      seat.holeCards = [];
      seat.bet = 0;
      seat.totalBet = 0;
      seat.folded = seat.chips <= 0;
      seat.allIn = false;
    }

    // Shuffle deck
    this.deck = shuffle(createDeck());

    // Move dealer button
    this.advanceDealer();

    // Post blinds
    this.postBlinds();

    // Deal hole cards
    for (const seat of this.getSeatedPlayers()) {
      seat.holeCards = [this.deck.pop(), this.deck.pop()];
    }

    // Set stage
    this.stage = 'preflop';

    // Set current player (UTG = after big blind)
    const bbIndex = this.getBlindIndex('big');
    this.currentPlayerIndex = this.nextActiveIndex(bbIndex);

    this.activeCount = this.getSeatedPlayers().filter(s => !s.folded).length;

    return true;
  }

  advanceDealer() {
    const seated = this.getSeatedPlayers();
    if (seated.length === 0) return;

    let next = (this.dealerIndex + 1) % this.seats.length;
    while (this.seats[next].chips <= 0) {
      next = (next + 1) % this.seats.length;
      if (next === this.dealerIndex) break;
    }
    this.dealerIndex = next;
  }

  getSeatedPlayers() {
    return this.seats.filter(s => s.chips > 0 || s.holeCards.length > 0);
  }

  postBlinds() {
    const seated = this.getSeatedPlayers();
    if (seated.length < 2) return;

    const sbIndex = this.getBlindIndex('small');
    const bbIndex = this.getBlindIndex('big');

    this.placeBet(sbIndex, Math.min(this.smallBlind, this.seats[sbIndex].chips));
    this.placeBet(bbIndex, Math.min(this.bigBlind, this.seats[bbIndex].chips));

    this.minRaise = this.bigBlind * 2;
  }

  getBlindIndex(type) {
    const seated = this.getSeatedPlayers();
    const dealerPos = seated.findIndex(s => s.seatIndex === this.dealerIndex);

    if (seated.length === 2) {
      // Heads up: dealer=SB, other=BB
      if (type === 'small') return seated[dealerPos].seatIndex;
      return seated[(dealerPos + 1) % seated.length].seatIndex;
    }

    if (type === 'small') {
      return seated[(dealerPos + 1) % seated.length].seatIndex;
    }
    return seated[(dealerPos + 2) % seated.length].seatIndex;
  }

  placeBet(seatIndex, amount) {
    const seat = this.seats[seatIndex];
    const actual = Math.min(amount, seat.chips);
    seat.chips -= actual;
    seat.bet += actual;
    seat.totalBet += actual;
    this.pot += actual;
    if (seat.chips === 0) seat.allIn = true;
    return actual;
  }

  // --- Betting Round ---

  getCurrentPlayer() {
    if (this.stage === null || this.stage === 'showdown') return null;
    const seat = this.seats[this.currentPlayerIndex];
    if (!seat || seat.folded || seat.allIn) return null;
    return seat;
  }

  getActions(seatIndex) {
    const seat = this.seats[seatIndex];
    if (!seat || seat.folded || seat.allIn) return [];

    const actions = ['fold'];

    // Check if anyone has bet more than us
    const maxBet = Math.max(...this.seats.filter(s => !s.folded).map(s => s.bet));
    const toCall = maxBet - seat.bet;

    if (toCall === 0) {
      actions.push('check');
    } else {
      actions.push('call');
    }

    if (seat.chips > toCall) {
      actions.push('raise');
    }

    return actions;
  }

  getCallAmount(seatIndex) {
    const seat = this.seats[seatIndex];
    const maxBet = Math.max(...this.seats.filter(s => !s.folded).map(s => s.bet));
    return Math.min(maxBet - seat.bet, seat.chips);
  }

  getMinRaiseTo(seatIndex) {
    const seat = this.seats[seatIndex];
    const maxBet = Math.max(...this.seats.filter(s => !s.folded).map(s => s.bet));
    return Math.min(maxBet + this.minRaise, seat.chips + seat.bet);
  }

  executeAction(seatIndex, action, amount = 0) {
    const seat = this.seats[seatIndex];
    if (!seat || seat.folded || seat.allIn) return { error: 'Not your turn' };

    const maxBet = Math.max(...this.seats.filter(s => !s.folded).map(s => s.bet));
    const toCall = maxBet - seat.bet;

    switch (action) {
      case 'fold':
        seat.folded = true;
        break;

      case 'check':
        if (toCall > 0) return { error: 'Cannot check, must call or raise' };
        break;

      case 'call': {
        const callAmount = Math.min(toCall, seat.chips);
        this.placeBet(seatIndex, callAmount);
        break;
      }

      case 'raise': {
        const raiseTo = Math.max(amount, maxBet + this.minRaise);
        const raiseAmount = raiseTo - seat.bet;
        if (raiseAmount > seat.chips) return { error: 'Not enough chips' };
        this.lastRaise = raiseTo - maxBet;
        this.minRaise = this.lastRaise;
        this.placeBet(seatIndex, raiseAmount);
        this.actedThisRound.clear();
        break;
      }

      default:
        return { error: 'Invalid action' };
    }

    this.actedThisRound.add(seatIndex);
    return { success: true };
  }

  advanceToNextPlayer() {
    const seated = this.getSeatedPlayers().filter(s => !s.folded && !s.allIn);

    // Check if betting round is over
    if (this.isBettingRoundComplete(seated)) {
      return this.advanceStage();
    }

    // Find next player
    let next = (this.currentPlayerIndex + 1) % this.seats.length;
    let tries = 0;
    while (tries < this.seats.length) {
      const seat = this.seats[next];
      if (!seat.folded && !seat.allIn && !this.actedThisRound.has(next)) {
        this.currentPlayerIndex = next;
        return { action: 'continue', currentPlayer: next };
      }
      // Player acted but there might be new action needed
      if (!seat.folded && !seat.allIn && this.actedThisRound.has(next)) {
        // Check if everyone has acted
        const allActed = seated.every(s => this.actedThisRound.has(s.seatIndex));
        if (allActed) {
          return this.advanceStage();
        }
      }
      next = (next + 1) % this.seats.length;
      tries++;
    }

    // Everyone folded or all-in
    return this.advanceStage();
  }

  isBettingRoundComplete(seated) {
    if (!seated) seated = this.getSeatedPlayers().filter(s => !s.folded && !s.allIn);

    // Only one player left
    if (seated.length <= 1) return true;

    // All players all-in
    if (seated.length === 0) return true;

    // Everyone has acted and bets are equal
    const maxBet = Math.max(...this.seats.filter(s => !s.folded).map(s => s.bet));
    const allEqual = seated.every(s => s.bet === maxBet || s.allIn);
    const allActed = seated.every(s => this.actedThisRound.has(s.seatIndex));

    return allEqual && allActed;
  }

  advanceStage() {
    const stageIdx = STAGES.indexOf(this.stage);

    // Reset for new round
    this.actedThisRound.clear();
    for (const seat of this.seats) {
      seat.bet = 0;
    }
    this.minRaise = this.bigBlind;

    // Check if only one player left (everyone else folded)
    const active = this.seats.filter(s => !s.folded);
    if (active.length === 1) {
      return this.awardPot([{seat: active[0], hand: null}]);
    }

    // Move to next stage
    if (stageIdx < STAGES.length - 1) {
      this.stage = STAGES[stageIdx + 1];

      switch (this.stage) {
        case 'flop':
          this.board.push(this.deck.pop(), this.deck.pop(), this.deck.pop());
          break;
        case 'turn':
          this.board.push(this.deck.pop());
          break;
        case 'river':
          this.board.push(this.deck.pop());
          break;
        case 'showdown':
          return this.showdown();
      }

      // Set first player after dealer
      const dealerNext = this.nextActiveIndex(this.dealerIndex);
      this.currentPlayerIndex = dealerNext;

      // Skip all-in players
      while (this.seats[this.currentPlayerIndex].allIn ||
             this.seats[this.currentPlayerIndex].folded) {
        this.currentPlayerIndex = this.nextActiveIndex(this.currentPlayerIndex);
      }

      return { action: 'stage', stage: this.stage, board: this.board };
    }

    return this.showdown();
  }

  nextActiveIndex(from) {
    let next = (from + 1) % this.seats.length;
    let tries = 0;
    while (tries < this.seats.length) {
      if (!this.seats[next].folded && !this.seats[next].allIn) {
        return next;
      }
      next = (next + 1) % this.seats.length;
      tries++;
    }
    return from;
  }

  // --- Showdown ---

  showdown() {
    const active = this.seats.filter(s => !s.folded);

    // Evaluate hands
    const hands = active.map(seat => ({
      seat,
      hand: evaluateHand(seat.holeCards, this.board)
    }));

    // Sort by hand strength (best first)
    hands.sort((a, b) => compareHands(b.hand, a.hand));

    // Find winner(s) - could be split pot
    const winners = [hands[0]];
    for (let i = 1; i < hands.length; i++) {
      if (compareHands(hands[i].hand, hands[0].hand) === 0) {
        winners.push(hands[i]);
      } else {
        break;
      }
    }

    return this.awardPot(winners);
  }

  awardPot(winners) {
    const share = Math.floor(this.pot / winners.length);
    const remainder = this.pot % winners.length;

    this.winners = winners.map((w, i) => {
      const amount = share + (i === 0 ? remainder : 0);
      w.seat.chips += amount;
      return {
        agentId: w.seat.agentId,
        amount,
        hand: w.hand ? w.hand.name : 'Winner'
      };
    });

    this.stage = 'showdown';
    return {
      action: 'showdown',
      winners: this.winners,
      board: this.board,
      pot: this.pot
    };
  }

  // --- Serialization ---

  getState() {
    return {
      id: this.id,
      stage: this.stage,
      board: this.board,
      pot: this.pot,
      handNumber: this.handNumber,
      dealerIndex: this.dealerIndex,
      currentPlayer: this.currentPlayerIndex,
      minRaise: this.minRaise,
      seats: this.seats.map(s => ({
        agentId: s.agentId,
        chips: s.chips,
        bet: s.bet,
        folded: s.folded,
        allIn: s.allIn,
        seatIndex: s.seatIndex,
        holeCards: s.holeCards.length > 0 ? s.holeCards : undefined
      })),
      winners: this.winners
    };
  }

  getPlayerState(agentId) {
    const seat = this.seats.find(s => s.agentId === agentId);
    if (!seat) return null;

    const actions = this.getActions(seat.seatIndex);
    const callAmount = this.getCallAmount(seat.seatIndex);
    const minRaiseTo = this.getMinRaiseTo(seat.seatIndex);
    const maxBet = Math.max(...this.seats.filter(s => !s.folded).map(s => s.bet));

    return {
      holeCards: seat.holeCards,
      chips: seat.chips,
      bet: seat.bet,
      folded: seat.folded,
      allIn: seat.allIn,
      seatIndex: seat.seatIndex,
      actions,
      callAmount,
      minRaiseTo,
      maxCommit: seat.chips + seat.bet,
      pot: this.pot,
      board: this.board,
      stage: this.stage,
      handNumber: this.handNumber
    };
  }
}
module.exports = { Table, STAGES };
