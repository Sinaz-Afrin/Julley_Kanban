# Development and Evaluation Checklist

- [ ] Install Node.js and PostgreSQL
- [ ] Create `collaborative_kanban` database
- [ ] Configure `backend/.env`
- [ ] Run Prisma migration and generate client
- [ ] Start backend and verify `/api/health`
- [ ] Configure `frontend/.env`
- [ ] Start Vite frontend
- [ ] Register a test user
- [ ] Create tasks and move them between columns
- [ ] Test task editing and deletion
- [ ] Test with two users in the same tenant
- [ ] Verify another tenant cannot read the first tenant's tasks
- [ ] Verify a socket cannot join a tenant without membership
- [ ] Test stale version returns HTTP 409
- [ ] Capture screenshots
- [ ] Complete ER diagram and README trade-offs
- [ ] Record a short demo

## Suggested demo sequence
1. Register first user and create an organization/branch.
2. Create a few tasks.
3. Show task movement and activity records.
4. Open an authorized second user session in the same tenant.
5. Demonstrate live update and online presence.
6. Attempt a request using a tenant the user does not belong to; show 403.
7. Explain task version conflict handling.
