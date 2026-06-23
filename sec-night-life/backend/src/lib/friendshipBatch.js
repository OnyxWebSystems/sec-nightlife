import { orderedParticipants } from '../lib/conversationHelpers.js';

/** Batch friendship + block status for viewer vs many target user IDs (avoids N+1). */
export function buildFriendshipContext(viewerId, targetIds, friendships) {
  const statusByTarget = new Map();
  const blockedTargets = new Set();

  for (const tid of targetIds) {
    statusByTarget.set(tid, 'NONE');
  }

  for (const f of friendships) {
    const other =
      f.requesterId === viewerId ? f.receiverId : f.receiverId === viewerId ? f.requesterId : null;
    if (!other || !statusByTarget.has(other)) continue;
    if (f.status === 'BLOCKED') {
      blockedTargets.add(other);
      statusByTarget.set(other, 'BLOCKED');
      continue;
    }
    if (f.status === 'ACCEPTED') {
      statusByTarget.set(other, 'ACCEPTED');
    } else if (f.status === 'DECLINED') {
      statusByTarget.set(other, 'NONE');
    } else if (f.status === 'PENDING') {
      statusByTarget.set(
        other,
        f.requesterId === viewerId ? 'PENDING_SENT' : 'PENDING_RECEIVED',
      );
    }
  }

  return { statusByTarget, blockedTargets };
}

export function conversationLookupKey(participantAId, participantBId) {
  return `${participantAId}:${participantBId}`;
}

export function buildConversationMap(viewerId, acceptedTargetIds, conversations) {
  const map = new Map();
  for (const conv of conversations) {
    map.set(conversationLookupKey(conv.participantAId, conv.participantBId), conv.id);
  }
  const byTarget = new Map();
  for (const tid of acceptedTargetIds) {
    const parts = orderedParticipants(viewerId, tid);
    const key = conversationLookupKey(parts.participantAId, parts.participantBId);
    byTarget.set(tid, map.get(key) || null);
  }
  return byTarget;
}
