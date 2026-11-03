# API and WebSocket Documentation

Base URL: `http://localhost:5000/api`

Protected HTTP requests require:
- `Authorization: Bearer <token>`
- `X-Tenant-Id: <authorized tenant UUID>` for tenant-scoped routes

## Authentication
### POST `/auth/register`
Body:
```json
{"name":"Asha","email":"asha@example.com","password":"password123","organizationName":"ABC Technologies","tenantName":"Chennai"}
```
Creates the user, organization, initial tenant, Org Admin membership, board and default columns.

### POST `/auth/login`
Body: `{"email":"asha@example.com","password":"password123"}`

### GET `/auth/me`
Returns current user and memberships.

## Organization and tenant
- GET `/organizations`
- POST `/organizations` body `{"name":"New Org"}`
- GET `/tenants`
- POST `/tenants` body `{"organizationId":"<uuid>","name":"Bangalore"}` (Org Admin)

## Boards and columns
- GET `/boards` (tenant-scoped; includes columns and tasks)
- POST `/boards` body `{"name":"Product Roadmap","description":"Q4 work"}`
- GET `/boards/:boardId/columns`
- POST `/columns` body `{"boardId":"<uuid>","name":"Review","position":2}`

## Tasks
- GET `/tasks`
- POST `/tasks` body `{"boardId":"<uuid>","columnId":"<uuid>","title":"Build login","description":"Login screen"}`
- PUT `/tasks/:taskId` body `{"title":"Updated title","description":"Details","version":1}`
- PATCH `/tasks/:taskId/move` body `{"columnId":"<uuid>","position":0,"version":1}`
- DELETE `/tasks/:taskId`
- GET `/activity`

A stale task version returns HTTP 409 and includes the current task. Refresh and retry rather than silently overwriting another user's update.

## Socket.IO
Connect to `http://localhost:5000` with handshake auth:
```js
io("http://localhost:5000", {
  auth: { token: "<JWT>", tenantId: "<authorized-tenant-uuid>" }
});
```
The server verifies JWT and membership before joining `tenant:<tenantId>`.

Server-to-client events:
- `task:created` – newly created task
- `task:updated` – edited task
- `task:moved` – moved task
- `task:deleted` – `{ "id": "<task-uuid>" }`
- `presence:update` – `{ "onlineUserIds": ["<user-uuid>"] }`

Clients must not choose arbitrary room names. The server assigns the room only after authorization.
