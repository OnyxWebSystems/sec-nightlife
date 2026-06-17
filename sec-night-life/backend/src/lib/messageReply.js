/** Format reply preview for API responses. */
export function formatReplyPreview(replyRow, { bodyKey = 'body', labelKey = null } = {}) {
  if (!replyRow) return null;
  const body =
    labelKey && replyRow[labelKey]
      ? replyRow[labelKey]
      : replyRow[bodyKey] || replyRow.displayLabel || replyRow.templateKey || '';
  return {
    id: replyRow.id,
    body: String(body).slice(0, 500),
    sentAt: replyRow.sentAt || replyRow.createdAt || null,
    senderLabel: replyRow.senderLabel || null,
  };
}

export async function validateReplyInThread(prisma, { model, threadField, threadId, replyToMessageId }) {
  if (!replyToMessageId) return null;
  const parent = await prisma[model].findFirst({
    where: { id: replyToMessageId, [threadField]: threadId },
  });
  if (!parent) {
    const err = new Error('Reply target not found in this thread');
    err.status = 400;
    throw err;
  }
  return replyToMessageId;
}
