export const SUITS = ["S","H","D","C"];

export function validateSet(cards) {
  if (cards.length < 2 || cards.length > 4) return { ok:false, reason:"set size must be 2-4" };

  const nonJokers = cards.filter(c => !c.isJoker);
  const jokers = cards.filter(c => c.isJoker);

  const rank = nonJokers[0]?.rank ?? null;
  if (rank === null) return { ok:false, reason:"set cannot be all jokers" };
  if (!nonJokers.every(c => c.rank === rank)) return { ok:false, reason:"set ranks mismatch" };

  const suits = nonJokers.map(c => c.suit);
  const uniqueSuits = new Set(suits);

  const allSameSuit = uniqueSuits.size === 1;
  const allDifferentSuits = uniqueSuits.size === suits.length;

  if (!(allSameSuit || allDifferentSuits)) {
    return { ok:false, reason:"set suit rule violated" };
  }
  return { ok:true, type:"set", declared: { rank } };
}

function isQKA(nonJokerRanks) {
  // Q=12, K=13, A=1
  return nonJokerRanks.length === 3 &&
    nonJokerRanks.includes(12) &&
    nonJokerRanks.includes(13) &&
    nonJokerRanks.includes(1);
}

export function validateRun(cards) {
  if (cards.length < 3 || cards.length > 7) return { ok:false, reason:"run size must be 3-7" };

  const nonJokers = cards.filter(c => !c.isJoker);
  const jokers = cards.filter(c => c.isJoker);
  if (nonJokers.length === 0) return { ok:false, reason:"run cannot be all jokers" };

  const suit = nonJokers[0].suit;
  if (!nonJokers.every(c => c.suit === suit)) return { ok:false, reason:"run must be same suit" };

  const ranks = nonJokers.map(c => c.rank);
  const uniqueRanks = [...new Set(ranks)];
  if (uniqueRanks.length !== ranks.length) return { ok:false, reason:"duplicate rank in run" };

  // No jokers: straight check + QKA
  if (jokers.length === 0) {
    const sorted = [...ranks].sort((a,b)=>a-b);
    if (isQKA(sorted)) return { ok:true, type:"run", declared:{ suit, pattern:"QKA" } };

    for (let i=1;i<sorted.length;i++) {
      if (sorted[i] !== sorted[i-1] + 1) return { ok:false, reason:"run not consecutive" };
    }
    return { ok:true, type:"run", declared:{ suit, pattern:"normal" } };
  }

  // Jokers present:
  const N = cards.length;

  // Handle Q-🃏-A specifically as Q-K-A
  if (N === 3) {
    const hasQ = ranks.includes(12);
    const hasA = ranks.includes(1);
    const hasK = ranks.includes(13);
    if (hasQ && hasA && jokers.length === 1 && !hasK) {
      return { ok:true, type:"run", declared:{ suit, pattern:"QKA", jokerRanks:[13] } };
    }
  }

  // Try windows of length N from 1..13 (Ace treated as 1)
  for (let start=1; start<=13-N+1; start++) {
    const needed = [];
    for (let r=start; r<start+N; r++) needed.push(r);

    let missing = 0;
    for (const r of needed) if (!ranks.includes(r)) missing++;

    if (missing === jokers.length) {
      const jokerRanks = needed.filter(r => !ranks.includes(r));
      return { ok:true, type:"run", declared:{ suit, pattern:"normal", jokerRanks } };
    }
  }

  return { ok:false, reason:"jokers cannot form a valid run" };
}

export function validateMeld(cards) {
  const run = validateRun(cards);
  if (run.ok) return run;

  const set = validateSet(cards);
  if (set.ok) return set;

  return { ok:false, reason:`invalid meld` };
}

export function handHasAnyMeld(hand) {
  const maxSize = Math.min(7, hand.length);
  for (let size=2; size<=maxSize; size++) {
    const combs = combinations(hand, size);
    for (const c of combs) {
      const res = validateMeld(c);
      if (res.ok) return true;
    }
  }
  return false;
}

function combinations(arr, k) {
  const results = [];
  function helper(start, combo) {
    if (combo.length === k) { results.push([...combo]); return; }
    for (let i=start;i<arr.length;i++) {
      combo.push(arr[i]);
      helper(i+1, combo);
      combo.pop();
    }
  }
  helper(0, []);
  return results;
}
