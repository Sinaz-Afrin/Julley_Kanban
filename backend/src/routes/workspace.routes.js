import { Router } from 'express';
import { prisma } from '../config/prisma.js';
import { authenticate, tenantContext, allowRoles } from '../middleware/auth.js';
import { asyncHandler } from '../utils/http.js';

const router = Router();
router.use(authenticate);

router.get('/organizations', asyncHandler(async (req, res) => {
  const rows = await prisma.membership.findMany({ where: { userId: req.user.id }, include: { organization: true } });
  res.json([...new Map(rows.map(x => [x.organization.id, x.organization])).values()]);
}));
router.post('/organizations', asyncHandler(async (req, res) => {
  const org = await prisma.organization.create({ data: { name: req.body.name || 'New Organization' } });
  res.status(201).json(org);
}));

router.get('/tenants', asyncHandler(async (req, res) => {
  const rows = await prisma.membership.findMany({ where: { userId: req.user.id, tenantId: { not: null } }, include: { tenant: true, organization: true } });
  res.json(rows);
}));
router.post('/tenants', authenticate, asyncHandler(async (req, res) => {
  const { organizationId, name } = req.body;
  const membership = await prisma.membership.findFirst({ where: { userId: req.user.id, organizationId, role: 'ORG_ADMIN' } });
  if (!membership) return res.status(403).json({ message: 'Only an organization admin can create a branch' });
  const tenant = await prisma.tenant.create({ data: { organizationId, name } });
  await prisma.membership.create({ data: { userId: req.user.id, organizationId, tenantId: tenant.id, role: 'ORG_ADMIN' } });
  res.status(201).json(tenant);
}));

router.get('/boards', tenantContext, asyncHandler(async (req, res) => {
  const boards = await prisma.board.findMany({ where: { tenantId: req.tenant.id }, include: { columns: { orderBy: { position: 'asc' }, include: { tasks: { where: { tenantId: req.tenant.id }, orderBy: { position: 'asc' } } } } } });
  res.json(boards);
}));
router.post('/boards', tenantContext, allowRoles('ORG_ADMIN', 'TENANT_ADMIN'), asyncHandler(async (req, res) => {
  const board = await prisma.board.create({ data: { name: req.body.name || 'New Board', description: req.body.description, organizationId: req.tenant.organizationId, tenantId: req.tenant.id, createdBy: req.user.id } });
  for (const [position, name] of ['To Do', 'In Progress', 'Done'].entries()) await prisma.column.create({ data: { boardId: board.id, tenantId: req.tenant.id, name, position } });
  res.status(201).json(board);
}));
router.get('/boards/:boardId/columns', tenantContext, asyncHandler(async (req, res) => {
  const columns = await prisma.column.findMany({ where: { boardId: req.params.boardId, tenantId: req.tenant.id }, orderBy: { position: 'asc' } });
  res.json(columns);
}));
router.post('/columns', tenantContext, allowRoles('ORG_ADMIN', 'TENANT_ADMIN'), asyncHandler(async (req, res) => {
  const board = await prisma.board.findFirst({ where: { id: req.body.boardId, tenantId: req.tenant.id } });
  if (!board) return res.status(404).json({ message: 'Board not found in this tenant' });
  const column = await prisma.column.create({ data: { boardId: board.id, tenantId: req.tenant.id, name: req.body.name, position: Number(req.body.position || 0) } });
  res.status(201).json(column);
}));

