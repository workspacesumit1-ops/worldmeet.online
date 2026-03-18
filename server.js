const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

app.use(express.static(path.join(__dirname, 'public')));

const waitingQueue = [];
const pairs = new Map();
let totalOnline = 0;

function broadcastOnlineCount() {
  io.emit('online_count', totalOnline);
}

function tryMatch(socket) {
  const idx = waitingQueue.findIndex(s => s.id !== socket.id);
  if (idx === -1) {
    if (!waitingQueue.find(s => s.id === socket.id)) {
      waitingQueue.push(socket);
    }
    socket.emit('waiting');
    return;
  }
  const partner = waitingQueue.splice(idx, 1)[0];
  const selfIdx = waitingQueue.findIndex(s => s.id === socket.id);
  if (selfIdx !== -1) waitingQueue.splice(selfIdx, 1);
  pairs.set(socket.id, partner.id);
  pairs.set(partner.id, socket.id);
  socket.emit('matched', { partnerId: partner.id });
  partner.emit('matched', { partnerId: socket.id });
}

function disconnectFromPartner(socket) {
  const partnerId = pairs.get(socket.id);
  if (partnerId) {
    const partner = io.sockets.sockets.get(partnerId);
    if (partner) partner.emit('partner_left');
    pairs.delete(partnerId);
    pairs.delete(socket.id);
  }
  const idx = waitingQueue.findIndex(s => s.id === socket.id);
  if (idx !== -1) waitingQueue.splice(idx, 1);
}

io.on('connection', (socket) => {
  totalOnline++;
  broadcastOnlineCount();

  socket.on('find_match', () => {
    disconnectFromPartner(socket);
    tryMatch(socket);
  });

  socket.on('message', (text) => {
    const partnerId = pairs.get(socket.id);
    if (!partnerId) return;
    const partner = io.sockets.sockets.get(partnerId);
    if (partner) partner.emit('message', { text, from: 'stranger' });
  });

  socket.on('typing', (isTyping) => {
    const partnerId = pairs.get(socket.id);
    if (!partnerId) return;
    const partner = io.sockets.sockets.get(partnerId);
    if (partner) partner.emit('typing', isTyping);
  });

  socket.on('webrtc_offer', (data) => {
    const partnerId = pairs.get(socket.id);
    if (!partnerId) return;
    const partner = io.sockets.sockets.get(partnerId);
    if (partner) partner.emit('webrtc_offer', data);
  });

  socket.on('webrtc_answer', (data) => {
    const partnerId = pairs.get(socket.id);
    if (!partnerId) return;
    const partner = io.sockets.sockets.get(partnerId);
    if (partner) partner.emit('webrtc_answer', data);
  });

  socket.on('webrtc_ice', (data) => {
    const partnerId = pairs.get(socket.id);
    if (!partnerId) return;
    const partner = io.sockets.sockets.get(partnerId);
    if (partner) partner.emit('webrtc_ice', data);
  });

  socket.on('next', () => {
    disconnectFromPartner(socket);
    tryMatch(socket);
  });

  socket.on('disconnect', () => {
    totalOnline = Math.max(0, totalOnline - 1);
    disconnectFromPartner(socket);
    broadcastOnlineCount();
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`WorldMeet running on port ${PORT}`);
});
