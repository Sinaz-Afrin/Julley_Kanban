import express from 'express';
import cors from 'cors';
import authRoutes from './routes/auth.routes.js';
import workspaceRoutes from './routes/workspace.routes.js';

export function createApp() {
  const app = express();
  app.use(cors({ origin: process.env.CLIENT_ORIGIN, credentials: true }));
  app.use(express.json());
  app.use((req, _res, next) => { req.io = app.locals.io; next(); });
  app.get('/api/health', (_req, res) => res.json({ status: 'ok', service: 'JulleyOnline Kanban API' }));
  app.use('/api/auth', authRoutes);
  app.use('/api', workspaceRoutes);
  app.use((err, _req, res, _next) => {
    console.error(err);
    res.status(err.status || 500).json({ message: err.status ? err.message : 'Internal server error' });
  });
  return app;
}
