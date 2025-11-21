// socket.js
const { Server } = require("socket.io");

let io;
const onlineUsers = {}; // { userId: socketId }

function initSocket(server) {
  io = new Server(server, {
    cors: {
      origin: process.env.FRONTEND_URL || "*",
      methods: ["GET", "POST"],
    },
  });

  io.on("connection", (socket) => {
    console.log("⚡ Socket connected:", socket.id);

    socket.on("register", (userId) => {
      if (!userId) return;
      onlineUsers[userId] = socket.id;
      console.log("Registered socket for user:", userId, socket.id);
    });

    socket.on("disconnect", () => {
      const userId = Object.keys(onlineUsers).find(
        (k) => onlineUsers[k] === socket.id
      );
      if (userId) {
        delete onlineUsers[userId];
        console.log("Disconnected:", socket.id, userId);
      } else {
        console.log("Socket disconnected:", socket.id);
      }
    });
  });
}

// helper to emit to a particular user
function emitToUser(userId, event, payload) {
  if (!io) return;
  const socketId = onlineUsers[userId];
  if (socketId) io.to(socketId).emit(event, payload);
}

// helper to emit to many users
function emitToUsers(userIds = [], event, payload) {
  userIds.forEach((id) => emitToUser(id, event, payload));
}

module.exports = { initSocket, emitToUser, emitToUsers };
 