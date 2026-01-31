const socket = io("http://localhost:3000");

let selected = new Set();

const $ = (id) => document.getElementById(id);

function suitSymbol(s) {
  return ({S:"♠",H:"♥",D:"♦",C:"♣"}[s] ?? "");
}
function rankLabel(r, isJoker) {
  if (isJoker) return "🃏";
  if (r===1) return "A";
  if (r===11) return "J";
  if (r===12) return "Q";
  if (r===13) return "K";
  return String(r);
}

function render(state) {
  $("status").textContent = state.phase === "lobby"
    ? `Room ${state.roomCode} (Lobby) — waiting`
    : `Room ${state.roomCode} — Turn: ${state.currentPlayerName} ${state.youAreCurrent ? "(YOU)" : ""}`;

  $("players").innerHTML = state.players.map(p =>
    `<div>${p.isTurn ? "👉 " : ""}${p.name} <span class="small">(${p.handCount})</span></div>`
  ).join("");

  $("log").innerHTML = (state.log ?? []).slice().reverse().map(x =>
    `<div>• ${x.msg}</div>`
  ).join("");

  // Hand
  selected = new Set([...selected].filter(id => state.yourHand.some(c => c.id === id)));
  $("hand").innerHTML = "";
  state.yourHand.forEach(c => {
    const div = document.createElement("div");
    div.className = "card" + (selected.has(c.id) ? " sel" : "");
    div.textContent = `${rankLabel(c.rank, c.isJoker)}${c.isJoker ? "" : suitSymbol(c.suit)}`;
    div.onclick = () => {
      if (!state.youAreCurrent) return;
      if (selected.has(c.id)) selected.delete(c.id);
      else selected.add(c.id);
      render(state);
    };
    $("hand").appendChild(div);
  });

  // Floor
  $("floor").innerHTML = "";
  state.floor.forEach(m => {
    const box = document.createElement("div");
    box.className = "meld";
    box.innerHTML = `<div class="meldTitle">Meld ${m.meldId}</div>`;
    m.cards.forEach(c => {
      const div = document.createElement("div");
      div.className = "card";
      div.textContent = `${rankLabel(c.rank, c.isJoker)}${c.isJoker ? "" : suitSymbol(c.suit)}`;
      div.onclick = () => {
        if (!state.youAreCurrent) return;
        if (c.isJoker) { $("error").textContent = "Cannot grab joker."; return; }
        const handDrop = [...selected][0];
        if (!handDrop) { $("error").textContent = "Select 1 hand card to drop, then click floor card to grab."; return; }
        socket.emit("grab_floor", { roomCode: state.roomCode, meldId: m.meldId, cardIdToGrab: c.id, cardIdToDrop: handDrop });
        selected.clear();
      };
      box.appendChild(div);
    });
    $("floor").appendChild(box);
  });

  $("drop").disabled = !(state.youAreCurrent && selected.size >= 2);
  $("draw").disabled = !(state.youAreCurrent && state.canDraw);
  $("show").disabled = !state.youAreCurrent;
}

$("create").onclick = () => {
  const name = $("name").value || "Player";
  socket.emit("create_room", { name, handSize: 7 });
};

$("join").onclick = () => {
  const name = $("name").value || "Player";
  const code = ($("room").value || "").toUpperCase();
  socket.emit("join_room", { roomCode: code, name });
};

$("start").onclick = () => {
  const code = ($("room").value || "").toUpperCase();
  socket.emit("start_game", { roomCode: code });
};

$("drop").onclick = () => {
  const code = ($("room").value || "").toUpperCase();
  socket.emit("drop_meld", { roomCode: code, cardIds: [...selected] });
  selected.clear();
};

$("draw").onclick = () => {
  const code = ($("room").value || "").toUpperCase();
  socket.emit("draw_one", { roomCode: code });
};

$("show").onclick = () => {
  const code = ($("room").value || "").toUpperCase();
  socket.emit("show", { roomCode: code });
};

socket.on("room_created", ({ roomCode }) => {
  $("room").value = roomCode;
});

socket.on("state", (state) => {
  $("error").textContent = "";
  render(state);
});

socket.on("error_msg", (msg) => {
  $("error").textContent = msg;
});
socket.on("show_result", (r) => {
  alert(r.result === "win"
    ? `WIN! Your total: ${r.myTotal}`
    : `LOSE. Your total: ${r.myTotal}. ${r.opponent} had ${r.opponentTotal}`);
});
