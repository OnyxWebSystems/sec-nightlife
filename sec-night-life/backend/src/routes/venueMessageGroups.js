import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authenticateToken } from '../middleware/auth.js';
import { normalizeUsername } from '../lib/username.js';
import { staffHasVenuePermission } from '../lib/access.js';

const router = Router({ mergeParams: true });

async function resolveUserByProfileUsername(rawUsername) {
  const username = normalizeUsername(rawUsername);
  if (!username) return null;
  const profile = await prisma.userProfile.findFirst({
    where: { username: { equals: username, mode: 'insensitive' } },
    select: { userId: true, username: true, user: { select: { id: true, fullName: true, deletedAt: true } } },
  });
  if (!profile?.user || profile.user.deletedAt) return null;
  return { id: profile.user.id, fullName: profile.user.fullName, username: profile.username };
}

async function getVenueAccess(venueId, userId) {
  const venue = await prisma.venue.findFirst({
    where: { id: venueId, deletedAt: null },
    select: { id: true, ownerUserId: true, name: true },
  });
  if (!venue) return { error: 'not_found' };
  const isOwner = venue.ownerUserId === userId;
  if (isOwner) return { venue, isOwner: true, isMember: true, isAdmin: true };
  if (await staffHasVenuePermission(userId, venueId, 'messages')) {
    return { venue, isOwner: false, isMember: true, isAdmin: false };
  }
  const membership = await prisma.venueMessageGroupMember.findFirst({
    where: { userId, group: { venueId, deletedAt: null } },
  });
  if (!membership) return { error: 'forbidden' };
  return { venue, isOwner: false, isMember: true, isAdmin: membership.role === 'ADMIN' };
}

async function getGroupAccess(venueId, groupId, userId) {
  const base = await getVenueAccess(venueId, userId);
  if (base.error) return base;

  const group = await prisma.venueMessageGroup.findFirst({
    where: { id: groupId, venueId, deletedAt: null },
    include: {
      members: {
        include: { user: { select: { id: true, fullName: true, userProfile: { select: { username: true } } } } },
      },
    },
  });
  if (!group) return { error: 'group_not_found' };

  const membership = group.members.find((m) => m.userId === userId);
  if (!base.isOwner && !membership) return { error: 'forbidden' };

  return {
    ...base,
    group,
    membership,
    isAdmin: base.isOwner || membership?.role === 'ADMIN',
  };
}

const createGroupSchema = z.object({
  name: z.string().trim().min(1).max(80),
});

const addMemberSchema = z.object({
  username: z.string().trim().min(1).max(30),
});

const messageSchema = z.object({
  body: z.string().trim().min(1).max(4000),
});

router.get('/', authenticateToken, async (req, res, next) => {
  try {
    const { venueId } = req.params;
    const access = await getVenueAccess(venueId, req.userId);
    if (access.error === 'not_found') return res.status(404).json({ error: 'Venue not found' });
    if (access.error === 'forbidden') return res.status(403).json({ error: 'Forbidden' });

    const where = {
      venueId,
      deletedAt: null,
      ...(access.isOwner ? {} : { members: { some: { userId: req.userId } } }),
    };

    const groups = await prisma.venueMessageGroup.findMany({
      where,
      include: {
        members: {
          include: { user: { select: { id: true, fullName: true, userProfile: { select: { username: true } } } } },
        },
        messages: { where: { deletedAt: null }, orderBy: { createdAt: 'desc' }, take: 1 },
        _count: { select: { members: true, messages: { where: { deletedAt: null } } } },
      },
      orderBy: { updatedAt: 'desc' },
    });

    res.json({
      items: groups.map((g) => ({
        id: g.id,
        name: g.name,
        createdAt: g.createdAt,
        updatedAt: g.updatedAt,
        memberCount: g._count.members,
        messageCount: g._count.messages,
        lastMessage: g.messages[0]
          ? { id: g.messages[0].id, body: g.messages[0].body, createdAt: g.messages[0].createdAt }
          : null,
        members: g.members.map((m) => ({
          id: m.id,
          userId: m.userId,
          role: m.role,
          joinedAt: m.joinedAt,
          username: m.user.userProfile?.username || m.user.fullName || 'User',
        })),
        myRole: access.isOwner ? 'ADMIN' : g.members.find((m) => m.userId === req.userId)?.role || null,
      })),
    });
  } catch (e) {
    next(e);
  }
});

