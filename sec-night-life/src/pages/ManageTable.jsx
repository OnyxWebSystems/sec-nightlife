import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import * as authService from '@/services/authService';
import { dataService } from '@/services/dataService';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  ChevronLeft,
  Users,
  DollarSign,
  Check,
  X,
  Edit,
  UserX,
  MessageCircle,
  Calendar,
  MapPin,
  Settings,
  Trash2,
  Crown,
  Phone
} from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { motion } from 'framer-motion';
import { format, parseISO } from 'date-fns';

export default function ManageTable() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [user, setUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [editData, setEditData] = useState({});

  const urlParams = new URLSearchParams(window.location.search);
  const tableId = urlParams.get('id');

  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    try {
      const currentUser = await authService.getCurrentUser();
      setUser(currentUser);
      const profiles = await dataService.User.filter({ created_by: currentUser.email });
      if (profiles.length > 0) {
        setUserProfile(profiles[0]);
      }
    } catch (e) {
      authService.redirectToLogin();
    }
  };

  const { data: table, isLoading } = useQuery({
    queryKey: ['table', tableId],
    queryFn: async () => {
      const tables = await dataService.Table.filter({ id: tableId });
      return tables[0];
    },
    enabled: !!tableId,
  });

  const { data: event } = useQuery({
    queryKey: ['table-event', table?.event_id],
    queryFn: async () => {
      const events = await dataService.Event.filter({ id: table.event_id });
      return events[0];
    },
    enabled: !!table?.event_id,
  });

  const { data: members = [] } = useQuery({
    queryKey: ['table-members', table?.members],
    queryFn: async () => {
      if (!table?.members?.length) return [];
      const memberProfiles = await Promise.all(
        table.members.map(m => dataService.User.filter({ id: m.user_id }))
      );
      return memberProfiles.flat();
    },
    enabled: !!table?.members?.length,
  });

  const { data: pendingUsers = [] } = useQuery({
    queryKey: ['pending-users', table?.pending_requests],
    queryFn: async () => {
      if (!table?.pending_requests?.length) return [];
      const profiles = await Promise.all(
        table.pending_requests.map(id => dataService.User.filter({ id }))
      );
      return profiles.flat();
    },
    enabled: !!table?.pending_requests?.length,
  });

  const updateTableMutation = useMutation({
    mutationFn: async (data) => {
      await dataService.Table.update(tableId, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['table', tableId]);
      setShowEditDialog(false);
    },
  });

  const acceptRequestMutation = useMutation({
    mutationFn: async (requestUserId) => {
      const updatedMembers = table.members.map(m => 
        m.user_id === requestUserId ? { ...m, status: 'confirmed' } : m
      );
      const updatedPending = table.pending_requests.filter(id => id !== requestUserId);
      
      await dataService.Table.update(tableId, {
        members: updatedMembers,
        pending_requests: updatedPending,
        current_guests: (table.current_guests || 1) + 1
      });

      await dataService.Notification.create({
        user_id: requestUserId,
        type: 'table_invite',
        title: 'Request Accepted!',
        message: `You've been accepted to join "${table.name}"`,
        data: { table_id: tableId },
        action_url: createPageUrl(`TableDetails?id=${tableId}`)
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['table', tableId]);
      queryClient.invalidateQueries(['pending-users', table?.pending_requests]);
    },
  });

  const rejectRequestMutation = useMutation({
    mutationFn: async (requestUserId) => {
      const updatedMembers = table.members.filter(m => m.user_id !== requestUserId);
      const updatedPending = table.pending_requests.filter(id => id !== requestUserId);
      
      await dataService.Table.update(tableId, {
        members: updatedMembers,
        pending_requests: updatedPending
      });

      await dataService.Notification.create({
        user_id: requestUserId,
        type: 'table_invite',
        title: 'Request Declined',
        message: `Your request to join "${table.name}" was declined`,
        data: { table_id: tableId }
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['table', tableId]);
      queryClient.invalidateQueries(['pending-users', table?.pending_requests]);
    },
  });

  const removeMemberMutation = useMutation({
    mutationFn: async (memberId) => {
      const updatedMembers = table.members.filter(m => m.user_id !== memberId);
      
      await dataService.Table.update(tableId, {
        members: updatedMembers,
        current_guests: Math.max((table.current_guests || 1) - 1, 1)
      });

      await dataService.Notification.create({
        user_id: memberId,
        type: 'table_invite',
        title: 'Removed from Table',
        message: `You've been removed from "${table.name}"`,
        data: { table_id: tableId }
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['table', tableId]);
    },
  });

  const handleEdit = () => {
    setEditData({
      name: table.name,
      description: table.description,
      max_guests: table.max_guests,
      min_spend: table.min_spend,
      joining_fee: table.joining_fee,
      status: table.status
    });
    setShowEditDialog(true);
  };

  const handleSave = () => {
    updateTableMutation.mutate(editData);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-12 h-12 rounded-full border-2 border-[#00D4AA] border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!table || table.host_user_id !== userProfile?.id) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="text-center">
          <h2 className="text-xl font-bold mb-2">Access Denied</h2>
          <p className="text-gray-400 mb-4">You don't have permission to manage this table</p>
          <Button onClick={() => navigate(-1)} className="bg-gradient-to-r from-[#FF3366] to-[#7C3AED]">
            Go Back
          </Button>
        </div>
      </div>
    );
  }

  const confirmedMembers = members.filter(m => {
    const memberData = table.members?.find(md => md.user_id === m.id);
    return memberData?.status === 'confirmed';
  });

  const totalContributions = table.members?.reduce((sum, m) => sum + (m.contribution || 0), 0) || 0;

  return (
    <div className="min-h-screen pb-8">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-[#0A0A0B]/80 backdrop-blur-xl border-b border-[#262629]">
        <div className="px-4 py-4 flex items-center justify-between">
          <button
            onClick={() => navigate(-1)}
            className="w-10 h-10 rounded-full bg-[#141416] flex items-center justify-center"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h1 className="font-semibold">Manage Table</h1>
          <button
            onClick={handleEdit}
            className="w-10 h-10 rounded-full bg-[#141416] flex items-center justify-center"
          >
            <Edit className="w-5 h-5" />
          </button>
        </div>
      </header>

      <div className="px-4 lg:px-8 py-6 space-y-6">
        {/* Table Info */}
        <div className="glass-card rounded-2xl p-6">
          <h2 className="text-2xl font-bold mb-2">{table.name}</h2>
          <p className="text-gray-400 text-sm mb-4">{table.description}</p>
          
          {event && (
            <div className="flex items-center gap-2 text-sm text-gray-400 mb-4">
              <Calendar className="w-4 h-4" />
              <span>{event.title}</span>
              <span>•</span>
              <span>{format(parseISO(event.date), 'MMM d, yyyy')}</span>
            </div>
          )}

          <div className="grid grid-cols-4 gap-4 pt-4 border-t border-[#262629]">
            <div className="text-center">
              <p className="text-2xl font-bold text-[#00D4AA]">{table.current_guests || 1}</p>
              <p className="text-xs text-gray-500">Confirmed</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-[#FFD700]">{table.pending_requests?.length || 0}</p>
              <p className="text-xs text-gray-500">Pending</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold">R{totalContributions.toLocaleString()}</p>
              <p className="text-xs text-gray-500">Total Pledged</p>
            </div>
            <div className="text-center">
              <p className={`text-2xl font-bold ${
                table.status === 'open' ? 'text-[#00D4AA]' :
                table.status === 'full' ? 'text-[#FFD700]' :
                'text-gray-400'
              }`}>
                {table.status}
              </p>
              <p className="text-xs text-gray-500">Status</p>
            </div>
          </div>
        </div>

        {/* Pending Requests */}
        {pendingUsers.length > 0 && (
          <div>
            <h3 className="font-semibold mb-4 flex items-center gap-2">
              <Users className="w-5 h-5 text-[#FFD700]" />
              Pending Requests ({pendingUsers.length})
            </h3>
            <div className="space-y-3">
              {pendingUsers.map((user) => {
                const memberData = table.members?.find(m => m.user_id === user.id);
                
                return (
                  <motion.div
                    key={user.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="glass-card rounded-xl p-4"
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#FF3366] to-[#7C3AED] overflow-hidden flex-shrink-0">
                        {user.avatar_url ? (
                          <img src={user.avatar_url} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-lg font-bold">
                            {user.username?.[0] || 'U'}
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium">{user.username || 'User'}</p>
                        <p className="text-xs text-gray-500">Joined {format(new Date(memberData?.joined_at || new Date()), 'MMM d')}</p>
                        {memberData?.contribution > 0 && (
                          <p className="text-sm text-[#00D4AA] mt-1">
                            Pledged: R{memberData.contribution.toLocaleString()}
                          </p>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => acceptRequestMutation.mutate(user.id)}
                          disabled={acceptRequestMutation.isPending}
                          className="w-10 h-10 rounded-full bg-[#00D4AA]/20 text-[#00D4AA] flex items-center justify-center hover:bg-[#00D4AA]/30 transition-colors"
                        >
                          <Check className="w-5 h-5" />
                        </button>
                        <button
                          onClick={() => rejectRequestMutation.mutate(user.id)}
                          disabled={rejectRequestMutation.isPending}
                          className="w-10 h-10 rounded-full bg-[#FF3366]/20 text-[#FF3366] flex items-center justify-center hover:bg-[#FF3366]/30 transition-colors"
                        >
                          <X className="w-5 h-5" />
                        </button>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        )}

        {/* Confirmed Members */}
        <div>
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <Users className="w-5 h-5 text-[#00D4AA]" />
            Confirmed Members ({confirmedMembers.length})
          </h3>
          <div className="space-y-3">
            {confirmedMembers.map((member) => {
              const memberData = table.members?.find(m => m.user_id === member.id);
              const isHost = member.id === table.host_user_id;

              return (
                <motion.div
                  key={member.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="glass-card rounded-xl p-4"
                >
                  <div className="flex items-start gap-3">
                    <div className="relative">
                      <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#FF3366] to-[#7C3AED] overflow-hidden">
                        {member.avatar_url ? (
                          <img src={member.avatar_url} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-lg font-bold">
                            {member.username?.[0] || 'U'}
                          </div>
                        )}
                      </div>
                      {isHost && (
                        <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-[#FFD700] flex items-center justify-center">
                          <Crown className="w-3 h-3 text-black" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium">{member.username || 'User'}</p>
                      <p className="text-xs text-gray-500">{isHost ? 'Host' : 'Member'}</p>
                      {memberData?.contribution > 0 && (
                        <p className="text-sm text-[#00D4AA] mt-1">
                          Contribution: R{memberData.contribution.toLocaleString()}
                        </p>
                      )}
                    </div>
                    {!isHost && (
                      <button
                        onClick={() => removeMemberMutation.mutate(member.id)}
                        disabled={removeMemberMutation.isPending}
                        className="w-10 h-10 rounded-full bg-[#FF3366]/20 text-[#FF3366] flex items-center justify-center hover:bg-[#FF3366]/30 transition-colors"
                      >
                        <UserX className="w-5 h-5" />
                      </button>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-2 gap-3">
          <Button
            onClick={() => navigate(createPageUrl(`ChatRoom?table=${tableId}`))}
            variant="outline"
            className="h-14 border-[#262629]"
          >
            <MessageCircle className="w-5 h-5 mr-2" />
            Open Chat
          </Button>
          <Button
            onClick={() => setShowCancelDialog(true)}
            variant="outline"
            className="h-14 border-[#FF3366]/30 text-[#FF3366]"
          >
            <Trash2 className="w-5 h-5 mr-2" />
            Cancel Table
          </Button>
        </div>
      </div>

      {/* Edit Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="bg-[#141416] border-[#262629] max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Table</DialogTitle>
            <DialogDescription>Update your table settings</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>Table Name</Label>
              <Input
                value={editData.name || ''}
                onChange={(e) => setEditData({ ...editData, name: e.target.value })}
                className="mt-2 bg-[#0A0A0B] border-[#262629]"
              />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea
                value={editData.description || ''}
                onChange={(e) => setEditData({ ...editData, description: e.target.value })}
                className="mt-2 bg-[#0A0A0B] border-[#262629]"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Max Guests</Label>
                <Input
                  type="number"
                  value={editData.max_guests || ''}
                  onChange={(e) => setEditData({ ...editData, max_guests: parseInt(e.target.value) })}
                  className="mt-2 bg-[#0A0A0B] border-[#262629]"
                />
              </div>
              <div>
                <Label>Min Spend (R)</Label>
                <Input
                  type="number"
                  value={editData.min_spend || ''}
                  onChange={(e) => setEditData({ ...editData, min_spend: parseInt(e.target.value) })}
                  className="mt-2 bg-[#0A0A0B] border-[#262629]"
                />
              </div>
            </div>
            <div>
              <Label>Joining Fee (R)</Label>
              <Input
                type="number"
                value={editData.joining_fee || ''}
                onChange={(e) => setEditData({ ...editData, joining_fee: parseInt(e.target.value) })}
                className="mt-2 bg-[#0A0A0B] border-[#262629]"
              />
            </div>
            <div>
              <Label>Status</Label>
              <Select
                value={editData.status}
                onValueChange={(value) => setEditData({ ...editData, status: value })}
              >
                <SelectTrigger className="mt-2 bg-[#0A0A0B] border-[#262629]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="full">Full</SelectItem>
                  <SelectItem value="closed">Closed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={() => setShowEditDialog(false)}
              className="flex-1 border-[#262629]"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={updateTableMutation.isPending}
              className="flex-1 bg-gradient-to-r from-[#FF3366] to-[#7C3AED]"
            >
              {updateTableMutation.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Cancel Dialog */}
      <Dialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <DialogContent className="bg-[#141416] border-[#262629] max-w-md">
          <DialogHeader>
            <DialogTitle>Cancel Table?</DialogTitle>
            <DialogDescription>
              This will notify all members and mark the table as cancelled
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-3 pt-4">
            <Button
              variant="outline"
              onClick={() => setShowCancelDialog(false)}
              className="flex-1 border-[#262629]"
            >
              Keep Table
            </Button>
            <Button
              onClick={() => {
                updateTableMutation.mutate({ status: 'cancelled' });
                setShowCancelDialog(false);
              }}
              className="flex-1 bg-[#FF3366]"
            >
              Cancel Table
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}