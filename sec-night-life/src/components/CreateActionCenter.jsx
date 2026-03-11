/**
 * Create Action Center — Primary action hub (Instagram-style).
 * Options: Create Event, Host Event, Post Job, Create Promotion, Create Table Invite.
 * Uses SecNightlife brand colors only.
 */
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Calendar,
  Crown,
  Briefcase,
  Megaphone,
  Users,
  ChevronRight,
} from 'lucide-react';

const ACTIONS = [
  {
    id: 'create-event',
    label: 'Create Event',
    description: 'Create a venue or host event',
    icon: Calendar,
    getPage: (userRoles) =>
      userRoles.business ? 'BusinessEvents' : userRoles.host ? 'CreateHostEvent' : 'CreateHostEvent',
    show: () => true,
  },
  {
    id: 'host-event',
    label: 'Host Event',
    description: 'Host a table at an event',
    icon: Crown,
    page: 'CreateTable',
    show: () => true,
  },
  {
    id: 'post-job',
    label: 'Post Job',
    description: 'List a job for your venue',
    icon: Briefcase,
    page: 'CreateJob',
    show: (userRoles) => userRoles.business,
  },
  {
    id: 'create-promotion',
    label: 'Create Promotion',
    description: 'Promote events and deals',
    icon: Megaphone,
    page: 'BusinessPromotions',
    show: (userRoles) => userRoles.business,
  },
  {
    id: 'create-table-invite',
    label: 'Create Table Invite',
    description: 'Invite friends to join your table',
    icon: Users,
    page: 'CreateTable',
    show: () => true,
  },
];

export default function CreateActionCenter({ open, onOpenChange, userRoles = { partygoer: true, host: false, business: false } }) {
  const navigate = useNavigate();

  const visibleActions = ACTIONS.filter((a) => a.show(userRoles));

  const handleAction = (action) => {
    onOpenChange(false);
    const page = action.getPage ? action.getPage(userRoles) : action.page;
    navigate(createPageUrl(page));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-sm"
        style={{
          backgroundColor: 'var(--sec-bg-card)',
          borderColor: 'var(--sec-border)',
          color: 'var(--sec-text-primary)',
        }}
      >
        <DialogHeader>
          <DialogTitle style={{ color: 'var(--sec-text-primary)', fontSize: 18, fontWeight: 600 }}>
            Create
          </DialogTitle>
          <DialogDescription style={{ color: 'var(--sec-text-muted)', fontSize: 13 }}>
            Choose an action to get started
          </DialogDescription>
        </DialogHeader>
        <div className="mt-2 flex flex-col gap-1" style={{ maxHeight: 360, overflowY: 'auto' }}>
          {visibleActions.map((action) => {
            const Icon = action.icon;
            return (
              <button
                key={action.id}
                onClick={() => handleAction(action)}
                className="flex items-center gap-4 w-full p-4 rounded-xl text-left transition-colors border-none cursor-pointer"
                style={{
                  backgroundColor: 'var(--sec-bg-elevated)',
                  border: '1px solid var(--sec-border)',
                  color: 'var(--sec-text-primary)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--sec-bg-hover)';
                  e.currentTarget.style.borderColor = 'var(--sec-border-hover)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--sec-bg-elevated)';
                  e.currentTarget.style.borderColor = 'var(--sec-border)';
                }}
              >
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 12,
                    backgroundColor: 'var(--sec-accent-muted)',
                    border: '1px solid var(--sec-accent-border)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <Icon size={20} strokeWidth={1.5} style={{ color: 'var(--sec-accent)' }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--sec-text-primary)' }}>
                    {action.label}
                  </p>
                  <p style={{ fontSize: 12, color: 'var(--sec-text-muted)', marginTop: 2 }}>
                    {action.description}
                  </p>
                </div>
                <ChevronRight size={18} style={{ color: 'var(--sec-text-muted)', flexShrink: 0 }} />
              </button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