router.post('/', authenticateToken, async (req, res, next) => {
  try {
    const { venueId } = req.params;
    const parsed = createGroupSchema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ error: 'Invalid input' });

    const venue = await prisma.venue.findFirst({
      where: { id: venueId, ownerUserId: req.userId, deletedAt: null },
      select: { id: true },
    });
    if (!venue) return res.status(403).json({ error: 'Forbidden' });

    const group = await prisma.$transaction(async (tx) => {
      const created = await tx.venueMessageGroup.create({
        data: {
          venueId,
          name: parsed.data.name,
          createdByUserId: req.userId,
        },
      });
      await tx.venueMessageGroupMember.create({
        data: { groupId: created.id, userId: req.userId, role: 'ADMIN' },
      });
      return created;
    });

    res.status(201).json({ id: group.id, name: group.name, createdAt: group.createdAt });
  } catch (e) {
    next(e);
  }
});

router.get('/:groupId', authenticateToken, async (req, res, next) => {
  try {
    const { venueId, groupId } = req.params;
    const access = await getGroupAccess(venueId, groupId, req.userId);
    if (access.error === 'not_found' || access.error === 'group_not_found') {
      return res.status(404).json({ error: 'Not found' });
    }
    if (access.error === 'forbidden') return res.status(403).json({ error: 'Forbidden' });

    const { group, isAdmin, isOwner } = access;
    res.json({
      id: group.id,
      name: group.name,
      ownerUserId: access.venue.ownerUserId,
      isOwner,
      myRole: isOwner ? 'ADMIN' : access.membership?.role || null,
      canManage: isAdmin,
      members: group.members.map((m) => ({
        id: m.id,
        userId: m.userId,
        role: m.role,
        username: m.user.userProfile?.username || m.user.fullName || 'User',
      })),
    });
  } catch (e) {
    next(e);
  }
});

router.get('/:groupId/messages', authenticateToken, async (req, res, next) => {
  try {
    const { venueId, groupId } = req.params;
    const access = await getGroupAccess(venueId, groupId, req.userId);
    if (access.error === 'not_found' || access.error === 'group_not_found') {
      return res.status(404).json({ error: 'Not found' });
    }
    if (access.error === 'forbidden') return res.status(403).json({ error: 'Forbidden' });

    const rows = await prisma.venueMessageGroupMessage.findMany({
      where: { groupId, deletedAt: null },
      orderBy: { createdAt: 'asc' },
      include: {
        sender: {
          select: {
            id: true,
            fullName: true,
            userProfile: { select: { username: true } },
          },
        },
      },
    });

    res.json(
      rows.map((m) => ({
        id: m.id,
        body: m.body,
        createdAt: m.createdAt,
        senderUserId: m.senderUserId,
        senderLabel: m.sender.userProfile?.username
          ? `@${m.sender.userProfile.username}`
          : m.sender.fullName || 'User',
        isMine: m.senderUserId === req.userId,
      })),
    );
  } catch (e) {
    next(e);
  }
});

router.post('/:groupId/members', authenticateToken, async (req, res, next) => {
  try {
    const { venueId, groupId } = req.params;
    const parsed = addMemberSchema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ error: 'Invalid input' });

    const access = await getGroupAccess(venueId, groupId, req.userId);
    if (access.error === 'not_found' || access.error === 'group_not_found') {
      return res.status(404).json({ error: 'Not found' });
    }
    if (access.error === 'forbidden' || !access.isAdmin) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const target = await resolveUserByProfileUsername(parsed.data.username);
    if (!target) return res.status(404).json({ error: 'User not found' });

    const existing = await prisma.venueMessageGroupMember.findUnique({
      where: { groupId_userId: { groupId, userId: target.id } },
    });
    if (existing) return res.status(409).json({ error: 'User is already a member' });

    const member = await prisma.venueMessageGroupMember.create({
      data: { groupId, userId: target.id, role: 'MEMBER' },
    });

    res.status(201).json({
      id: member.id,
      userId: target.id,
      username: target.username,
      role: member.role,
      joinedAt: member.joinedAt,
    });
  } catch (e) {
    next(e);
  }
});

router.delete('/:groupId', authenticateToken, async (req, res, next) => {
  try {
    const { venueId, groupId } = req.params;
    const access = await getGroupAccess(venueId, groupId, req.userId);
    if (access.error === 'not_found' || access.error === 'group_not_found') {
      return res.status(404).json({ error: 'Not found' });
    }
    if (access.error === 'forbidden' || !access.isAdmin) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    await prisma.venueMessageGroup.update({
      where: { id: groupId },
      data: { deletedAt: new Date() },
    });
    res.json({ deleted: true });
  } catch (e) {
    next(e);
  }
});

