import React, { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost } from '@/api/client';
import { toast } from 'sonner';
import { Check, Loader2, Search, UserPlus, X } from 'lucide-react';
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

const PERM_PRESETS = [
  {
    id: 'bookings',
    label: 'Bookings team',
    keys: ['dashboard', 'bookings', 'messages'],
  },
  {
    id: 'events',
    label: 'Events team',
    keys: ['dashboard', 'events', 'bookings', 'menu'],
  },
  {
    id: 'full',
    label: 'Full access',
    keys: STAFF_PERMISSIONS.map((p) => p.key),
  },
];

function UserAvatar({ url, name }) {
  if (url) {
    return (
      <img
        src={url}
        alt=""
        className="w-10 h-10 rounded-full object-cover"
        style={{ border: '1px solid var(--sec-border)' }}
      />
    );
  }
  const initial = (name || '?').charAt(0).toUpperCase();
  return (
    <div
      className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold"
      style={{ background: 'var(--sec-accent-muted)', color: 'var(--sec-accent)' }}
    >
      {initial}
    </div>
  );
}

export default function AddStaffModal({ open, onOpenChange, venueId }) {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [selectedUser, setSelectedUser] = useState(null);
  const [permissions, setPermissions] = useState(() =>
    Object.fromEntries(STAFF_PERMISSIONS.map((p) => [p.key, false])),
  );

  useEffect(() => {
    if (!open) {
      setSearchQuery('');
      setDebouncedQuery('');
      setSelectedUser(null);
      setPermissions(Object.fromEntries(STAFF_PERMISSIONS.map((p) => [p.key, false])));
    }
  }, [open]);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQuery(searchQuery.trim()), 280);
    return () => window.clearTimeout(t);
  }, [searchQuery]);

  const { data: searchResults = [], isFetching: searching } = useQuery({
    queryKey: ['staff-user-search', venueId, debouncedQuery],
    queryFn: () =>
      apiGet(
        `/api/business/venues/${venueId}/staff/search-users?q=${encodeURIComponent(debouncedQuery)}`,
      ),
    enabled: Boolean(open && venueId && debouncedQuery.length >= 2),
    staleTime: 30_000,
  });

  const inviteMutation = useMutation({
    mutationFn: async () => {
      if (!selectedUser?.username) throw new Error('Select a user from search results');
      const activePerms = Object.fromEntries(
        Object.entries(permissions).filter(([, v]) => v),
      );
      if (!Object.keys(activePerms).length) throw new Error('Select at least one permission');
      return apiPost(`/api/business/venues/${venueId}/staff`, {
        username: selectedUser.username,
        permissions: activePerms,
      });
    },
    onSuccess: () => {
      toast.success(`@${selectedUser?.username} invited as staff`);
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

  const applyPreset = (keys) => {
    setPermissions(Object.fromEntries(STAFF_PERMISSIONS.map((p) => [p.key, keys.includes(p.key)])));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-lg max-h-[90vh] overflow-y-auto"
        style={{
          backgroundColor: 'var(--sec-bg-card)',
          borderColor: 'var(--sec-border)',
          color: 'var(--sec-text-primary)',
        }}
      >
        <DialogHeader>
          <DialogTitle style={{ color: 'var(--sec-text-primary)' }}>Invite staff</DialogTitle>
          <DialogDescription style={{ color: 'var(--sec-text-muted)' }}>
            Search by @username or name, confirm the right person, then choose what they can access.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 mt-2">
          <div>
            <Label className="text-xs uppercase tracking-wide text-[var(--sec-text-muted)]">
              Find user
            </Label>
            <div className="relative mt-2">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--sec-text-muted)]"
              />
              <Input
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  if (selectedUser) setSelectedUser(null);
                }}
                placeholder="Type @username or full name…"
                className="pl-9 h-11 rounded-xl"
                style={{
                  backgroundColor: 'var(--sec-bg-elevated)',
                  borderColor: 'var(--sec-border)',
                }}
                autoFocus
              />
            </div>
            <p className="text-[11px] mt-1.5 text-[var(--sec-text-muted)]">
              Enter at least 2 characters to search registered SEC users.
            </p>

            {selectedUser ? (
              <div
                className="mt-3 flex items-center gap-3 p-3 rounded-xl"
                style={{
                  background: 'var(--sec-accent-muted)',
                  border: '1px solid rgba(212, 175, 55, 0.35)',
                }}
              >
                <UserAvatar url={selectedUser.avatarUrl} name={selectedUser.fullName || selectedUser.username} />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm truncate">
                    @{selectedUser.username || 'user'}
                  </p>
                  {selectedUser.fullName ? (
                    <p className="text-xs text-[var(--sec-text-muted)] truncate">{selectedUser.fullName}</p>
                  ) : null}
                </div>
                <span className="sec-badge sec-badge-success text-[10px] shrink-0">
                  <Check size={10} className="inline mr-1" />
                  Selected
                </span>
                <button
                  type="button"
                  className="p-1 rounded-lg text-[var(--sec-text-muted)] hover:text-[var(--sec-text-primary)]"
                  onClick={() => setSelectedUser(null)}
                  aria-label="Clear selection"
                >
                  <X size={16} />
                </button>
              </div>
            ) : debouncedQuery.length >= 2 ? (
              <div
                className="mt-3 rounded-xl overflow-hidden"
                style={{ border: '1px solid var(--sec-border)', background: 'var(--sec-bg-elevated)' }}
              >
                {searching ? (
                  <p className="text-xs text-[var(--sec-text-muted)] flex items-center gap-2 p-3">
                    <Loader2 size={14} className="animate-spin" />
                    Searching…
                  </p>
                ) : searchResults.length === 0 ? (
                  <p className="text-xs text-[var(--sec-text-muted)] p-3">No users found. Try another username.</p>
                ) : (
                  <ul className="max-h-44 overflow-y-auto divide-y divide-[var(--sec-border)]">
                    {searchResults.map((u) => (
                      <li key={u.id}>
                        <button
                          type="button"
                          className="w-full flex items-center gap-3 p-3 text-left hover:bg-[var(--sec-bg-card)] transition-colors"
                          onClick={() => {
                            setSelectedUser(u);
                            setSearchQuery(u.username ? `@${u.username}` : u.fullName || '');
                          }}
                        >
                          <UserAvatar url={u.avatarUrl} name={u.fullName || u.username} />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium truncate">
                              @{u.username || 'user'}
                            </p>
                            {u.fullName ? (
                              <p className="text-xs text-[var(--sec-text-muted)] truncate">{u.fullName}</p>
                            ) : null}
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : null}
          </div>

          <div>
            <Label className="text-xs uppercase tracking-wide text-[var(--sec-text-muted)]">
              Quick presets
            </Label>
            <div className="mt-2 flex flex-wrap gap-2">
              {PERM_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  className="text-xs px-3 py-1.5 rounded-full transition-colors"
                  style={{
                    border: '1px solid var(--sec-border)',
                    background: 'var(--sec-bg-elevated)',
                    color: 'var(--sec-text-secondary)',
                  }}
                  onClick={() => applyPreset(preset.keys)}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label className="text-xs uppercase tracking-wide text-[var(--sec-text-muted)]">
              Permissions
            </Label>
            <div
              className="mt-2 grid grid-cols-2 gap-2 max-h-40 overflow-y-auto p-3 rounded-xl"
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
                    className="rounded accent-[var(--sec-accent)]"
                  />
                  {p.label}
                </label>
              ))}
            </div>
          </div>

          <Button
            className="w-full sec-btn sec-btn-primary h-11 rounded-xl"
            disabled={!venueId || !selectedUser || inviteMutation.isPending}
            onClick={() => inviteMutation.mutate()}
          >
            <UserPlus size={16} className="mr-2" />
            {inviteMutation.isPending
              ? 'Sending invite…'
              : selectedUser
                ? `Invite @${selectedUser.username}`
                : 'Select a user to invite'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
