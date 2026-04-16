/**
 * Party Goer quick actions — house party, table, table invite.
 */
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Sparkles, Armchair, Mail } from 'lucide-react';
import { apiGet } from '@/api/client';

export default function CreateActionCenter({ open, onOpenChange, userRoles = { partygoer: true, host: true, business: false }, activeMode = 'partygoer' }) {
  const navigate = useNavigate();
  const [hasActiveTable, setHasActiveTable] = useState(false);

  useEffect(() => {
    if (!open || activeMode !== 'partygoer') return undefined;
    let cancelled = false;
    (async () => {
      try {
        const r = await apiGet('/api/host/tables/memberships/active');
        if (!cancelled && r?.hasActive) setHasActiveTable(true);
      } catch {
        if (!cancelled) setHasActiveTable(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, activeMode]);

  const goParty = () => {
    onOpenChange(false);
    navigate(`${createPageUrl('HostDashboard')}?create=party`);
  };

  const goTable = () => {
    onOpenChange(false);
    navigate(`${createPageUrl('HostDashboard')}?create=table`);
  };

  const goInvite = () => {
    onOpenChange(false);
    navigate(`${createPageUrl('HostDashboard')}?create=invite`);
  };

  if (activeMode !== 'partygoer') return null;

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
            Host a party or list a table
          </DialogDescription>
        </DialogHeader>
        <div className="mt-2 flex flex-col gap-1" style={{ maxHeight: 360, overflowY: 'auto' }}>
          <button
            type="button"
            onClick={goParty}
            className="flex items-center gap-4 w-full p-4 rounded-xl text-left transition-colors border-none cursor-pointer"
            style={{
              backgroundColor: 'var(--sec-bg-elevated)',
              border: '1px solid var(--sec-border)',
              color: 'var(--sec-text-primary)',
            }}
          >
            <Sparkles size={22} strokeWidth={1.5} />
            <div className="flex-1 min-w-0">
              <div className="font-semibold">Create House Party</div>
              <div className="text-xs opacity-80 mt-0.5">Host your own event and invite the city</div>
            </div>
          </button>
          <button
            type="button"
            onClick={goTable}
            className="flex items-center gap-4 w-full p-4 rounded-xl text-left transition-colors border-none cursor-pointer"
            style={{
              backgroundColor: 'var(--sec-bg-elevated)',
              border: '1px solid var(--sec-border)',
              color: 'var(--sec-text-primary)',
            }}
          >
            <Armchair size={22} strokeWidth={1.5} />
            <div className="flex-1 min-w-0">
              <div className="font-semibold">Host a Table</div>
              <div className="text-xs opacity-80 mt-0.5">List a table at a club for people to join</div>
            </div>
          </button>
          <button
            type="button"
            onClick={hasActiveTable ? goInvite : undefined}
            disabled={!hasActiveTable}
            title={!hasActiveTable ? 'Join or host a table first' : undefined}
            className="flex items-center gap-4 w-full p-4 rounded-xl text-left transition-colors border-none cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed"
            style={{
              backgroundColor: 'var(--sec-bg-elevated)',
              border: '1px solid var(--sec-border)',
              color: 'var(--sec-text-primary)',
            }}
          >
            <Mail size={22} strokeWidth={1.5} />
            <div className="flex-1 min-w-0">
              <div className="font-semibold">Create Table Invite</div>
              <div className="text-xs opacity-80 mt-0.5">Invite friends to your table</div>
            </div>
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
