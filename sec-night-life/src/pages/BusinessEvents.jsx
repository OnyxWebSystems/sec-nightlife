import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import * as authService from '@/services/authService';
import { dataService } from '@/services/dataService';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Calendar, Plus, Edit2, Trash2, Eye, Search, Loader2
} from 'lucide-react';
import { toast } from 'sonner';

const EMPTY_EVENT = {
  title: '', description: '', date: '', city: '', status: 'draft',
  cover_image_url: '', ticket_tiers: [],
  start_time: '',
  has_entrance_fee: false,
  entrance_fee_amount: '',
  max_hosted_tables: '',
  table_pricing_tiers: [],
};

export default function BusinessEvents() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [user, setUser] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState(null);
  const [form, setForm] = useState({ ...EMPTY_EVENT });
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [deleteId, setDeleteId] = useState(null);

  useEffect(() => {
    (async () => {
      try { setUser(await authService.getCurrentUser()); }
      catch { authService.redirectToLogin(); }
    })();
  }, []);

  const { data: venues = [] } = useQuery({
    queryKey: ['biz-venues', user?.id],
    queryFn: () => dataService.Venue.mine(),
    enabled: !!user,
  });
  const venue = venues[0];

  const { data: events = [], isLoading } = useQuery({
    queryKey: ['biz-events', venue?.id],
    queryFn: () => dataService.Event.filter({ venue_id: venue.id }),
    enabled: !!venue,
  });

  const saveMutation = useMutation({
    mutationFn: async (data) => {
      if (editingEvent) {
        return dataService.Event.update(editingEvent.id, data);
      }
      return dataService.Event.create({ ...data, venue_id: venue.id });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['biz-events'] });
      toast.success(editingEvent ? 'Event updated' : 'Event created');
      closeDialog();
    },
    onError: () => toast.error('Failed to save event'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => dataService.Event.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['biz-events'] });
      toast.success('Event deleted');
      setDeleteId(null);
    },
    onError: () => toast.error('Failed to delete event'),
  });

  const openCreate = () => {
    setEditingEvent(null);
    setForm({ ...EMPTY_EVENT, city: venue?.city || '' });
    setDialogOpen(true);
  };

  const openEdit = (evt) => {
    setEditingEvent(evt);
    setForm({
      title: evt.title || '',
      description: evt.description || '',
      date: evt.date || '',
      city: evt.city || '',
      status: evt.status || 'draft',
      cover_image_url: evt.cover_image_url || '',
      ticket_tiers: evt.ticket_tiers || [],
      start_time: evt.start_time || '',
      has_entrance_fee: !!evt.has_entrance_fee,
      entrance_fee_amount: evt.entrance_fee_amount != null && evt.entrance_fee_amount !== ''
        ? String(evt.entrance_fee_amount)
        : '',
      max_hosted_tables:
        evt.max_hosted_tables != null && evt.max_hosted_tables !== '' ? String(evt.max_hosted_tables) : '',
      table_pricing_tiers: Array.isArray(evt.table_pricing_tiers) && evt.table_pricing_tiers.length
        ? evt.table_pricing_tiers.map((t) => ({
            max_guests: String(t.max_guests ?? ''),
            min_spend: String(t.min_spend ?? ''),
          }))
        : [],
    });
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setEditingEvent(null);
    setForm({ ...EMPTY_EVENT });
  };

  const handleSave = () => {
    if (!form.title || !form.date || !form.city) {
      toast.error('Please fill in title, date, and city');
      return;
    }
    if (form.has_entrance_fee) {
      const amt = parseFloat(String(form.entrance_fee_amount).replace(',', '.'));
      if (Number.isNaN(amt) || amt < 0) {
        toast.error('Please enter a valid entrance fee amount');
        return;
      }
    }
    const payload = {
      title: form.title,
      date: form.date,
      city: form.city,
      status: form.status,
      has_entrance_fee: form.has_entrance_fee,
      entrance_fee_amount: form.has_entrance_fee
        ? parseFloat(String(form.entrance_fee_amount).replace(',', '.'))
        : null,
    };
    if (form.description) payload.description = form.description;
    if (form.cover_image_url) payload.cover_image_url = form.cover_image_url;
    if (form.ticket_tiers?.length) payload.ticket_tiers = form.ticket_tiers;
    if (form.start_time) payload.start_time = form.start_time;
    else if (editingEvent) payload.start_time = null;
    const maxT = String(form.max_hosted_tables || '').trim();
    if (maxT) {
      const n = parseInt(maxT, 10);
      if (Number.isNaN(n) || n < 1) {
        toast.error('Max hosted tables must be a positive number');
        return;
      }
      payload.max_hosted_tables = n;
    } else {
      payload.max_hosted_tables = null;
    }
    const tierRows = (form.table_pricing_tiers || []).filter(
      (t) => String(t?.max_guests || '').trim() && String(t?.min_spend ?? '').trim() !== ''
    );
    const parsedTiers = [];
    for (const t of tierRows) {
      const mg = parseInt(String(t.max_guests).trim(), 10);
      const ms = parseFloat(String(t.min_spend).replace(',', '.'));
      if (Number.isNaN(mg) || mg < 1 || Number.isNaN(ms) || ms < 0) {
        toast.error('Check table pricing tiers (guests and min spend)');
        return;
      }
      parsedTiers.push({ max_guests: mg, min_spend: ms });
    }
    if (parsedTiers.length) payload.table_pricing_tiers = parsedTiers;
    else payload.table_pricing_tiers = null;
    saveMutation.mutate(payload);
  };

  const filtered = events
    .filter(e => statusFilter === 'all' || e.status === statusFilter)
    .filter(e => !search || (e.title ?? '').toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  if (!user) return null;

  if (!venue) {
    return (
      <div style={{ padding: 40, textAlign: 'center', maxWidth: 400, margin: '0 auto' }}>
        <Calendar size={32} style={{ color: 'var(--sec-text-muted)', margin: '0 auto 12px' }} />
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>No Venue Found</h2>
        <p style={{ fontSize: 13, color: 'var(--sec-text-muted)', marginBottom: 20 }}>Register a venue first to manage events.</p>
        <Button onClick={() => navigate(createPageUrl('VenueOnboarding'))} style={{ backgroundColor: 'var(--sec-accent)', color: '#000' }}>
          Register Venue
        </Button>
      </div>
    );
  }

  return (
    <div style={{ padding: '24px 20px', maxWidth: 900, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700 }}>Events Manager</h1>
          <p style={{ fontSize: 13, color: 'var(--sec-text-muted)' }}>{venue.name} &middot; {events.length} events</p>
        </div>
        <Button onClick={openCreate} style={{ backgroundColor: 'var(--sec-accent)', color: '#000', fontWeight: 600 }} className="h-10 rounded-xl">
          <Plus size={16} className="mr-1.5" /> Create Event
        </Button>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 18, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
          <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--sec-text-muted)' }} />
          <Input
            placeholder="Search events..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ backgroundColor: 'var(--sec-bg-card)', borderColor: 'var(--sec-border)' }}
            className="h-10 rounded-xl pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px] h-10 rounded-xl" style={{ backgroundColor: 'var(--sec-bg-card)', borderColor: 'var(--sec-border)' }}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent style={{ backgroundColor: 'var(--sec-bg-card)', borderColor: 'var(--sec-border)' }} className="text-white">
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="published">Published</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Events List */}
      {isLoading ? (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <Loader2 size={24} className="animate-spin" style={{ color: 'var(--sec-accent)', margin: '0 auto' }} />
        </div>
      ) : filtered.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: 40, borderRadius: 14,
          backgroundColor: 'var(--sec-bg-card)', border: '1px solid var(--sec-border)',
        }}>
          <Calendar size={28} style={{ color: 'var(--sec-text-muted)', margin: '0 auto 10px' }} />
          <p style={{ fontSize: 14, color: 'var(--sec-text-muted)', marginBottom: 14 }}>
            {search ? 'No matching events found' : 'No events yet'}
          </p>
          {!search && (
            <Button onClick={openCreate} variant="outline" className="rounded-xl" style={{ borderColor: 'var(--sec-border)' }}>
              <Plus size={15} className="mr-1.5" /> Create your first event
            </Button>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filtered.map(evt => (
            <div
              key={evt.id}
              style={{
                display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px',
                borderRadius: 14, backgroundColor: 'var(--sec-bg-card)', border: '1px solid var(--sec-border)',
              }}
            >
              {evt.cover_image_url ? (
                <img src={evt.cover_image_url} alt="" style={{ width: 56, height: 56, borderRadius: 10, objectFit: 'cover', flexShrink: 0 }} />
              ) : (
                <div style={{
                  width: 56, height: 56, borderRadius: 10, flexShrink: 0,
                  backgroundColor: 'var(--sec-accent-muted)', border: '1px solid var(--sec-accent-border)',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                }}>
                  <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--sec-accent)', lineHeight: 1 }}>
                    {evt.date ? new Date(evt.date + 'T00:00').getDate() : '—'}
                  </span>
                  <span style={{ fontSize: 9, color: 'var(--sec-text-muted)', textTransform: 'uppercase' }}>
                    {evt.date ? new Date(evt.date + 'T00:00').toLocaleDateString('en', { month: 'short' }) : ''}
                  </span>
                </div>
              )}

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {evt.title}
                </div>
                <div style={{ fontSize: 12, color: 'var(--sec-text-muted)', marginTop: 2 }}>
                  {evt.date}
                  {evt.start_time ? ` · ${evt.start_time}` : ''}
                  {' · '}{evt.city}
                </div>
              </div>

              <span className={`sec-badge ${evt.status === 'published' ? 'sec-badge-success' : 'sec-badge-gold'}`}>
                {evt.status}
              </span>

              <div style={{ display: 'flex', gap: 4 }}>
                <button
                  onClick={() => navigate(createPageUrl('EventDetails') + '?id=' + evt.id)}
                  style={{ padding: 8, borderRadius: 8, border: 'none', cursor: 'pointer', backgroundColor: 'transparent', color: 'var(--sec-text-muted)' }}
                  title="View"
                >
                  <Eye size={16} />
                </button>
                <button
                  onClick={() => openEdit(evt)}
                  style={{ padding: 8, borderRadius: 8, border: 'none', cursor: 'pointer', backgroundColor: 'transparent', color: 'var(--sec-text-muted)' }}
                  title="Edit"
                >
                  <Edit2 size={16} />
                </button>
                <button
                  onClick={() => setDeleteId(evt.id)}
                  style={{ padding: 8, borderRadius: 8, border: 'none', cursor: 'pointer', backgroundColor: 'transparent', color: 'var(--sec-error)' }}
                  title="Delete"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="text-white sm:max-w-[520px]" style={{ backgroundColor: 'var(--sec-bg-card)', borderColor: 'var(--sec-border)' }}>
          <DialogHeader>
            <DialogTitle>{editingEvent ? 'Edit Event' : 'Create Event'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <Label className="text-gray-400 text-sm">Event Title *</Label>
              <Input
                value={form.title}
                onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
                placeholder="Friday Night Live"
                className="mt-1.5 h-11 rounded-xl"
                style={{ backgroundColor: 'var(--sec-bg-elevated)', borderColor: 'var(--sec-border)' }}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-gray-400 text-sm">Date *</Label>
                <Input
                  type="date"
                  value={form.date}
                  onChange={e => setForm(p => ({ ...p, date: e.target.value }))}
                  className="mt-1.5 h-11 rounded-xl"
                style={{ backgroundColor: 'var(--sec-bg-elevated)', borderColor: 'var(--sec-border)' }}
                />
              </div>
              <div>
                <Label className="text-gray-400 text-sm">City *</Label>
                <Input
                  value={form.city}
                  onChange={e => setForm(p => ({ ...p, city: e.target.value }))}
                  placeholder="Johannesburg"
                  className="mt-1.5 h-11 rounded-xl"
                style={{ backgroundColor: 'var(--sec-bg-elevated)', borderColor: 'var(--sec-border)' }}
                />
              </div>
            </div>
            <div>
              <Label className="text-gray-400 text-sm">Start time</Label>
              <Input
                type="time"
                value={form.start_time}
                onChange={e => setForm(p => ({ ...p, start_time: e.target.value }))}
                className="mt-1.5 h-11 rounded-xl max-w-[200px]"
                style={{ backgroundColor: 'var(--sec-bg-elevated)', borderColor: 'var(--sec-border)' }}
              />
              <p className="text-xs text-gray-500 mt-1">Optional. Leave empty if the time is not set yet.</p>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="entrance-fee"
                  checked={form.has_entrance_fee}
                  onCheckedChange={(v) => setForm(p => ({ ...p, has_entrance_fee: v === true }))}
                />
                <Label htmlFor="entrance-fee" className="text-gray-300 text-sm cursor-pointer">
                  Entrance fee at the door
                </Label>
              </div>
              {form.has_entrance_fee && (
                <div>
                  <Label className="text-gray-400 text-sm">Entrance fee (ZAR) *</Label>
                  <Input
                    type="number"
                    min={0}
                    step={0.01}
                    value={form.entrance_fee_amount}
                    onChange={e => setForm(p => ({ ...p, entrance_fee_amount: e.target.value }))}
                    placeholder="0.00"
                    className="mt-1.5 h-11 rounded-xl max-w-[200px]"
                    style={{ backgroundColor: 'var(--sec-bg-elevated)', borderColor: 'var(--sec-border)' }}
                  />
                </div>
              )}
            </div>
            <div>
              <Label className="text-gray-400 text-sm">Max hosted tables (optional)</Label>
              <Input
                type="number"
                min={1}
                value={form.max_hosted_tables}
                onChange={e => setForm(p => ({ ...p, max_hosted_tables: e.target.value }))}
                placeholder="No limit if empty"
                className="mt-1.5 h-11 rounded-xl max-w-[200px]"
                style={{ backgroundColor: 'var(--sec-bg-elevated)', borderColor: 'var(--sec-border)' }}
              />
              <p className="text-xs text-gray-500 mt-1">Caps how many separate tables can be hosted for this event.</p>
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-gray-400 text-sm">Table pricing tiers (optional)</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 rounded-lg text-xs"
                  style={{ borderColor: 'var(--sec-border)' }}
                  onClick={() =>
                    setForm((p) => ({
                      ...p,
                      table_pricing_tiers: [...(p.table_pricing_tiers || []), { max_guests: '', min_spend: '' }],
                    }))
                  }
                >
                  <Plus size={14} className="mr-1" /> Add tier
                </Button>
              </div>
              <p className="text-xs text-gray-500 mb-2">Guests per table and minimum spend (ZAR) for each option.</p>
              <div className="space-y-2">
                {(form.table_pricing_tiers || []).map((tier, idx) => (
                  <div key={idx} className="flex gap-2 items-end flex-wrap">
                    <div className="flex-1 min-w-[100px]">
                      <Label className="text-xs text-gray-500">Max guests</Label>
                      <Input
                        type="number"
                        min={1}
                        value={tier.max_guests}
                        onChange={(e) => {
                          const next = [...(form.table_pricing_tiers || [])];
                          next[idx] = { ...next[idx], max_guests: e.target.value };
                          setForm((p) => ({ ...p, table_pricing_tiers: next }));
                        }}
                        className="mt-1 h-10 rounded-xl"
                        style={{ backgroundColor: 'var(--sec-bg-elevated)', borderColor: 'var(--sec-border)' }}
                      />
                    </div>
                    <div className="flex-1 min-w-[100px]">
                      <Label className="text-xs text-gray-500">Min spend (ZAR)</Label>
                      <Input
                        type="number"
                        min={0}
                        step={0.01}
                        value={tier.min_spend}
                        onChange={(e) => {
                          const next = [...(form.table_pricing_tiers || [])];
                          next[idx] = { ...next[idx], min_spend: e.target.value };
                          setForm((p) => ({ ...p, table_pricing_tiers: next }));
                        }}
                        className="mt-1 h-10 rounded-xl"
                        style={{ backgroundColor: 'var(--sec-bg-elevated)', borderColor: 'var(--sec-border)' }}
                      />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-10 text-red-400"
                      onClick={() =>
                        setForm((p) => ({
                          ...p,
                          table_pricing_tiers: (p.table_pricing_tiers || []).filter((_, i) => i !== idx),
                        }))
                      }
                    >
                      Remove
                    </Button>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <Label className="text-gray-400 text-sm">Description</Label>
              <Textarea
                value={form.description}
                onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                placeholder="Event details..."
                className="mt-1.5 rounded-xl resize-none"
                style={{ backgroundColor: 'var(--sec-bg-elevated)', borderColor: 'var(--sec-border)' }}
                rows={3}
              />
            </div>
            <div>
              <Label className="text-gray-400 text-sm">Cover Image URL</Label>
              <Input
                value={form.cover_image_url}
                onChange={e => setForm(p => ({ ...p, cover_image_url: e.target.value }))}
                placeholder="https://..."
                className="mt-1.5 h-11 rounded-xl"
                style={{ backgroundColor: 'var(--sec-bg-elevated)', borderColor: 'var(--sec-border)' }}
              />
            </div>
            <div>
              <Label className="text-gray-400 text-sm">Status</Label>
              <Select value={form.status} onValueChange={v => setForm(p => ({ ...p, status: v }))}>
                <SelectTrigger className="mt-1.5 h-11 rounded-xl" style={{ backgroundColor: 'var(--sec-bg-elevated)', borderColor: 'var(--sec-border)' }}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent style={{ backgroundColor: 'var(--sec-bg-card)', borderColor: 'var(--sec-border)' }} className="text-white">
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="published">Published</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-3 pt-2">
              <Button variant="outline" onClick={closeDialog} className="flex-1 h-11 rounded-xl" style={{ borderColor: 'var(--sec-border)' }}>
                Cancel
              </Button>
              <Button
                onClick={handleSave}
                disabled={saveMutation.isPending}
                className="flex-1 h-11 rounded-xl font-semibold"
                style={{ backgroundColor: 'var(--sec-accent)', color: '#000' }}
              >
                {saveMutation.isPending ? <Loader2 size={16} className="animate-spin mr-1.5" /> : null}
                {editingEvent ? 'Update' : 'Create'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <DialogContent className="text-white sm:max-w-[380px]" style={{ backgroundColor: 'var(--sec-bg-card)', borderColor: 'var(--sec-border)' }}>
          <DialogHeader>
            <DialogTitle>Delete Event</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-400 mt-1">Are you sure you want to delete this event? This action cannot be undone.</p>
          <div className="flex gap-3 mt-4">
            <Button variant="outline" onClick={() => setDeleteId(null)} className="flex-1 h-10 rounded-xl" style={{ borderColor: 'var(--sec-border)' }}>
              Cancel
            </Button>
            <Button
              onClick={() => deleteMutation.mutate(deleteId)}
              disabled={deleteMutation.isPending}
              className="flex-1 h-10 rounded-xl text-white font-semibold"
              style={{ backgroundColor: 'var(--sec-error)' }}
            >
              {deleteMutation.isPending ? <Loader2 size={16} className="animate-spin mr-1.5" /> : null}
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
