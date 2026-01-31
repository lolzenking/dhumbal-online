// Dhumbal Online - updated client
// Matches server events:
// create_room, join_room, start_game
// drop_meld, discard_one, pick_deck, pick_floor
// show
// receives: room_created, state, error_msg, show_result

const SERVER_URL = "https://dhumbal-online.onrender.com";
const socket = io(SERVER_URL, {
  transports: ["websocket", "polling"], // helps mobile reliability
});

const $ = (id) => document.getElementById(id);
const selected = new Set();

let lastState = null;

// ---------- Connection status ----------
function setStatus(text) {
  $("status").textContent = text;
}

function setError(text) {
  $("error").textContent = text || "";
}

socket.on("connect", () => {
  setStatus(`Connected ✅ (${socket.id.slice(0, 6)})`);
  setError("");
});

socket.on("disconnect", () => {
  setStatus("Disconnected ❌ (server sleeping or network issue)");
});

socket.on("connect_error", (err) => {
  setStatus("Connection error ❌");
  setError(String(err?.message || err));
});

// ---------- Server messages ----------
socket.on("error_msg", (msg) => setError(msg));

socket.on("room_created", ({ roomCode }) => {
  $("room").value = roomCode;
  setError("");
  setStatus(`Room ${roomCode} created. Share code with friends.`);
});

socket.on("show_result", (res) => {
  if (!res) return;
  if (res.result === "win") {
    alert(`YOU WON! You showed ${res.myTotal}`);
  } else if (res.result === "lose") {
    alert(`YOU LOST! You showed ${res.myTotal} but ${res.opponent} had ${res.opponentTotal}`);
  }
});

socket.on("state", (state) => {
  lastState = state;
  render(state);
});

// ---------- UI actions ----------
$("create").onclick = () => {
  const name = ($("name").value || "").trim() || "Player";
  setError("");
  socket.emit("create_room", { name, handSize: 7 });
};

$("join").onclick = () => {
  const roomCode = ($("room").value || "").trim().toUpperCase();
  const name = ($("name").value || "").trim() || "Player";
  if (!roomCode) return setError("Enter room code first.");
  setError("");
  socket.emit("join_room", { roomCode, name });
};

$("start").onclick = () => {
  const roomCode = ($("room").value || "").trim().toUpperCase();
  if (!roomCode) return setError("Enter room code first.");
  setError("");
  socket.emit("start_game", { roomCode });
};

$("discard").onclick = () => {
  const roomCode = ($("room").value || "").trim().toUpperCase();
  if (!roomCode) return setError("Enter room code first.");
  const chosen = [...selected];
  if (chosen.length !== 1) return setError("Select exactly 1 card to discard.");
  setError("");
  socket.emit("discard_one", { roomCode, cardId: chosen[0] });
  selected.clear();
};

$("drop").onclick = () => {
  const roomCode = ($("room").value || "").trim().toUpperCase();
  if (!roomCode) return setError("Enter room code first.");
  const chosen = [...selected];
  if (chosen.length < 2) return setError("Select 2+ cards to drop as a meld.");
  setError("");
  socket.emit("drop_meld", { roomCode, cardIds: chosen });
  selected.clear();
};

$("pick").onclick = () => {
  const roomCode = ($("room").value || "").trim().toUpperCase();
  if (!roomCode) return setError("Enter room code first.");
  setError("");
  socket.emit("pick_deck", { roomCode });
};

$("show").onclick = () => {
  const roomCode = ($("room").value || "").trim().toUpperCase();
  if (!roomCode) return setError("Enter room code first.");
  setError("");
  socket.emit("show", { roomCode });
};

// ---------- Render helpers ----------
function cardLabel(c) {
  if (c.isJoker) return "JOKER";
  const rankMap = { 1: "A", 11: "J", 12: "Q", 13: "K" };
  const r = rankMap[c.rank] || String(c.rank);

  // suit symbols (looks good on mobile too)
  const suitMap = { S: "♠", H: "♥", D: "♦", C: "♣" };
  const s = suitMap[c.suit] || c.suit || "?";
  return `${r}${s}`;
}

function makeCardDiv(c, clickable, onClick) {
  const div = document.createElement("div");
  div.className = "card" + (selected.has(c.id) ? " sel" : "");
  div.textContent = cardLabel(c);

  if (clickable) {
    div.style.cursor = "pointer";
    div.onclick = onClick;
  }
  return div;
}

// ---------- Main render ----------
function render(state) {
  setError("");

  // Header status line
  const roomText = state.roomCode ? `Room ${state.roomCode}` : "No room";
  const turnText = state.currentPlayerName ? `Turn: ${state.currentPlayerName}` : "";
  setStatus(`${roomText} — ${turnText}${state.youAreCurrent ? " (YOU)" : ""}`);

  // Players list
  const playersEl = $("players");
  playersEl.innerHTML = "";
  state.players.forEach((p) => {
    const d = document.createElement("div");
    d.textContent = `${p.isTurn ? "👉 " : ""}${p.name} (${p.handCount})`;
    playersEl.appendChild(d);
  });

  // Log
  const logEl = $("log");
  logEl.innerHTML = "";
  (state.log || []).slice().reverse().forEach((x) => {
    const d = document.createElement("div");
    d.textContent = `• ${x.msg}`;
    logEl.appendChild(d);
  });

  // Floor
  const floorEl = $("floor");
  floorEl.innerHTML = "";

  (state.floor || []).forEach((m) => {
    const meldBox = document.createElement("div");
    meldBox.className = "meld";

    const t = document.createElement("div");
    t.className = "meldTitle";
    t.textContent = "Floor pile";
    meldBox.appendChild(t);

    const cardsRow = document.createElement("div");

    m.cards.forEach((c) => {
      const clickable =
        state.youAreCurrent &&
        state.canPick &&
        !c.isJoker; // cannot pick joker from floor

      const div = makeCardDiv(c, clickable, () => {
        const roomCode = ($("room").value || "").trim().toUpperCase();
        if (!roomCode) return setError("Enter room code first.");
        if (!state.canPick) return setError("You must drop first, then pick exactly 1.");
        if (c.isJoker) return setError("Cannot pick Joker from floor.");
        socket.emit("pick_floor", { roomCode, meldId: m.meldId, cardId: c.id });
      });

      // visually gray out jokers on floor
      if (c.isJoker) {
        div.style.opacity = "0.45";
        div.title = "Joker cannot be picked from floor";
      }

      cardsRow.appendChild(div);
    });

    meldBox.appendChild(cardsRow);
    floorEl.appendChild(meldBox);
  });

  // Hand
  const handEl = $("hand");
  handEl.innerHTML = "";
  (state.yourHand || []).forEach((c) => {
    const div = makeCardDiv(c, true, () => {
      if (!state.youAreCurrent) return;
      if (selected.has(c.id)) selected.delete(c.id);
      else selected.add(c.id);
      render(state); // re-render selection immediately
    });
    handEl.appendChild(div);
  });

  // Buttons enable/disable
  $("discard").disabled = !(state.youAreCurrent && selected.size === 1);
  $("drop").disabled = !(state.youAreCurrent && selected.size >= 2);
  $("pick").disabled = !(state.youAreCurrent && state.canPick);
  $("show").disabled = !(state.youAreCurrent && state.canShow);

  // Total display
  $("totalHint").textContent =
    state.yourTotal !== null && state.yourTotal !== undefined
      ? `Your total: ${state.yourTotal} (SHOW allowed at ≤ 5)`
      : "";
}
