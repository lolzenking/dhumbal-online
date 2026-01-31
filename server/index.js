import express from "express";
import cors from "cors";
import { createServer } from "http";
import { Server } from "socket.io";

import {
  createRoom, addPlayer, startGame, dropMeld, canDraw,
  drawOneAndEndTurn, grabFromFloor, showHand
} from "./game/gameState.js";

const app = express();
app.use(cors());
app.get("/", (_, res) => res.send("Dhumbal server running"));

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: "*" }
});

const rooms = new Map(); // roomCode -> roomState

function makeRoomCode() {
  return Math.random().toString(36).slice(2, 7).toUpperCase();
}

function publicState(room, viewerSocketId) {
  return {
    roomCode: room.roomCode,
    phase: room.phase,
    handSize: room.handSize,
    turnIndex: room.turnIndex,
    currentPlayerName: room.players[room.turnIndex]?.name ?? null,
    youAreCurrent: room.players[room.turnIndex]?.socketId === viewerSocketId,
    players: room.players.map(p => ({
      name: p.name,
      handCount: p.hand.length,
      isTurn: p.socketId === room.players[room.turnIndex]?.socketId
    })),
    yourHand: room.players.find(p => p.socketId === viewerSocketId)?.hand ?? [],
    floor: room.floor.map(m => ({
      meldId: m.meldId,
      cards: m.cards.map(c => ({ ...c, rank: c.isJoker ? null : c.rank })),
      containsJoker: m.containsJoker
    })),
    canDraw: room.phase === "playing" && canDraw(room, viewerSocketId),
    log: room.lastActionLog
  };
}

function broadcastRoom(room) {
  for (const p of room.players) {
    io.to(p.socketId).emit("state", publicState(room, p.socketId));
  }
}

io.on("connection", (socket) => {
  socket.on("create_room", ({ name, handSize }) => {
    const code = makeRoomCode();
    const room = createRoom(code, handSize ?? 7);
    rooms.set(code, room);
    addPlayer(room, socket.id, name ?? "Player");
    socket.emit("room_created", { roomCode: code });
    broadcastRoom(room);
  });

  socket.on("join_room", ({ roomCode, name }) => {
    const room = rooms.get((roomCode ?? "").toUpperCase());
    if (!room) return socket.emit("error_msg", "Room not found");
    addPlayer(room, socket.id, name ?? "Player");
    broadcastRoom(room);
  });

  socket.on("start_game", ({ roomCode }) => {
    const room = rooms.get((roomCode ?? "").toUpperCase());
    if (!room) return socket.emit("error_msg", "Room not found");
    try {
      startGame(room);
      broadcastRoom(room);
    } catch (e) {
      socket.emit("error_msg", e.message);
    }
  });

  socket.on("drop_meld", ({ roomCode, cardIds }) => {
    const room = rooms.get((roomCode ?? "").toUpperCase());
    if (!room) return socket.emit("error_msg", "Room not found");
    try {
      dropMeld(room, socket.id, cardIds);
      broadcastRoom(room);
    } catch (e) {
      socket.emit("error_msg", e.message);
    }
  });

  socket.on("grab_floor", ({ roomCode, meldId, cardIdToGrab, cardIdToDrop }) => {
    const room = rooms.get((roomCode ?? "").toUpperCase());
    if (!room) return socket.emit("error_msg", "Room not found");
    try {
      grabFromFloor(room, socket.id, meldId, cardIdToGrab, cardIdToDrop);
      broadcastRoom(room);
    } catch (e) {
      socket.emit("error_msg", e.message);
    }
  });

  socket.on("draw_one", ({ roomCode }) => {
    const room = rooms.get((roomCode ?? "").toUpperCase());
    if (!room) return socket.emit("error_msg", "Room not found");
    try {
      drawOneAndEndTurn(room, socket.id);
      broadcastRoom(room);
    } catch (e) {
      socket.emit("error_msg", e.message);
    }
  });

  socket.on("show", ({ roomCode }) => {
    const room = rooms.get((roomCode ?? "").toUpperCase());
    if (!room) return socket.emit("error_msg", "Room not found");
    try {
      const result = showHand(room, socket.id);
      io.to(room.players.map(p=>p.socketId)).emit("show_result", result);
      broadcastRoom(room);
    } catch (e) {
      socket.emit("error_msg", e.message);
    }
  });

  socket.on("disconnect", () => {
    for (const [code, room] of rooms.entries()) {
      const before = room.players.length;
      room.players = room.players.filter(p => p.socketId !== socket.id);
      if (room.turnIndex >= room.players.length) room.turnIndex = 0;
      if (room.players.length === 0) rooms.delete(code);
      else if (before !== room.players.length) broadcastRoom(room);
    }
  });
});

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => console.log("Server on port", PORT));
