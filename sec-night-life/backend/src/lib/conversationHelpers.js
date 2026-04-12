/** Canonical ordering so (A,B) and (B,A) map to one row */
export function orderedParticipants(userIdA, userIdB) {
  if (userIdA < userIdB) {
    return { participantAId: userIdA, participantBId: userIdB };
  }
  return { participantAId: userIdB, participantBId: userIdA };
}