router.delete('/:groupId/members/:userId', authenticateToken, async (req, res, next) => {
  try {
    const { venueId, groupId, userId: targetUserId } = req.params;
    const access = await getGroupAccess(venueId, groupId, req.userId);
    if (access.error === 'not_found' || access.error === 'group_not_found') {
      return res.status(404).json({ error: 'Not found' });
    }
    if (access.error === 'forbidden') return res.status(403).json({ error: 'Forbidden' });

    const isSelf = targetUserId === req.userId;
    if (!isSelf && !access.isAdmin) return res.status(403).json({ error: 'Forbidden' });

    const member = await prisma.venueMessageGroupMember.findUnique({
      where: { groupId_userId: { groupId, userId: targetUserId } },
    });
    if (!member) return res.status(404).json({ error: 'Member not found' });

    await prisma.venueMessageGroupMember.delete({ where: { id: member.id } });
    res.json({ removed: true });
  } catch (e) {
    next(e);
  }
});

router.post('/:groupId/leave', authenticateToken, async (req, res, next) => {
  try {
    const { venueId, groupId } = req.params;
    const access = await getGroupAccess(venueId, groupId, req.userId);
    if (access.error === 'not_found' || access.error === 'group_not_found') {
      return res.status(404).json({ error: 'Not found' });
    }
    if (access.error === 'forbidden' || !access.membership) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    if (access.isOwner) {
      return res.status(400).json({ error: 'Venue owners cannot leave their own groups' });
    }

    await prisma.venueMessageGroupMember.delete({ where: { id: access.membership.id } });
    res.json({ left: true });
  } catch (e) {
    next(e);
  }
});

router.patch('/:groupId/members/:userId', authenticateToken, async (req, res, next) => {
  try {
    const { venueId, groupId, userId: targetUserId } = req.params;
    const role = z.object({ role: z.literal('ADMIN') }).safeParse(req.body || {});
    if (!role.success) return res.status(400).json({ error: 'Invalid input' });

    const access = await getGroupAccess(venueId, groupId, req.userId);
    if (access.error === 'not_found' || access.error === 'group_not_found') {
      return res.status(404).json({ error: 'Not found' });
    }
    if (access.error === 'forbidden' || !access.isAdmin) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const member = await prisma.venueMessageGroupMember.findUnique({
      where: { groupId_userId: { groupId, userId: targetUserId } },
    });
    if (!member) return res.status(404).json({ error: 'Member not found' });

    const updated = await prisma.venueMessageGroupMember.update({
      where: { id: member.id },
      data: { role: 'ADMIN' },
    });
    res.json({ id: updated.id, userId: updated.userId, role: updated.role });
  } catch (e) {
    next(e);
  }
});

router.post('/:groupId/messages', authenticateToken, async (req, res, next) => {
  try {
    const { venueId, groupId } = req.params;
    const parsed = messageSchema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ error: 'Invalid input' });

    const access = await getGroupAccess(venueId, groupId, req.userId);
    if (access.error === 'not_found' || access.error === 'group_not_found') {
      return res.status(404).json({ error: 'Not found' });
    }
    if (access.error === 'forbidden') return res.status(403).json({ error: 'Forbidden' });

    const message = await prisma.$transaction(async (tx) => {
      const created = await tx.venueMessageGroupMessage.create({
        data: {
          groupId,
          senderUserId: req.userId,
          body: parsed.data.body,
        },
      });
      await tx.venueMessageGroup.update({
        where: { id: groupId },
        data: { updatedAt: new Date() },
      });
      return created;
    });

    res.status(201).json({
      id: message.id,
      body: message.body,
      createdAt: message.createdAt,
      senderUserId: message.senderUserId,
    });
  } catch (e) {
    next(e);
  }
});

router.delete('/:groupId/messages/:messageId', authenticateToken, async (req, res, next) => {
  try {
    const { venueId, groupId, messageId } = req.params;
    const access = await getGroupAccess(venueId, groupId, req.userId);
    if (access.error === 'not_found' || access.error === 'group_not_found') {
      return res.status(404).json({ error: 'Not found' });
    }
    if (access.error === 'forbidden') return res.status(403).json({ error: 'Forbidden' });

    const message = await prisma.venueMessageGroupMessage.findFirst({
      where: { id: messageId, groupId, deletedAt: null },
    });
    if (!message) return res.status(404).json({ error: 'Message not found' });

    const isSender = message.senderUserId === req.userId;
    if (!isSender && !access.isAdmin) return res.status(403).json({ error: 'Forbidden' });

    await prisma.venueMessageGroupMessage.update({
      where: { id: message.id },
      data: { deletedAt: new Date() },
    });
    res.json({ deleted: true });
  } catch (e) {
    next(e);
  }
});

export default router;