router.get('/tasks', tenantContext, asyncHandler(async (req, res) => {
  const tasks = await prisma.task.findMany({ where: { tenantId: req.tenant.id }, orderBy: [{ columnId: 'asc' }, { position: 'asc' }] });
  res.json(tasks);
}));
router.post('/tasks', tenantContext, asyncHandler(async (req, res) => {
  const { boardId, columnId, title, description } = req.body;
  if (!title?.trim()) return res.status(400).json({ message: 'Task title is required' });
  const column = await prisma.column.findFirst({ where: { id: columnId, boardId, tenantId: req.tenant.id } });
  if (!column) return res.status(404).json({ message: 'Column not found in this tenant/board' });
  const task = await prisma.$transaction(async tx => {
    const count = await tx.task.count({ where: { columnId, tenantId: req.tenant.id } });
    const created = await tx.task.create({ data: { boardId, columnId, tenantId: req.tenant.id, title: title.trim(), description: description || '', position: count } });
    await tx.activityLog.create({ data: { tenantId: req.tenant.id, userId: req.user.id, entityType: 'task', entityId: created.id, action: 'created', details: { title: created.title } } });
    return created;
  });
  req.io.to(`tenant:${req.tenant.id}`).emit('task:created', task);
  res.status(201).json(task);
}));

router.put('/tasks/:taskId', tenantContext, asyncHandler(async (req, res) => {
  const { title, description, version } = req.body;
  const existing = await prisma.task.findFirst({ where: { id: req.params.taskId, tenantId: req.tenant.id } });
  if (!existing) return res.status(404).json({ message: 'Task not found' });
  if (Number(version) !== existing.version) return res.status(409).json({ message: 'Conflict: task has changed. Refresh and retry.', current: existing });
  const updated = await prisma.$transaction(async tx => {
    const result = await tx.task.update({ where: { id: existing.id }, data: { title: title ?? existing.title, description: description ?? existing.description, version: { increment: 1 } } });
    await tx.activityLog.create({ data: { tenantId: req.tenant.id, userId: req.user.id, entityType: 'task', entityId: result.id, action: 'updated', details: { title: result.title } } });
    return result;
  });
  req.io.to(`tenant:${req.tenant.id}`).emit('task:updated', updated);
  res.json(updated);
}));

router.patch('/tasks/:taskId/move', tenantContext, asyncHandler(async (req, res) => {
  const { columnId, position, version } = req.body;
  const task = await prisma.task.findFirst({ where: { id: req.params.taskId, tenantId: req.tenant.id } });
  if (!task) return res.status(404).json({ message: 'Task not found' });
  if (Number(version) !== task.version) return res.status(409).json({ message: 'Conflict: task has changed. Refresh and retry.', current: task });
  const destination = await prisma.column.findFirst({ where: { id: columnId, boardId: task.boardId, tenantId: req.tenant.id } });
  if (!destination) return res.status(400).json({ message: 'Invalid destination column' });
  const moved = await prisma.$transaction(async tx => {
    const updated = await tx.task.update({ where: { id: task.id }, data: { columnId, position: Number(position ?? 0), version: { increment: 1 } } });
    await tx.activityLog.create({ data: { tenantId: req.tenant.id, userId: req.user.id, entityType: 'task', entityId: task.id, action: 'moved', details: { from: task.columnId, to: columnId } } });
    return updated;
  });
  req.io.to(`tenant:${req.tenant.id}`).emit('task:moved', moved);
  res.json(moved);
}));

router.delete('/tasks/:taskId', tenantContext, asyncHandler(async (req, res) => {
  const task = await prisma.task.findFirst({ where: { id: req.params.taskId, tenantId: req.tenant.id } });
  if (!task) return res.status(404).json({ message: 'Task not found' });
  await prisma.$transaction(async tx => {
    await tx.activityLog.create({ data: { tenantId: req.tenant.id, userId: req.user.id, entityType: 'task', entityId: task.id, action: 'deleted', details: { title: task.title } } });
    await tx.task.delete({ where: { id: task.id } });
  });
  req.io.to(`tenant:${req.tenant.id}`).emit('task:deleted', { id: task.id });
  res.json({ message: 'Task deleted' });
}));

router.get('/activity', tenantContext, asyncHandler(async (req, res) => {
  const logs = await prisma.activityLog.findMany({ where: { tenantId: req.tenant.id }, include: { user: { select: { name: true } } }, orderBy: { createdAt: 'desc' }, take: 50 });
  res.json(logs);
}));
export default router;
