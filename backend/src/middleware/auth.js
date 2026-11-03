import jwt from 'jsonwebtoken';
import { prisma } from '../config/prisma.js';

export async function authenticate(req, res, next) {
  try {
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!token) return res.status(401).json({ message: 'Authentication required' });
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await prisma.user.findUnique({ where: { id: payload.userId } });
    if (!user) return res.status(401).json({ message: 'User not found' });
    req.user = { id: user.id, name: user.name, email: user.email };
    next();
  } catch {
    res.status(401).json({ message: 'Invalid or expired token' });
  }
}

export async function tenantContext(req, res, next) {
  try {
    const tenantId = req.headers['x-tenant-id'] || req.body.tenantId || req.query.tenantId;
    if (!tenantId) return res.status(400).json({ message: 'Select a tenant using X-Tenant-Id' });
    const membership = await prisma.membership.findFirst({
      where: { userId: req.user.id, tenantId },
      include: { tenant: true }
    });
    if (!membership) return res.status(403).json({ message: 'You do not belong to this tenant' });
    req.tenant = membership.tenant;
    req.membership = membership;
    next();
  } catch (error) { next(error); }
}

export function allowRoles(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.membership?.role)) return res.status(403).json({ message: 'Insufficient permissions' });
    next();
  };
}
