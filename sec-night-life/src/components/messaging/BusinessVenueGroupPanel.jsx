import React, { useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiDelete, apiGet, apiPatch, apiPost } from '@/api/client';
import { asArray } from '@/utils';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Plus, Users, Trash2, LogOut, Shield, Search } from 'lucide-react';
import EmojiPickerButton from '@/components/messaging/EmojiPickerButton';
import { useMessageReply } from '@/hooks/useMessageReply';
import MessageReplyPreview from '@/components/messaging/MessageReplyPreview';
import MessageBubble from '@/components/messaging/MessageBubble';
import { linkifyMessageBody } from '@/lib/linkifyMessageBody';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export default function BusinessVenueGroupPanel({ venueId, staffContextToken = null }) {
  const queryClient = useQueryClient();
  const [selectedGroupId, setSelectedGroupId] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [messageBody, setMessageBody] = useState('');
  const [addMemberUsername, setAddMemberUsername] = useState('');
  const [memberSearchQ, setMemberSearchQ] = useState('');
  const [avatarUploading, setAvatarUploading] = useState(false);
  const { replyingTo, setReplyingTo, clearReply } = useMessageReply();

  const groupsBase = staffContextToken
    ? `/api/staff/context/${staffContextToken}/groups`
    : venueId
      ? `/api/business/venues/${venueId}/groups`
      : null;

  const { data: groupsRaw, isLoading: groupsLoading } = useQuery({
    queryKey: ['venue-message-groups', venueId, staffContextToken],
    queryFn: () => apiGet(groupsBase),
    enabled: !!groupsBase,
    staleTime: 30_000,
  });
  const groups = asArray(groupsRaw?.items ?? groupsRaw);

  const searchUsersUrl = staffContextToken
    ? `${groupsBase}/search-users`
    : venueId
      ? `/api/business/venues/${venueId}/groups/search-users`
      : null;

  const [debouncedMemberQ, setDebouncedMemberQ] = useState('');
  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedMemberQ(memberSearchQ.trim()), 280);
    return () => window.clearTimeout(t);
  }, [memberSearchQ]);

  const cloudinaryConfig = {
    cloudName: import.meta.env.VITE_CLOUDINARY_CLOUD_NAME || '',
    uploadPreset: import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET || '',
  };

  async function uploadGroupAvatar(file) {
    if (!selectedGroupId || !groupsBase) return;
    if (!cloudinaryConfig.cloudName || !cloudinaryConfig.uploadPreset) {
      toast.error('Image upload is not configured');
      return;
    }
    setAvatarUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('upload_preset', cloudinaryConfig.uploadPreset);
      const uploadRes = await fetch(
        `https://api.cloudinary.com/v1_1/${cloudinaryConfig.cloudName}/upload`,
        { method: 'POST', body: form },
      );
      const uploadData = await uploadRes.json();
      if (!uploadRes.ok) throw new Error(uploadData?.error?.message || 'Upload failed');
      await apiPatch(`${groupsBase}/${selectedGroupId}`, { avatarUrl: uploadData.secure_url });
      toast.success('Group photo updated');
      queryClient.invalidateQueries({ queryKey: ['venue-message-groups', venueId, staffContextToken] });
      refetchDetail();
    } catch (err) {
      toast.error(err?.message || 'Could not upload photo');
    } finally {
      setAvatarUploading(false);
    }
  }

  const selectedGroup = groups.find((g) => g.id === selectedGroupId) || null;

  const { data: messagesRaw, refetch: refetchMessages } = useQuery({
    queryKey: ['venue-message-group-messages', venueId, staffContextToken, selectedGroupId],
    queryFn: () => apiGet(`${groupsBase}/${selectedGroupId}/messages`),
    enabled: !!groupsBase && !!selectedGroupId,
    refetchInterval: 60_000,
  });
  const messages = asArray(messagesRaw?.items ?? messagesRaw);

  const { data: groupDetail, refetch: refetchDetail } = useQuery({
    queryKey: ['venue-message-group-detail', venueId, staffContextToken, selectedGroupId],
    queryFn: () => apiGet(`${groupsBase}/${selectedGroupId}`),
    enabled: !!groupsBase && !!selectedGroupId,
  });

  const createMutation = useMutation({
    mutationFn: (name) => apiPost(groupsBase, { name }),
    onSuccess: (created) => {
      toast.success('Group created');
      setNewGroupName('');
      setCreateOpen(false);
      queryClient.invalidateQueries({ queryKey: ['venue-message-groups', venueId] });
      if (created?.id) setSelectedGroupId(created.id);
    },
    onError: (err) => toast.error(err?.data?.error || err?.message || 'Could not create group'),
  });

  const sendMutation = useMutation({
    mutationFn: (body) =>
      apiPost(`${groupsBase}/${selectedGroupId}/messages`, {
        body,
        ...(replyingTo?.id ? { replyToMessageId: replyingTo.id } : {}),
      }),
    onSuccess: () => {
      setMessageBody('');
      clearReply();
      refetchMessages();
    },
    onError: (err) => toast.error(err?.data?.error || err?.message || 'Could not send'),
  });

  const addMemberMutation = useMutation({
    mutationFn: (username) =>
      apiPost(`${groupsBase}/${selectedGroupId}/members`, {
        username: username.trim().toLowerCase().replace(/^@/, ''),
      }),
    onSuccess: () => {
      toast.success('Member added');
      setAddMemberUsername('');
      refetchDetail();
      queryClient.invalidateQueries({ queryKey: ['venue-message-groups', venueId] });
    },
    onError: (err) => toast.error(err?.data?.error || err?.message || 'Could not add member'),
  });

  const removeMemberMutation = useMutation({
    mutationFn: (userId) => apiDelete(`${groupsBase}/${selectedGroupId}/members/${userId}`),
    onSuccess: () => {
      toast.success('Member removed');
      refetchDetail();
    },
    onError: (err) => toast.error(err?.data?.error || err?.message || 'Could not remove member'),
  });

  const promoteMutation = useMutation({
    mutationFn: (userId) =>
      apiPatch(`${groupsBase}/${selectedGroupId}/members/${userId}`, { role: 'ADMIN' }),
    onSuccess: () => {
      toast.success('Member promoted to admin');
      refetchDetail();
    },
    onError: (err) => toast.error(err?.data?.error || err?.message || 'Could not update role'),
  });

  const deleteMessageMutation = useMutation({
    mutationFn: (messageId) =>
      apiDelete(`${groupsBase}/${selectedGroupId}/messages/${messageId}`),
    onSuccess: () => refetchMessages(),
    onError: (err) => toast.error(err?.data?.error || err?.message || 'Could not delete message'),
  });

  const leaveMutation = useMutation({
    mutationFn: () => apiPost(`${groupsBase}/${selectedGroupId}/leave`, {}),
    onSuccess: () => {
      toast.success('You left the group');
      setSelectedGroupId(null);
      queryClient.invalidateQueries({ queryKey: ['venue-message-groups', venueId] });
    },
    onError: (err) => toast.error(err?.data?.error || err?.message || 'Could not leave group'),
  });

  const deleteGroupMutation = useMutation({
    mutationFn: () => apiDelete(`${groupsBase}/${selectedGroupId}`),
    onSuccess: () => {
      toast.success('Group deleted');
      setSelectedGroupId(null);
      queryClient.invalidateQueries({ queryKey: ['venue-message-groups', venueId] });
    },
    onError: (err) => toast.error(err?.data?.error || err?.message || 'Could not delete group'),
  });

  const canManage = groupDetail?.canManage ?? selectedGroup?.canManage ?? false;
  const isAdmin = groupDetail?.myRole === 'ADMIN' || groupDetail?.isOwner;

  const { data: memberSearchResults = [] } = useQuery({
    queryKey: ['venue-group-user-search', searchUsersUrl, debouncedMemberQ],
    queryFn: () => apiGet(`${searchUsersUrl}?q=${encodeURIComponent(debouncedMemberQ)}`),
    enabled: Boolean(searchUsersUrl && debouncedMemberQ.length >= 2 && canManage),
    staleTime: 30_000,
  });

  if (!groupsBase) {
    return (
      <p className="text-sm text-center py-12" style={{ color: 'var(--sec-text-muted)' }}>
        Select a venue to manage groups.
      </p>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-2 min-h-[200px]">
        <div className="flex items-center justify-between gap-2 mb-2">
          <h3 className="font-semibold text-sm">Venue groups</h3>
          <Button size="sm" variant="outline" onClick={() => setCreateOpen(true)}>
            <Plus size={14} className="mr-1" />
            New group
          </Button>
        </div>

        {groupsLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="animate-spin" />
          </div>
        ) : groups.length === 0 ? (
          <p className="text-sm text-center py-12" style={{ color: 'var(--sec-text-muted)' }}>
            No groups yet. Create one for your team.
          </p>
        ) : (
          groups.map((g) => (
            <button
              key={g.id}
              type="button"
              className="sec-card p-4 border text-left w-full flex items-center gap-3"
              style={{
                borderColor:
                  selectedGroupId === g.id ? 'var(--sec-accent-border)' : 'var(--sec-border)',
              }}
              onClick={() => setSelectedGroupId(g.id)}
            >
              {g.avatarUrl ? (
                <img src={g.avatarUrl} alt="" className="w-10 h-10 rounded-full object-cover shrink-0" />
              ) : (
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
                  style={{ background: 'var(--sec-accent-muted)', color: 'var(--sec-accent)' }}
                >
                  {(g.name || 'G').charAt(0).toUpperCase()}
                </div>
              )}
              <div className="min-w-0">
                <p className="font-medium">{g.name}</p>
                <p className="text-xs mt-1" style={{ color: 'var(--sec-text-muted)' }}>
                  {g.memberCount || 0} members
                  {g.lastMessage?.body ? ` · ${g.lastMessage.body.slice(0, 40)}` : ''}
                </p>
              </div>
            </button>
          ))
        )}
      </div>

      <div
        className="sec-card p-4 border min-h-[320px] flex flex-col"
        style={{ borderColor: 'var(--sec-border)' }}
      >
        {!selectedGroupId ? (
          <p className="text-sm text-center py-8" style={{ color: 'var(--sec-text-muted)' }}>
            Select a group to view messages.
          </p>
        ) : (
          <>
            <div className="flex items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-2 min-w-0">
                {(groupDetail?.avatarUrl || selectedGroup?.avatarUrl) ? (
                  <img
                    src={groupDetail?.avatarUrl || selectedGroup?.avatarUrl}
                    alt=""
                    className="w-10 h-10 rounded-full object-cover shrink-0"
                  />
                ) : (
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
                    style={{ background: 'var(--sec-accent-muted)', color: 'var(--sec-accent)' }}
                  >
                    {(selectedGroup?.name || 'G').charAt(0).toUpperCase()}
                  </div>
                )}
                <h3 className="font-semibold truncate">{selectedGroup?.name || 'Group'}</h3>
                {isAdmin ? (
                  <label className="text-xs text-[var(--sec-accent)] cursor-pointer shrink-0">
                    {avatarUploading ? '…' : 'Photo'}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      disabled={avatarUploading}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) uploadGroupAvatar(f);
                        e.target.value = '';
                      }}
                    />
                  </label>
                ) : null}
              </div>
              <div className="flex items-center gap-1">
                <Sheet>
                  <SheetTrigger asChild>
                    <Button size="sm" variant="outline">
                      <Users size={14} className="mr-1" />
                      Members
                    </Button>
                  </SheetTrigger>
                  <SheetContent side="bottom" className="max-h-[70vh]">
                    <SheetHeader>
                      <SheetTitle>Members</SheetTitle>
                    </SheetHeader>
                    {canManage ? (
                      <div className="mt-4 mb-3 space-y-2">
                        <div className="relative">
                          <Search
                            size={16}
                            className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--sec-text-muted)]"
                          />
                          <Input
                            value={memberSearchQ}
                            onChange={(e) => setMemberSearchQ(e.target.value)}
                            placeholder="Search @username…"
                            className="pl-9"
                          />
                        </div>
                        {memberSearchQ.trim().length >= 2 && memberSearchResults.length > 0 ? (
                          <ul className="border rounded-lg overflow-hidden" style={{ borderColor: 'var(--sec-border)' }}>
                            {memberSearchResults.map((u) => (
                              <li key={u.id}>
                                <button
                                  type="button"
                                  className="w-full flex items-center gap-2 p-2 text-left hover:bg-[var(--sec-bg-elevated)]"
                                  onClick={() => {
                                    addMemberMutation.mutate(u.username);
                                    setMemberSearchQ('');
                                  }}
                                >
                                  {u.avatarUrl ? (
                                    <img src={u.avatarUrl} alt="" className="w-8 h-8 rounded-full object-cover" />
                                  ) : (
                                    <div className="w-8 h-8 rounded-full bg-[var(--sec-bg-elevated)] flex items-center justify-center text-xs">
                                      @
                                    </div>
                                  )}
                                  <div>
                                    <p className="text-sm font-medium">@{u.username}</p>
                                    {u.fullName ? (
                                      <p className="text-xs text-[var(--sec-text-muted)]">{u.fullName}</p>
                                    ) : null}
                                  </div>
                                </button>
                              </li>
                            ))}
                          </ul>
                        ) : null}
                        <div className="flex gap-2">
                          <Input
                            value={addMemberUsername}
                            onChange={(e) => setAddMemberUsername(e.target.value)}
                            placeholder="@username"
                            className="flex-1"
                          />
                          <Button
                            size="sm"
                            disabled={!addMemberUsername.trim() || addMemberMutation.isPending}
                            onClick={() => addMemberMutation.mutate(addMemberUsername)}
                          >
                            Add
                          </Button>
                        </div>
                      </div>
                    ) : null}
                    <ul className="space-y-2 overflow-y-auto max-h-48">
                      {(groupDetail?.members || []).map((m) => (
                        <li
                          key={m.userId || m.id}
                          className="flex items-center justify-between gap-2 p-2 rounded-lg"
                          style={{ backgroundColor: 'var(--sec-bg-elevated)' }}
                        >
                          <div>
                            <p className="text-sm font-medium">@{m.username}</p>
                            <p className="text-xs" style={{ color: 'var(--sec-text-muted)' }}>
                              {m.role}
                            </p>
                          </div>
                          {canManage && m.userId !== groupDetail?.ownerUserId ? (
                            <div className="flex gap-1">
                              {m.role !== 'ADMIN' ? (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => promoteMutation.mutate(m.userId)}
                                >
                                  <Shield size={14} />
                                </Button>
                              ) : null}
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-red-400"
                                onClick={() => removeMemberMutation.mutate(m.userId)}
                              >
                                <Trash2 size={14} />
                              </Button>
                            </div>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </SheetContent>
                </Sheet>
                {isAdmin ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-red-400"
                    disabled={deleteGroupMutation.isPending}
                    onClick={() => {
                      if (window.confirm('Delete this group?')) deleteGroupMutation.mutate();
                    }}
                  >
                    <Trash2 size={14} />
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={leaveMutation.isPending}
                    onClick={() => leaveMutation.mutate()}
                  >
                    <LogOut size={14} className="mr-1" />
                    Leave
                  </Button>
                )}
              </div>
            </div>

            <div className="flex-1 max-h-52 overflow-y-auto space-y-2 mb-3">
              {messages.length === 0 ? (
                <p className="text-sm" style={{ color: 'var(--sec-text-muted)' }}>
                  No messages yet.
                </p>
              ) : (
                messages.map((m) => (
                  <MessageBubble
                    key={m.id}
                    message={m}
                    onReply={setReplyingTo}
                    className="text-sm p-2 rounded-lg"
                    style={{
                      background: m.isMine ? 'var(--sec-accent-muted)' : 'var(--sec-bg-elevated)',
                      border: '1px solid var(--sec-border)',
                    }}
                  >
                    <div className="flex justify-between gap-2">
                      <span className="text-xs" style={{ color: 'var(--sec-text-muted)' }}>
                        {m.senderLabel || m.sender?.username || 'User'}
                      </span>
                      {m.isMine ? (
                        <button
                          type="button"
                          className="text-xs text-red-400"
                          onClick={() => deleteMessageMutation.mutate(m.id)}
                        >
                          Delete
                        </button>
                      ) : null}
                    </div>
                    <div className="mt-1 whitespace-pre-wrap">{linkifyMessageBody(m.body)}</div>
                  </MessageBubble>
                ))
              )}
            </div>

            <MessageReplyPreview replyingTo={replyingTo} onClear={clearReply} />
            <div className="flex gap-2 mt-auto">
              <input
                type="text"
                className="sec-input flex-1 min-h-[44px]"
                value={messageBody}
                onChange={(e) => setMessageBody(e.target.value)}
                placeholder="Type a message…"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    if (messageBody.trim()) sendMutation.mutate(messageBody.trim());
                  }
                }}
              />
              <EmojiPickerButton
                onSelect={(emoji) => setMessageBody((prev) => `${prev}${emoji}`)}
              />
              <Button
                disabled={!messageBody.trim() || sendMutation.isPending}
                onClick={() => sendMutation.mutate(messageBody.trim())}
              >
                Send
              </Button>
            </div>
          </>
        )}
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent
          style={{
            backgroundColor: 'var(--sec-bg-card)',
            borderColor: 'var(--sec-border)',
            color: 'var(--sec-text-primary)',
          }}
        >
          <DialogHeader>
            <DialogTitle>Create group</DialogTitle>
          </DialogHeader>
          <Input
            value={newGroupName}
            onChange={(e) => setNewGroupName(e.target.value)}
            placeholder="Group name"
            className="mt-2"
          />
          <Button
            className="mt-4 w-full"
            disabled={!newGroupName.trim() || createMutation.isPending}
            onClick={() => createMutation.mutate(newGroupName.trim())}
          >
            {createMutation.isPending ? 'Creating…' : 'Create'}
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
