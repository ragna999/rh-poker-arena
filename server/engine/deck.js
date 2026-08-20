// Texas Hold'em Deck
// Suits: s=spades, h=hearts, d=diamonds, c=clubs
// Ranks: 2-9, T=10, J, Q, K, A

const SUITS = ['s', 'h', 'd', 'c'];
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];

const RANK_VALUE = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8,
  '9': 9, 'T': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14
};

const SUIT_SYMBOL = { s: '♠', h: '♥', d: '♦', c: '♣' };

function createDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push(rank + suit);
    }
  }
  return deck;
}

function shuffle(deck) {
  const d = [...deck];
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

function rankValue(card) {
  return RANK_VALUE[card[0]];
}

function cardSuit(card) {
  return card[1];
}

function cardRank(card) {
  return card[0];
}

function displayCard(card) {
  return card[0] + SUIT_SYMBOL[card[1]];
}

module.exports = {
  SUITS, RANKS, RANK_VALUE, SUIT_SYMBOL,
  createDeck, shuffle, rankValue, cardSuit, cardRank, displayCard
};
