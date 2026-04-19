import React, { useState, useEffect, useCallback } from 'react';
import { apiGet, apiPost } from '@/api/client';
import { getVenueProfileShareUrl } from '@/utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Link2, MessageCircle, Search } from 'lucide-react';

/**
 * Share venue with friends and external networks.
 * Deep linking requires the app to be registered on Play Store / App Store
 * with the matching package name and URL scheme before this will work end-to-end.
 */
export default function VenueShareModal({ open, onOpenChange, venueId, venueName }) {
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [friends, setFriends] = useState([]);
  const [loadingFriends, setLoadingFriends] = useState(false);
  const [sentIds, setSentIds] = useState(() => new Set());
  const [sendingId, setSendingId] = useState(null);
  const [copied, setCopied] = useState(false);

  const shareUrl = venueId ? getVenueProfileShareUrl(venueId) : '';
  const textSnippet = `Check out ${venueName || 'this venue'} on SEC Nightlife: ${shareUrl}`;

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 350);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    if (!open || debounced.length < 1) {
      setFriends([]);
      return;
    }
    let cancelled = false;
    setLoadingFriends(true);
    (async () => {
      try {
        const list = await apiGet(`/api/friends?q=${encodeURIComponent(debounced)}`);
        if (!cancelled) setFriends(Array.isArray(list) ? list : []);
      } catch {
        if (!cancelled) setFriends([]);
      } finally {
        if (!cancelled) setLoadingFriends(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, debounced]);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setDebounced('');
      setFriends([]);
      setSentIds(new Set());
      setCopied(false);
    }
  }, [open]);

  const sendToFriend = useCallback(
    async (friend) => {
      const body = `Check out this venue: ${venueName || 'Venue'}\n${shareUrl}`;
      setSendingId(friend.id);
      try {
        let convId = friend.conversationId;
        if (!convId) {
          const created = await apiPost('/api/messages/conversations/find-or-create', {
            participantId: friend.id,
          });
          convId = created?.id;
        }
        if (!convId) {
          toast.error('Could not open conversation');
          return;
        }
        await apiPost(`/api/messages/conversations/${convId}`, { body });
        setSentIds((prev) => new Set([...prev, friend.id]));
        toast.success('Sent!');
      } catch (e) {
        toast.error(e?.data?.error || e?.message || 'Failed to send');
      } finally {
        setSendingId(null);
      }
    },
    [shareUrl, venueName],
  );

  const copyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Could not copy');
    }
  }, [shareUrl]);

  const wa = `https://wa.me/?text=${encodeURIComponent(textSnippet)}`;
  const tw = `https://twitter.com/intent/tweet?text=${encodeURIComponent(`${venueName || 'Venue'} on SEC Nightlife`)}&url=${encodeURIComponent(shareUrl)}`;
  const fb = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-app md:max-w-app-md max-h-[90vh] overflow-y-auto bg-[#0A0A0B] border-[#262629] text-left">
        <DialogHeader>
          <DialogTitle>Share venue</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          <section>
            <h4 className="text-sm font-semibold text-gray-300 mb-2 flex items-center gap-2">
              <MessageCircle className="w-4 h-4" />
              Share with a Friend
            </h4>
            <div className="relative mb-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <Input
                className="pl-9 bg-[#141416] border-[#262629]"
                placeholder="Search friends..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            {loadingFriends && <p className="text-xs text-gray-500">Searching…</p>}
            {!loadingFriends && debounced.length >= 1 && friends.length === 0 && (
              <p className="text-xs text-gray-500">No matching friends</p>
            )}
            <ul className="space-y-2 max-h-48 overflow-y-auto">
              {friends.map((f) => (
                <li
                  key={f.id}
                  className="flex items-center gap-3 p-2 rounded-lg bg-[#141416] border border-[#262629]"
                >
                  <div className="w-10 h-10 rounded-full bg-[#262629] overflow-hidden shrink-0">
                    {f.avatarUrl ? (
                      <img src={f.avatarUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-sm font-medium">
                        {(f.fullName || f.username || '?')[0]?.toUpperCase()}
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{f.fullName || f.username}</p>
                    <p className="text-xs text-gray-500 truncate">@{f.username}</p>
                  </div>
                  {sentIds.has(f.id) ? (
                    <span className="text-xs text-[var(--sec-success)]">Sent!</span>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      className="shrink-0"
                      disabled={sendingId === f.id}
                      onClick={() => sendToFriend(f)}
                    >
                      {sendingId === f.id ? '…' : 'Send'}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h4 className="text-sm font-semibold text-gray-300 mb-2 flex items-center gap-2">
              <Link2 className="w-4 h-4" />
              Share externally
            </h4>
            <div className="flex flex-col gap-2">
              <Button type="button" variant="outline" className="justify-start" onClick={copyLink}>
                {copied ? 'Copied!' : 'Copy Link'}
              </Button>
              <Button type="button" variant="outline" className="justify-start" asChild>
                <a href={wa} target="_blank" rel="noopener noreferrer">
                  Share on WhatsApp
                </a>
              </Button>
              <Button type="button" variant="outline" className="justify-start" asChild>
                <a href={tw} target="_blank" rel="noopener noreferrer">
                  Share on Twitter / X
                </a>
              </Button>
              <Button type="button" variant="outline" className="justify-start" asChild>
                <a href={fb} target="_blank" rel="noopener noreferrer">
                  Share on Facebook
                </a>
              </Button>
            </div>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
