// Poker Hand Evaluator
// Evaluates best 5-card hand from 7 cards (2 hole + 5 board)
// Returns: { rank, name, kickers } where higher rank = better hand

const { rankValue, cardRank } = require('./deck');

const HAND_RANKS = {
  HIGH_CARD: 1,
  ONE_PAIR: 2,
  TWO_PAIR: 3,
  THREE_OF_A_KIND: 4,
  STRAIGHT: 5,
  FLUSH: 6,
  FULL_HOUSE: 7,
  FOUR_OF_A_KIND: 8,
  STRAIGHT_FLUSH: 9,
  ROYAL_FLUSH: 10
};

const HAND_NAMES = {
  1: 'High Card',
  2: 'One Pair',
  3: 'Two Pair',
  4: 'Three of a Kind',
  5: 'Straight',
  6: 'Flush',
  7: 'Full House',
  8: 'Four of a Kind',
  9: 'Straight Flush',
  10: 'Royal Flush'
};

function getCombinations(arr, k) {
  if (k === 0) return [[]];
  if (arr.length === 0) return [];
  const [first, ...rest] = arr;
  const withFirst = getCombinations(rest, k - 1).map(c => [first, ...c]);
  const withoutFirst = getCombinations(rest, k);
  return [...withFirst, ...withoutFirst];
}

function evaluateFiveCards(cards) {
  const values = cards.map(c => rankValue(c)).sort((a, b) => b - a);
  const suits = cards.map(c => c[1]);
  const valueCounts = {};
  for (const v of values) {
    valueCounts[v] = (valueCounts[v] || 0) + 1;
  }

  const isFlush = suits.every(s => s === suits[0]);

  // Check straight
  let isStraight = false;
  let straightHigh = 0;
  const unique = [...new Set(values)].sort((a, b) => b - a);

  if (unique.length >= 5) {
    for (let i = 0; i <= unique.length - 5; i++) {
      if (unique[i] - unique[i + 4] === 4) {
        isStraight = true;
        straightHigh = unique[i];
        break;
      }
    }
    // Wheel: A-2-3-4-5
    if (!isStraight && unique.includes(14) && unique.includes(2) && unique.includes(3) && unique.includes(4) && unique.includes(5)) {
      isStraight = true;
      straightHigh = 5; // 5-high straight
    }
  }

  // Group by count
  const groups = {};
  for (const [val, cnt] of Object.entries(valueCounts)) {
    if (!groups[cnt]) groups[cnt] = [];
    groups[cnt].push(Number(val));
  }
  for (const key of Object.keys(groups)) {
    groups[key].sort((a, b) => b - a);
  }

  // Royal flush
  if (isFlush && isStraight && straightHigh === 14) {
    return { rank: HAND_RANKS.ROYAL_FLUSH, name: 'Royal Flush', kickers: [14] };
  }

  // Straight flush
  if (isFlush && isStraight) {
    return { rank: HAND_RANKS.STRAIGHT_FLUSH, name: 'Straight Flush', kickers: [straightHigh] };
  }

  // Four of a kind
  if (groups[4]) {
    return { rank: HAND_RANKS.FOUR_OF_A_KIND, name: 'Four of a Kind', kickers: groups[4] };
  }

  // Full house
  if (groups[3] && groups[2]) {
    return { rank: HAND_RANKS.FULL_HOUSE, name: 'Full House', kickers: [...groups[3], ...groups[2]] };
  }

  // Flush
  if (isFlush) {
    return { rank: HAND_RANKS.FLUSH, name: 'Flush', kickers: values.slice(0, 5) };
  }

  // Straight
  if (isStraight) {
    return { rank: HAND_RANKS.STRAIGHT, name: 'Straight', kickers: [straightHigh] };
  }

  // Three of a kind
  if (groups[3]) {
    return { rank: HAND_RANKS.THREE_OF_A_KIND, name: 'Three of a Kind', kickers: groups[3] };
  }

  // Two pair
  if (groups[2] && groups[2].length >= 2) {
    return { rank: HAND_RANKS.TWO_PAIR, name: 'Two Pair', kickers: groups[2].slice(0, 2) };
  }

  // One pair
  if (groups[2]) {
    return { rank: HAND_RANKS.ONE_PAIR, name: 'One Pair', kickers: groups[2] };
  }

  // High card
  return { rank: HAND_RANKS.HIGH_CARD, name: 'High Card', kickers: values.slice(0, 5) };
}

function evaluateHand(holeCards, boardCards) {
  const allCards = [...holeCards, ...boardCards];

  if (allCards.length < 5) {
    // Not enough cards yet, evaluate what we have
    const sorted = allCards.map(c => rankValue(c)).sort((a, b) => b - a);
    return { rank: 0, name: 'Incomplete', kickers: sorted };
  }

  const combos = getCombinations(allCards, 5);
  let best = null;

  for (const combo of combos) {
    const result = evaluateFiveCards(combo);
    if (!best || compareHands(result, best) > 0) {
      best = result;
    }
  }

  return best;
}

function compareHands(a, b) {
  if (a.rank !== b.rank) return a.rank - b.rank;
  for (let i = 0; i < Math.min(a.kickers.length, b.kickers.length); i++) {
    if (a.kickers[i] !== b.kickers[i]) return a.kickers[i] - b.kickers[i];
  }
  return 0;
}

module.exports = { HAND_RANKS, HAND_NAMES, evaluateHand, evaluateFiveCards, compareHands };
