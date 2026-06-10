import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiDelete, apiGet, apiPatch, apiPost } from '@/api/client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Plus, Users, Trash2, LogOut, Shield } from 'lucide-react';
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

export default function BusinessVenueGroupPanel({ venueId }) {
  const queryClient = useQueryClient();
  const [selectedGroupId, setSelectedGroupId] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [messageBody, setMessageBody] = useState('');
  const [addMemberUsername, setAddMemberUsername] = useState('');

  const groupsBase = `/api/business/venues/${venueId}/groups`;

  const { data: groups = [], isLoading: groupsLoading } = useQuery({
    queryKey: ['venue-message-groups', venueId],
    queryFn: () => apiGet(groupsBase),
    enabled: !!venueId,
  });

  const selectedGroup = groups.find((g) => g.id === selectedGroupId) || null;

  const { data: messages = [], refetch: refetchMessages } = useQuery({
    queryKey: ['venue-message-group-messages', venueId, selectedGroupId],
    queryFn: () => apiGet(`${groupsBase}/${selectedGroupId}/messages`),
    enabled: !!venueId && !!selectedGroupId,
    refetchInterval: 15000,
  });

  const { data: groupDetail, refetch: refetchDetail } = useQuery({
    queryKey: ['venue-message-group-detail', venueId, selectedGroupId],
    queryFn: () => apiGet(`${groupsBase}/${selectedGroupId}`),
    enabled: !!venueId && !!selectedGroupId,
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
    mutationFn: (body) => apiPost(`${groupsBase}/${selectedGroupId}/messages`, { body }),
    onSuccess: () => {
      setMessageBody('');
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

  if (!venueId) {
    return (
      <p className="text-sm text-center py-12" style={{ color: 'var(--sec-text-muted)' }}>
        Select a venue to manage groups.
      </p>
    );
  }

  const canManage = groupDetail?.canManage ?? selectedGroup?.canManage ?? false;
  const isAdmin = groupDetail?.myRole === 'ADMIN' || groupDetail?.isOwner;

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
              className="sec-card p-4 border text-left w-full"
              style={{
                borderColor:
                  selectedGroupId === g.id ? 'var(--sec-accent-border)' : 'var(--sec-border)',
              }}
              onClick={() => setSelectedGroupId(g.id)}
            >
              <p className="font-medium">{g.name}</p>
              <p className="text-xs mt-1" style={{ color: 'var(--sec-text-muted)' }}>
                {g.memberCount || 0} members
                {g.lastMessage?.body ? ` · ${g.lastMessage.body.slice(0, 40)}` : ''}
              </p>
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
              <h3 className="font-semibold">{selectedGroup?.name || 'Group'}</h3>
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
                      <div className="flex gap-2 mt-4 mb-3">
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
                  <div
                    key={m.id}
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
                    <div className="mt-1 whitespace-pre-wrap">{m.body}</div>
                  </div>
                ))
              )}
            </div>

            <div className="flex gap-2 mt-auto">
              <input
                type="text"
                className="sec-input flex-1 min-h-[44px]"
                value={messageBody}
                onChange={(e) => setMessageBody(e.target.value)}
                placeholder="Type a message… 😀"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    if (messageBody.trim()) sendMutation.mutate(messageBody.trim());
                  }
                }}
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
