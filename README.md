# JulleyOnline – Real-Time Collaborative Kanban Board

A runnable MVP for the Real-Time Collaborative Kanban Board assignment.

## Stack
- React + Vite
- Node.js + Express
- PostgreSQL + Prisma
- Socket.IO
- JWT + bcrypt
- dnd-kit (dependency included; task movement is also available through Move buttons)

## Features in this MVP
- Register/login and JWT authentication
- Registration creates an organization, first tenant, membership, board and default columns
- Organization and tenant listing/switching
- Tenant-scoped board, column and task APIs
- Org Admin / Tenant Admin / Member roles
- Tenant authorization on REST requests and Socket.IO room joins
- Create, edit, move and delete tasks
- Task version checks for optimistic concurrency
- Activity log records
- Live task events and online presence
- Basic React Kanban UI
- Prisma schema with the 8 assignment tables

## Requirements
- Node.js 20+ (LTS recommended)
- PostgreSQL 14+
- Git (optional)
- VS Code (recommended)

## 1. Create the database
Using pgAdmin or psql, create a database named `collaborative_kanban`.

Example with psql:
```sql
CREATE DATABASE collaborative_kanban;
```

## 2. Configure backend
```bash
cd backend
copy .env.example .env
```
On macOS/Linux use:
```bash
cp .env.example .env
```
Edit `backend/.env` and set your PostgreSQL connection:
```env
DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@localhost:5432/collaborative_kanban?schema=public"
JWT_SECRET="replace-this-with-a-long-random-secret"
CLIENT_ORIGIN="http://localhost:5173"
PORT=5000
```

Install and create tables:
```bash
npm install
npx prisma generate
npx prisma migrate dev --name init
npm run dev
```
Backend health check: http://localhost:5000/api/health

## 3. Configure frontend
Open a second terminal:
```bash
cd frontend
copy .env.example .env
npm install
npm run dev
```
(macOS/Linux: use `cp .env.example .env` instead of `copy`.)
Open http://localhost:5173.

## 4. Try the application
1. Register a new account. Registration creates a demo organization, tenant, board and default columns.
2. Create tasks in the board.
3. Open the app in another browser/incognito window and register another account to test a separate workspace.
4. For a true same-tenant collaboration test, add a second user to the same tenant using the membership endpoint or database. See API docs.
5. Open two browser sessions for authorized users in the same tenant. Task changes and presence are broadcast live.

## API overview
All protected routes require:
`Authorization: Bearer <JWT>`

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `GET /api/organizations`
- `POST /api/organizations`
- `GET /api/tenants`
- `POST /api/tenants`
- `GET /api/boards`
- `POST /api/boards`
- `GET /api/boards/:boardId/columns`
- `POST /api/columns`
- `GET /api/tasks`
- `POST /api/tasks`
- `PUT /api/tasks/:taskId`
- `PATCH /api/tasks/:taskId/move`
- `DELETE /api/tasks/:taskId`
- `GET /api/activity`

See `docs/API_AND_WEBSOCKET.md` for request examples and socket events.

## Important design notes / trade-offs
- Tenant ID is taken from the authenticated user's authorized active-tenant selection (`X-Tenant-Id`), then membership is checked server-side. Never trust a tenant ID without checking membership.
- Every tenant-owned query includes tenant scope. Related board/column/task ownership is checked before mutation.
- Socket room membership is decided by the server after verifying membership; clients cannot join arbitrary rooms.
- Task `version` is checked on update/move. A stale version returns HTTP 409.
- Database transactions group task updates and activity log writes.
- This is an educational MVP. For production, add refresh-token rotation, secure httpOnly cookies, rate limiting, email verification, audit retention, stronger validation, automated tests, PostgreSQL RLS, and robust multi-instance presence using Redis.
- Presence is held in server memory, so it is suitable for a single backend process. Use Redis adapter/shared presence for horizontal scaling.
- Undo/redo and sophisticated conflict merge UI are not fully implemented; stale updates are rejected with a conflict response. These should be added as advanced extensions if time permits.
