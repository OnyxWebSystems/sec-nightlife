import React, { useEffect, useState } from 'react';
import { Megaphone, Loader2 } from 'lucide-react';
import { apiDelete, apiGet, apiPost } from '@/api/client';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

export default function AdminAnnouncementsPanel() {
  const [announcements, setAnnouncements] = useState([]);
  const [announcementsLoading, setAnnouncementsLoading] = useState(false);
  const [announcementForm, setAnnouncementForm] = useState({
    title: '',
    message: '',
    ctaUrl: '',
    ctaLabel: '',
  });
  const [publishingAnnouncement, setPublishingAnnouncement] = useState(false);
  const [actionLoading, setActionLoading] = useState(null);

  const loadAnnouncements = async () => {
    setAnnouncementsLoading(true);
    try {
      const res = await apiGet('/api/admin/announcements');
      setAnnouncements(res?.announcements || []);
    } catch (err) {
      setAnnouncements([]);
      toast.error(`Could not load announcements${err?.message ? `: ${err.message}` : ''}`);
    } finally {
      setAnnouncementsLoading(false);
    }
  };

  useEffect(() => {
    loadAnnouncements();
  }, []);

  const handlePublishAnnouncement = async () => {
    const title = announcementForm.title.trim();
    const message = announcementForm.message.trim();
    if (!title || message.length < 10) {
      toast.error('Title and message (10+ characters) are required.');
      return;
    }
    setPublishingAnnouncement(true);
    try {
      await apiPost('/api/admin/announcements', {
        title,
        message,
        ctaUrl: announcementForm.ctaUrl.trim() || null,
        ctaLabel: announcementForm.ctaLabel.trim() || null,
      });
      toast.success('Announcement published to all home feeds');
      setAnnouncementForm({ title: '', message: '', ctaUrl: '', ctaLabel: '' });
      await loadAnnouncements();
    } catch (e) {
      toast.error(e?.data?.error || e?.message || 'Could not publish announcement');
    } finally {
      setPublishingAnnouncement(false);
    }
  };

  const handleRemoveAnnouncement = async (id) => {
    if (!window.confirm('Remove this announcement from every user\'s home page?')) return;
    setActionLoading(`announcement-${id}`);
    try {
      await apiDelete(`/api/admin/announcements/${id}`);
      toast.success('Announcement removed');
      await loadAnnouncements();
    } catch (e) {
      toast.error(e?.data?.error || e?.message || 'Could not remove announcement');
    } finally {
      setActionLoading(null);
    }
  };

  const handlePurgeAnnouncement = async (id) => {
    if (!window.confirm('Permanently delete this announcement? This cannot be undone.')) return;
    setActionLoading(`purge-${id}`);
    try {
      await apiDelete(`/api/admin/announcements/${id}/permanent`);
      toast.success('Announcement deleted permanently');
      await loadAnnouncements();
    } catch (e) {
      toast.error(e?.data?.error || e?.message || 'Could not delete announcement');
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="p-5 rounded-2xl border border-[#262629] bg-gradient-to-br from-[#141416] to-[#0A0A0B]">
        <div className="flex items-center gap-2 mb-4">
          <Megaphone size={20} className="text-[var(--sec-accent)]" />
          <h3 className="font-semibold text-lg">Publish announcement</h3>
        </div>
        <p className="text-sm text-[var(--sec-text-muted)] mb-4">
          Appears at the top of every user&apos;s home feed with premium SEC styling. Remove anytime.
        </p>
        <div className="space-y-3">
          <input
            type="text"
            placeholder="Headline (e.g. New venues live in Sandton)"
            maxLength={100}
            value={announcementForm.title}
            onChange={(e) => setAnnouncementForm((f) => ({ ...f, title: e.target.value }))}
            className="w-full min-h-[44px] px-3 rounded-lg bg-[#0A0A0B] border border-[#262629]"
          />
          <textarea
            placeholder="Message for all users (10–600 characters)"
            maxLength={600}
            rows={4}
            value={announcementForm.message}
            onChange={(e) => setAnnouncementForm((f) => ({ ...f, message: e.target.value }))}
            className="w-full px-3 py-2 rounded-lg bg-[#0A0A0B] border border-[#262629] resize-y min-h-[100px]"
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              type="text"
              placeholder="Optional link (https://… or /Events)"
              value={announcementForm.ctaUrl}
              onChange={(e) => setAnnouncementForm((f) => ({ ...f, ctaUrl: e.target.value }))}
              className="w-full min-h-[44px] px-3 rounded-lg bg-[#0A0A0B] border border-[#262629]"
            />
            <input
              type="text"
              placeholder="Button label (e.g. Explore now)"
              maxLength={40}
              value={announcementForm.ctaLabel}
              onChange={(e) => setAnnouncementForm((f) => ({ ...f, ctaLabel: e.target.value }))}
              className="w-full min-h-[44px] px-3 rounded-lg bg-[#0A0A0B] border border-[#262629]"
            />
          </div>
          <Button
            className="w-full min-h-[44px]"
            disabled={publishingAnnouncement}
            onClick={handlePublishAnnouncement}
          >
            {publishingAnnouncement ? 'Publishing…' : 'Publish to home feed'}
          </Button>
        </div>
      </div>

      <div>
        <h3 className="font-semibold mb-3">Live announcements</h3>
        {announcementsLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-8 h-8 animate-spin text-[var(--sec-accent)]" />
          </div>
        ) : announcements.filter((a) => a.isActive).length === 0 ? (
          <p className="text-sm text-[var(--sec-text-muted)]">No active announcements.</p>
        ) : (
          <div className="space-y-3">
            {announcements.filter((a) => a.isActive).map((a) => (
              <div
                key={a.id}
                className="p-4 rounded-xl border border-[var(--sec-accent-border)] bg-[#141416] space-y-2"
                style={{ boxShadow: '0 8px 24px rgba(0,0,0,0.25)' }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs uppercase tracking-wider text-[var(--sec-accent)] mb-1">Live</p>
                    <p className="font-semibold">{a.title}</p>
                    <p className="text-sm text-gray-300 mt-2 whitespace-pre-wrap">{a.message}</p>
                    {a.ctaUrl && a.ctaLabel ? (
                      <p className="text-xs text-[var(--sec-text-muted)] mt-2">
                        CTA: {a.ctaLabel} → {a.ctaUrl}
                      </p>
                    ) : null}
                    <p className="text-xs text-[var(--sec-text-muted)] mt-2">
                      Posted {new Date(a.createdAt).toLocaleString()}
                      {a.createdBy?.username ? ` by @${a.createdBy.username}` : ''}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="min-h-[44px] shrink-0 border-red-500/40 text-red-400"
                    disabled={actionLoading === `announcement-${a.id}`}
                    onClick={() => handleRemoveAnnouncement(a.id)}
                  >
                    {actionLoading === `announcement-${a.id}` ? 'Removing…' : 'Remove'}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {announcements.some((a) => !a.isActive) ? (
        <div>
          <h3 className="font-semibold mb-3 text-[var(--sec-text-muted)]">Recently removed</h3>
          <div className="space-y-2">
            {announcements.filter((a) => !a.isActive).slice(0, 8).map((a) => (
              <div key={a.id} className="p-3 rounded-lg bg-[#0A0A0B] border border-[#262629] opacity-70 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium line-through">{a.title}</p>
                  <p className="text-xs text-[var(--sec-text-muted)] mt-1">
                    Removed {a.removedAt ? new Date(a.removedAt).toLocaleString() : ''}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="min-h-[44px] shrink-0 border-red-500/40 text-red-400"
                  disabled={actionLoading === `purge-${a.id}`}
                  onClick={() => handlePurgeAnnouncement(a.id)}
                >
                  {actionLoading === `purge-${a.id}` ? 'Deleting…' : 'Delete permanently'}
                </Button>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
