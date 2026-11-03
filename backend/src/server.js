import 'dotenv/config';
import http from 'http';
import jwt from 'jsonwebtoken';
import { Server } from 'socket.io';
import { createApp } from './app.js';
import { prisma } from './config/prisma.js';

const app = createApp();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: process.env.CLIENT_ORIGIN, methods: ['GET', 'POST'] } });
app.locals.io = io;
const online = new Map();

io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    const tenantId = socket.handshake.auth?.tenantId;
    if (!token || !tenantId) return next(new Error('Authentication and tenant selection required'));
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const membership = await prisma.membership.findFirst({ where: { userId: payload.userId, tenantId }, include: { user: true } });
    if (!membership) return next(new Error('Not authorized for this tenant'));
    socket.data.userId = payload.userId;
    socket.data.userName = membership.user.name;
    socket.data.tenantId = tenantId;
    next();
  } catch { next(new Error('Invalid socket credentials')); }
});

io.on('connection', socket => {
  const room = `tenant:${socket.data.tenantId}`;
  socket.join(room);
  const key = `${socket.data.tenantId}:${socket.data.userId}`;
  online.set(key, (online.get(key) || 0) + 1);
  const emitPresence = () => {
    const users = [...online.keys()].filter(k => k.startsWith(`${socket.data.tenantId}:`)).map(k => k.split(':')[1]);
    io.to(room).emit('presence:update', { onlineUserIds: [...new Set(users)] });
  };
  emitPresence();
  socket.on('disconnect', () => {
    const count = (online.get(key) || 1) - 1;
    if (count <= 0) online.delete(key); else online.set(key, count);
    emitPresence();
  });
});

const port = process.env.PORT || 5000;
server.listen(port, () => console.log(`API + Socket.IO running on http://localhost:${port}`));
process.on('SIGINT', async () => { await prisma.$disconnect(); process.exit(0); });
