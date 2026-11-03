import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../config/prisma.js';
import { authenticate } from '../middleware/auth.js';
import { asyncHandler } from '../utils/http.js';

const router = Router();

router.post('/register', asyncHandler(async (req, res) => {
  const { name, email, password, organizationName, tenantName } = req.body;
  if (!name || !email || !password || password.length < 8) {
    return res.status(400).json({ message: 'Name, valid email and password (8+ characters) are required' });
  }
  const exists = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (exists) return res.status(409).json({ message: 'Email already registered' });

  const passwordHash = await bcrypt.hash(password, 12);
  const result = await prisma.$transaction(async tx => {
    const user = await tx.user.create({ data: { name, email: email.toLowerCase(), passwordHash } });
    const organization = await tx.organization.create({ data: { name: organizationName || `${name}'s Organization` } });
    const tenant = await tx.tenant.create({ data: { name: tenantName || 'Main Branch', organizationId: organization.id } });
    await tx.membership.create({ data: { userId: user.id, organizationId: organization.id, tenantId: tenant.id, role: 'ORG_ADMIN' } });
    const board = await tx.board.create({ data: { name: 'General Board', organizationId: organization.id, tenantId: tenant.id, createdBy: user.id } });
    for (const [position, columnName] of ['To Do', 'In Progress', 'Done'].entries()) {
      await tx.column.create({ data: { boardId: board.id, tenantId: tenant.id, name: columnName, position } });
    }
    return { user, organization, tenant, board };
  });
  const token = jwt.sign({ userId: result.user.id }, process.env.JWT_SECRET, { expiresIn: '8h' });
  res.status(201).json({ token, user: { id: result.user.id, name: result.user.name, email: result.user.email }, organization: result.organization, tenant: result.tenant, board: result.board });
}));

router.post('/login', asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const user = await prisma.user.findUnique({ where: { email: (email || '').toLowerCase() } });
  if (!user || !(await bcrypt.compare(password || '', user.passwordHash))) return res.status(401).json({ message: 'Invalid email or password' });
  const memberships = await prisma.membership.findMany({ where: { userId: user.id, tenantId: { not: null } }, include: { organization: true, tenant: true } });
  const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: '8h' });
  res.json({ token, user: { id: user.id, name: user.name, email: user.email }, memberships });
}));

router.get('/me', authenticate, asyncHandler(async (req, res) => {
  const memberships = await prisma.membership.findMany({ where: { userId: req.user.id, tenantId: { not: null } }, include: { organization: true, tenant: true } });
  res.json({ user: req.user, memberships });
}));
export default router;
