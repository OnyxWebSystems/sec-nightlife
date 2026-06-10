import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiPost } from '@/api/client';
import { toast } from 'sonner';
import { UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

export const STAFF_PERMISSIONS = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'analytics', label: 'Analytics' },
  { key: 'bookings', label: 'Bookings' },
  { key: 'promotions', label: 'Promotions' },
  { key: 'events', label: 'Events' },
  { key: 'menu', label: 'Menu' },
  { key: 'jobs', label: 'Jobs' },
  { key: 'posts', label: 'Posts' },
  { key: 'messages', label: 'Messages' },
  { key: 'venue_page', label: 'Venue page' },
];

export default function AddStaffModal({ open, onOpenChange, venueId }) {
  const queryClient = useQueryClient();
  const [username, setUsername] = useState('');
  const [permissions, setPermissions] = useState(() =>
    Object.fromEntries(STAFF_PERMISSIONS.map((p) => [p.key, false])),
  );

  const inviteMutation = useMutation({
    mutationFn: async () => {
      const trimmed = username.trim().toLowerCase().replace(/^@/, '');
      if (!trimmed) throw new Error('Enter a username');
      const activePerms = Object.fromEntries(
        Object.entries(permissions).filter(([, v]) => v),
      );
      if (!Object.keys(activePerms).length) throw new Error('Select at least one permission');
      return apiPost(`/api/business/venues/${venueId}/staff`, {
        username: trimmed,
        permissions: activePerms,
      });
    },
    onSuccess: () => {
      toast.success('Staff member invited');
      setUsername('');
      setPermissions(Object.fromEntries(STAFF_PERMISSIONS.map((p) => [p.key, false])));
      queryClient.invalidateQueries({ queryKey: ['venue-staff', venueId] });
      onOpenChange(false);
    },
    onError: (err) => {
      toast.error(err?.data?.error || err?.message || 'Could not invite staff');
    },
  });

  const togglePerm = (key) => {
    setPermissions((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-md"
        style={{
          backgroundColor: 'var(--sec-bg-card)',
          borderColor: 'var(--sec-border)',
          color: 'var(--sec-text-primary)',
        }}
      >
        <DialogHeader>
          <DialogTitle style={{ color: 'var(--sec-text-primary)' }}>Invite staff</DialogTitle>
          <DialogDescription style={{ color: 'var(--sec-text-muted)' }}>
            Grant access to specific business tools for this venue.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          <div>
            <Label className="text-xs uppercase tracking-wide text-[var(--sec-text-muted)]">
              Username
            </Label>
            <Input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="@username"
              className="mt-2"
              style={{
                backgroundColor: 'var(--sec-bg-elevated)',
                borderColor: 'var(--sec-border)',
              }}
            />
          </div>

          <div>
            <Label className="text-xs uppercase tracking-wide text-[var(--sec-text-muted)]">
              Permissions
            </Label>
            <div
              className="mt-2 grid grid-cols-2 gap-2 max-h-48 overflow-y-auto p-3 rounded-xl"
              style={{ backgroundColor: 'var(--sec-bg-elevated)', border: '1px solid var(--sec-border)' }}
            >
              {STAFF_PERMISSIONS.map((p) => (
                <label
                  key={p.key}
                  className="flex items-center gap-2 text-sm cursor-pointer"
                  style={{ color: 'var(--sec-text-secondary)' }}
                >
                  <input
                    type="checkbox"
                    checked={!!permissions[p.key]}
                    onChange={() => togglePerm(p.key)}
                    className="rounded"
                  />
                  {p.label}
                </label>
              ))}
            </div>
          </div>

          <Button
            className="w-full sec-btn sec-btn-primary"
            disabled={!venueId || inviteMutation.isPending}
            onClick={() => inviteMutation.mutate()}
          >
            <UserPlus size={16} className="mr-2" />
            {inviteMutation.isPending ? 'Inviting…' : 'Send invite'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
