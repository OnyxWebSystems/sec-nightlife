import { useCallback, useState } from 'react';

export function useMessageReply() {
  const [replyingTo, setReplyingTo] = useState(null);

  const clearReply = useCallback(() => setReplyingTo(null), []);

  return { replyingTo, setReplyingTo, clearReply };
}
