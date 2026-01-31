import { SUITS, validateMeld, handHasAnyMeld } from "./rules.js";

function makeDeck() {
  const deck = [];
  let id = 0;
  for (const suit of SUITS) {
    for (let rank=1; rank<=13; rank++) {
      deck.push({ id: `c${id++}`, rank, suit, isJoker:false });
    }
  }
  // two jokers
  deck.push({ id: `j${id++}`, rank:null, suit:null, isJoker:true });
  deck.push({ id: `j${id++}`, rank:null, suit:null, isJoker:true });
  return deck;
}

function shuffle(a) {
  for (let i=a.length-1;i>0;i--) {
    const j = Math.floor(Math.random()*(i+1));
    [a[i],a[j]]=[a[j],a[i]];
  }
  return a;
}

export function createRoom(roomCode, handSize=7) {
  return {
    roomCode,
    handSize,
    players: [],
    turnIndex: 0,
    deck: [],
    floor: [],
    phase: "lobby",
    turn: { droppedThisTurn:false, grabbedThisTurn:false },
    lastActionLog: []
  };
}

export function addPlayer(room, socketId, name) {
  if (room.phase !== "lobby") throw new Error("game already started");
  if (room.players.some(p => p.socketId === socketId)) return;
  room.players.push({ socketId, name, hand: [] });
}

export function startGame(room) {
  if (room.players.length < 2) throw new Error("need at least 2 players");
  room.deck = shuffle(makeDeck());
  room.floor = [];
  room.turnIndex = 0;
  room.phase = "playing";
  room.turn = { droppedThisTurn:false, grabbedThisTurn:false };

  for (const p of room.players) {
    p.hand = [];
    for (let i=0;i<room.handSize;i++) p.hand.push(drawCard(room));
  }
  log(room, "Game started.");
}

export function drawCard(room) {
  const c = room.deck.pop();
  if (!c) throw new Error("deck empty");
  return c;
}

export function canDraw(room, socketId) {
  const player = room.players[room.turnIndex];
  if (player.socketId !== socketId) return false;
  return !handHasAnyMeld(player.hand);
}

export function dropMeld(room, socketId, cardIds) {
  const player = room.players[room.turnIndex];
  if (player.socketId !== socketId) throw new Error("not your turn");

  const cards = cardIds.map(id => player.hand.find(c => c.id === id)).filter(Boolean);
  if (cards.length !== cardIds.length) throw new Error("one or more cards not in hand");

  const res = validateMeld(cards);
  if (!res.ok) throw new Error("invalid meld");

  player.hand = player.hand.filter(c => !cardIds.includes(c.id));

  room.floor.push({
    meldId: `m${Date.now()}_${Math.random().toString(16).slice(2)}`,
    cards,
    containsJoker: cards.some(c => c.isJoker)
  });

  room.turn.droppedThisTurn = true;
  log(room, `${player.name} dropped a meld.`);
  return res;
}

export function drawOneAndEndTurn(room, socketId) {
  if (!canDraw(room, socketId)) throw new Error("you still have a legal meld; must drop it first");
  const player = room.players[room.turnIndex];
  player.hand.push(drawCard(room));
  log(room, `${player.name} drew 1 card.`);
  room.turn = { droppedThisTurn:false, grabbedThisTurn:false };
  room.turnIndex = (room.turnIndex + 1) % room.players.length;
}

export function grabFromFloor(room, socketId, meldId, cardIdToGrab, cardIdToDrop) {
  const player = room.players[room.turnIndex];
  if (player.socketId !== socketId) throw new Error("not your turn");
  if (!room.turn.droppedThisTurn) throw new Error("must drop before grabbing");
  if (room.turn.grabbedThisTurn) throw new Error("already grabbed this turn");

  const meld = room.floor.find(m => m.meldId === meldId);
  if (!meld) throw new Error("meld not found");
  const card = meld.cards.find(c => c.id === cardIdToGrab);
  if (!card) throw new Error("card not found");
  if (card.isJoker) throw new Error("cannot grab joker");

  const dropCard = player.hand.find(c => c.id === cardIdToDrop);
  if (!dropCard) throw new Error("drop card not in hand");

  player.hand = player.hand.filter(c => c.id !== cardIdToDrop);
  player.hand.push(card);

  meld.cards = meld.cards.filter(c => c.id !== cardIdToGrab);
  room.floor = room.floor.filter(m => m.cards.length > 0);

  room.floor.push({
    meldId: `d${Date.now()}_${Math.random().toString(16).slice(2)}`,
    cards: [dropCard],
    containsJoker: dropCard.isJoker
  });

  room.turn.grabbedThisTurn = true;
  log(room, `${player.name} grabbed from floor.`);
}

export function showHand(room, socketId) {
  const player = room.players[room.turnIndex];
  if (player.socketId !== socketId) throw new Error("not your turn");

  const myTotal = total(player.hand);

  for (const p of room.players) {
    if (p.socketId === player.socketId) continue;
    const t = total(p.hand);
    if (t <= myTotal) {
      room.phase = "ended";
      log(room, `${player.name} SHOWED (${myTotal}) and LOST to ${p.name} (${t}).`);
      return { result:"lose", myTotal, opponent: p.name, opponentTotal: t };
    }
  }

  room.phase = "ended";
  log(room, `${player.name} SHOWED (${myTotal}) and WON!`);
  return { result:"win", myTotal };
}

function total(hand) {
  return hand.reduce((sum,c)=>{
    if (c.isJoker) return sum + 2; // your house default: joker counts as 2 (adjust later)
    if (c.rank === 1) return sum + 1;
    return sum + c.rank;
  }, 0);
}

function log(room, msg) {
  room.lastActionLog.push({ t: Date.now(), msg });
  room.lastActionLog = room.lastActionLog.slice(-40);
}
