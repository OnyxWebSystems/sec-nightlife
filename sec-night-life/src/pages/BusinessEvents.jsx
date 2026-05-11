import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import * as authService from '@/services/authService';
import { dataService } from '@/services/dataService';
import { apiPut } from '@/api/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Calendar, Plus, Edit2, Trash2, Eye, Search, Loader2, KeyRound
} from 'lucide-react';
import { toast } from 'sonner';

function emptyHostingSection() {
  return { max_tables: '', tiers: [], host_table_fee_zar: '' };
}

function emptyHostingForm() {
  return { general: emptyHostingSection(), vip: emptyHostingSection() };
}

function hostingFromApi(hc) {
  if (!hc || typeof hc !== 'object') return emptyHostingForm();
  const mapSection = (s) => ({
    max_tables: s?.max_tables != null && s.max_tables !== '' ? String(s.max_tables) : '',
    host_table_fee_zar: s?.host_table_fee_zar != null && s.host_table_fee_zar !== '' ? String(s.host_table_fee_zar) : '',
    tiers: Array.isArray(s?.tiers) && s.tiers.length
      ? s.tiers.map((t) => ({
          tier_name: String(t.tier_name ?? t.name ?? ''),
          max_guests: String(t.max_guests ?? ''),
          min_spend: String(t.min_spend ?? ''),
          tier_table_slots: String(t.tier_table_slots ?? ''),
        }))
      : [],
  });
  return {
    general: mapSection(hc.general),
    vip: mapSection(hc.vip),
  };
}

function parseTierSlotsTotal(tiers = []) {
  return tiers.reduce((acc, t) => acc + (parseInt(String(t?.tier_table_slots || ''), 10) || 0), 0);
}

const EMPTY_EVENT = {
  title: '', description: '', date: '', city: '', location_address: '', location_city: '', location_suburb: '', location_province: '', status: 'draft',
  cover_image_url: '', ticket_tiers: [],
  start_time: '',
  has_entrance_fee: false,
  entrance_fee_amount: '',
  hosting_config: emptyHostingForm(),
};

export default function BusinessEvents() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [user, setUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState(null);
  const [form, setForm] = useState({ ...EMPTY_EVENT });
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [deleteId, setDeleteId] = useState(null);
  const [doorPinEvent, setDoorPinEvent] = useState(null);
  const [doorPinInput, setDoorPinInput] = useState('');
  const [doorPinSaving, setDoorPinSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try { setUser(await authService.getCurrentUser()); }
      catch { authService.redirectToLogin(); }
    })();
  }, []);

  useEffect(() => {
    if (!user?.email) return;
    dataService.User.filter({ created_by: user.email }).then((profiles) => {
      setUserProfile(profiles?.[0] || null);
    }).catch(() => {});
  }, [user?.email]);

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

  const openDoorPin = (evt) => {
    setDoorPinEvent(evt);
    setDoorPinInput('');
  };

  const saveDoorPin = async () => {
    if (!doorPinEvent?.id) return;
    const digits = doorPinInput.replace(/\D/g, '').slice(0, 8);
    if (digits.length < 4 || digits.length > 8) {
      toast.error('PIN must be 4–8 digits');
      return;
    }
    setDoorPinSaving(true);
    try {
      await apiPut(`/api/events/${doorPinEvent.id}/door-check-pin`, { pin: digits });
      toast.success('Door PIN saved');
      queryClient.invalidateQueries({ queryKey: ['biz-events'] });
      setDoorPinEvent(null);
    } catch (e) {
      toast.error(e?.message || 'Failed to save door PIN');
    } finally {
      setDoorPinSaving(false);
    }
  };

  const removeDoorPin = async () => {
    if (!doorPinEvent?.id) return;
    setDoorPinSaving(true);
    try {
      await apiPut(`/api/events/${doorPinEvent.id}/door-check-pin`, { pin: null });
      toast.success('Door PIN removed');
      queryClient.invalidateQueries({ queryKey: ['biz-events'] });
      setDoorPinEvent(null);
    } catch (e) {
      toast.error(e?.message || 'Failed to remove door PIN');
    } finally {
      setDoorPinSaving(false);
    }
  };

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
    setForm({ ...EMPTY_EVENT });
    setDialogOpen(true);
  };

  const openEdit = (evt) => {
    setEditingEvent(evt);
    setForm({
      title: evt.title || '',
      description: evt.description || '',
      date: evt.date || '',
      city: evt.city || '',
      location_address: evt.location_address || '',
      location_city: evt.location_city || evt.city || '',
      location_suburb: evt.location_suburb || '',
      location_province: evt.location_province || '',
      status: evt.status || 'draft',
      cover_image_url: evt.cover_image_url || '',
      ticket_tiers: evt.ticket_tiers || [],
      start_time: evt.start_time || '',
      has_entrance_fee: !!evt.has_entrance_fee,
      entrance_fee_amount: evt.entrance_fee_amount != null && evt.entrance_fee_amount !== ''
        ? String(evt.entrance_fee_amount)
        : '',
      hosting_config: hostingFromApi(evt.hosting_config),
    });
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setEditingEvent(null);
    setForm({ ...EMPTY_EVENT });
  };

  const handleSave = () => {
    if (!form.title || !form.date) {
      toast.error('Please fill in title and date');
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
      city: form.city?.trim() || undefined,
      location_address: form.location_address?.trim() || undefined,
      location_city: form.location_city?.trim() || undefined,
      location_suburb: form.location_suburb?.trim() || undefined,
      location_province: form.location_province?.trim() || undefined,
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

    const hostingPayload = {
      general: { max_tables: null, tiers: [], host_table_fee_zar: null },
      vip: { max_tables: null, tiers: [], host_table_fee_zar: null },
    };
    for (const cat of ['general', 'vip']) {
      const sec = form.hosting_config?.[cat];
      const maxT = String(sec?.max_tables || '').trim();
      if (maxT) {
        const n = parseInt(maxT, 10);
        if (Number.isNaN(n) || n < 1) {
          toast.error(`${cat === 'vip' ? 'VIP' : 'General'} max hosted tables must be a positive number`);
          return;
        }
        hostingPayload[cat].max_tables = n;
      }
      const hostFeeRaw = String(sec?.host_table_fee_zar ?? '').trim();
      if (hostFeeRaw) {
        const hostFee = parseFloat(hostFeeRaw.replace(',', '.'));
        if (Number.isNaN(hostFee) || hostFee < 0) {
          toast.error(`${cat === 'vip' ? 'VIP' : 'General'} host table fee must be 0 or more`);
          return;
        }
        hostingPayload[cat].host_table_fee_zar = hostFee;
      }
      const rawTiers = sec?.tiers || [];
      const hasPartialTier = rawTiers.some((t) => {
        const vals = [
          String(t?.tier_name || '').trim(),
          String(t?.max_guests || '').trim(),
          String(t?.min_spend ?? '').trim(),
          String(t?.tier_table_slots ?? '').trim(),
        ];
        const filled = vals.filter((v) => v !== '').length;
        return filled > 0 && filled < vals.length;
      });
      if (hasPartialTier) {
        toast.error(
          `${cat === 'vip' ? 'VIP' : 'General'} tiers must include all fields: name, max guests, min spend, and hosted tables.`,
        );
        return;
      }
      const tierRows = rawTiers.filter(
        (t) =>
          String(t?.tier_name || '').trim() &&
          String(t?.max_guests || '').trim() &&
          String(t?.min_spend ?? '').trim() !== '' &&
          String(t?.tier_table_slots ?? '').trim() !== ''
      );
      const parsedTiers = [];
      let totalTierSlots = 0;
      for (const t of tierRows) {
        const mg = parseInt(String(t.max_guests).trim(), 10);
        const ms = parseFloat(String(t.min_spend).replace(',', '.'));
        const slots = parseInt(String(t.tier_table_slots).trim(), 10);
        if (Number.isNaN(mg) || mg < 1 || Number.isNaN(ms) || ms < 0 || Number.isNaN(slots) || slots < 1) {
          toast.error(`Check ${cat === 'vip' ? 'VIP' : 'General'} pricing tiers (guests, min spend, and table slots)`);
          return;
        }
        const tierName = String(t.tier_name || '').trim();
        if (!tierName) {
          toast.error(`Each ${cat === 'vip' ? 'VIP' : 'General'} tier needs a name`);
          return;
        }
        parsedTiers.push({ tier_name: tierName, max_guests: mg, min_spend: ms, tier_table_slots: slots });
        totalTierSlots += slots;
      }
      if (parsedTiers.length > 0 && hostingPayload[cat].max_tables == null) {
        toast.error(`${cat === 'vip' ? 'VIP' : 'General'} max hosted tables is required when pricing tiers are configured`);
        return;
      }
      if (parsedTiers.length > 0 && totalTierSlots !== hostingPayload[cat].max_tables) {
        toast.error(
          `${cat === 'vip' ? 'VIP' : 'General'} tier table counts must add up to max hosted tables (${hostingPayload[cat].max_tables}). Current sum: ${totalTierSlots}.`,
        );
        return;
      }
      hostingPayload[cat].tiers = parsedTiers;
    }
    payload.hosting_config = hostingPayload;
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
      {!userProfile?.payment_setup_complete ? (
        <div className="rounded-xl p-3 mb-3" style={{ backgroundColor: 'var(--sec-bg-card)', border: '1px solid var(--sec-border)' }}>
          <p style={{ fontSize: 13, color: 'var(--sec-text-primary)' }}>
            Payout details missing. Your venue payouts can remain pending until setup is complete in
            {' '}<Link to={createPageUrl('Payments')} style={{ color: 'var(--sec-accent)', textDecoration: 'underline' }}>Settings &gt; Payment Methods</Link>.
          </p>
        </div>
      ) : null}

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
                  {' · '}{evt.location_city || evt.city}
                  {evt.door_pin_configured ? (
                    <span
                      className="sec-badge sec-badge-success ml-2 align-middle"
                      style={{ fontSize: 10, padding: '2px 6px', verticalAlign: 'middle' }}
                    >
                      Door PIN
                    </span>
                  ) : null}
                </div>
              </div>

              <span className={`sec-badge ${evt.status === 'published' ? 'sec-badge-success' : 'sec-badge-gold'}`}>
                {evt.status}
              </span>

              <div style={{ display: 'flex', gap: 4 }}>
                <button
                  onClick={() => openDoorPin(evt)}
                  style={{ padding: 8, borderRadius: 8, border: 'none', cursor: 'pointer', backgroundColor: 'transparent', color: 'var(--sec-text-muted)' }}
                  title="Door check PIN"
                >
                  <KeyRound size={16} />
                </button>
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
        <DialogContent
          className="text-white sm:max-w-[520px] flex flex-col max-h-[90vh] overflow-hidden p-0 gap-0"
          style={{ backgroundColor: 'var(--sec-bg-card)', borderColor: 'var(--sec-border)' }}
        >
          <DialogHeader className="px-6 pt-6 pb-3 shrink-0 border-b border-[var(--sec-border)]">
            <DialogTitle>{editingEvent ? 'Edit Event' : 'Create Event'}</DialogTitle>
          </DialogHeader>
          <div className="overflow-y-auto overscroll-contain px-6 py-4 flex-1 min-h-0">
          <div className="space-y-4">
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
                <Label className="text-gray-400 text-sm">City (legacy optional)</Label>
                <Input
                  value={form.city}
                  onChange={e => setForm(p => ({ ...p, city: e.target.value }))}
                  placeholder="Optional: fallback uses venue city"
                  className="mt-1.5 h-11 rounded-xl"
                style={{ backgroundColor: 'var(--sec-bg-elevated)', borderColor: 'var(--sec-border)' }}
                />
              </div>
            </div>
            <div className="space-y-3 rounded-xl border p-4" style={{ borderColor: 'var(--sec-border)', backgroundColor: 'var(--sec-bg-elevated)' }}>
              <h3 className="text-sm font-semibold" style={{ color: 'var(--sec-text-primary)' }}>
                Event location override (optional)
              </h3>
              <p className="text-xs text-gray-500">
                Leave any field empty to use this venue's location for that field.
              </p>
              <div>
                <Label className="text-gray-400 text-sm">Address</Label>
                <Input
                  value={form.location_address}
                  onChange={e => setForm(p => ({ ...p, location_address: e.target.value }))}
                  placeholder="Optional street address override"
                  className="mt-1.5 h-11 rounded-xl"
                  style={{ backgroundColor: 'var(--sec-bg-card)', borderColor: 'var(--sec-border)' }}
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <Label className="text-gray-400 text-sm">City</Label>
                  <Input
                    value={form.location_city}
                    onChange={e => setForm(p => ({ ...p, location_city: e.target.value }))}
                    placeholder="Optional city override"
                    className="mt-1.5 h-11 rounded-xl"
                    style={{ backgroundColor: 'var(--sec-bg-card)', borderColor: 'var(--sec-border)' }}
                  />
                </div>
                <div>
                  <Label className="text-gray-400 text-sm">Suburb</Label>
                  <Input
                    value={form.location_suburb}
                    onChange={e => setForm(p => ({ ...p, location_suburb: e.target.value }))}
                    placeholder="Optional suburb override"
                    className="mt-1.5 h-11 rounded-xl"
                    style={{ backgroundColor: 'var(--sec-bg-card)', borderColor: 'var(--sec-border)' }}
                  />
                </div>
                <div>
                  <Label className="text-gray-400 text-sm">Province</Label>
                  <Input
                    value={form.location_province}
                    onChange={e => setForm(p => ({ ...p, location_province: e.target.value }))}
                    placeholder="Optional province override"
                    className="mt-1.5 h-11 rounded-xl"
                    style={{ backgroundColor: 'var(--sec-bg-card)', borderColor: 'var(--sec-border)' }}
                  />
                </div>
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
            {(['general', 'vip']).map((cat) => {
              const label = cat === 'vip' ? 'VIP' : 'General';
              const sec = form.hosting_config?.[cat] || emptyHostingSection();
              const tiers = sec.tiers || [];
              return (
                <div
                  key={cat}
                  className="space-y-3 rounded-xl border p-4"
                  style={{ borderColor: 'var(--sec-border)', backgroundColor: 'var(--sec-bg-elevated)' }}
                >
                  <h3 className="text-sm font-semibold" style={{ color: 'var(--sec-text-primary)' }}>
                    {label} hosted tables
                  </h3>
                  <div>
                    <Label className="text-gray-400 text-sm">Max hosted tables (optional)</Label>
                    <Input
                      type="number"
                      min={1}
                      value={sec.max_tables}
                      onChange={(e) =>
                        setForm((p) => ({
                          ...p,
                          hosting_config: {
                            ...p.hosting_config,
                            [cat]: { ...p.hosting_config[cat], max_tables: e.target.value },
                          },
                        }))
                      }
                      placeholder="No limit if empty"
                      className="mt-1.5 h-11 rounded-xl max-w-[200px]"
                      style={{ backgroundColor: 'var(--sec-bg-card)', borderColor: 'var(--sec-border)' }}
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Caps how many {label.toLowerCase()} tables can be hosted for this event.
                    </p>
                  </div>
                  <div>
                    <Label className="text-gray-400 text-sm">Host table fee (ZAR, optional)</Label>
                    <Input
                      type="number"
                      min={0}
                      value={sec.host_table_fee_zar}
                      onChange={(e) =>
                        setForm((p) => ({
                          ...p,
                          hosting_config: {
                            ...p.hosting_config,
                            [cat]: { ...p.hosting_config[cat], host_table_fee_zar: e.target.value },
                          },
                        }))
                      }
                      placeholder="0 for no host fee"
                      className="mt-1.5 h-11 rounded-xl max-w-[200px]"
                      style={{ backgroundColor: 'var(--sec-bg-card)', borderColor: 'var(--sec-border)' }}
                    />
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
                            hosting_config: {
                              ...p.hosting_config,
                              [cat]: {
                                ...p.hosting_config[cat],
                                tiers: [
                                  ...(p.hosting_config[cat].tiers || []),
                                  { tier_name: '', max_guests: '', min_spend: '', tier_table_slots: '' },
                                ],
                              },
                            },
                          }))
                        }
                      >
                        <Plus size={14} className="mr-1" /> Add tier
                      </Button>
                    </div>
                    <p
                      className={`text-xs mb-2 ${
                        sec.max_tables && parseTierSlotsTotal(tiers) > (parseInt(String(sec.max_tables), 10) || 0)
                          ? 'text-red-400'
                          : 'text-gray-500'
                      }`}
                    >
                      Allocated tier tables:{' '}
                      {parseTierSlotsTotal(tiers)}
                      {' / '}
                      {(parseInt(String(sec.max_tables || ''), 10) || 0) || '-'}
                    </p>
                    <p className="text-xs text-gray-500 mb-2">Guests per table and minimum spend (ZAR).</p>
                    <div className="space-y-2">
                      {tiers.map((tier, idx) => (
                        <div key={idx} className="flex gap-2 items-end flex-wrap">
                          <div className="flex-1 min-w-[120px]">
                            <Label className="text-xs text-gray-500">Tier name</Label>
                            <Input
                              value={tier.tier_name || ''}
                              onChange={(e) => {
                                const next = [...(form.hosting_config[cat].tiers || [])];
                                next[idx] = { ...next[idx], tier_name: e.target.value };
                                setForm((p) => ({
                                  ...p,
                                  hosting_config: {
                                    ...p.hosting_config,
                                    [cat]: { ...p.hosting_config[cat], tiers: next },
                                  },
                                }));
                              }}
                              className="mt-1 h-10 rounded-xl"
                              style={{ backgroundColor: 'var(--sec-bg-card)', borderColor: 'var(--sec-border)' }}
                              placeholder={`e.g. ${label} Bronze`}
                            />
                          </div>
                          <div className="flex-1 min-w-[100px]">
                            <Label className="text-xs text-gray-500">Max guests</Label>
                            <Input
                              type="number"
                              min={1}
                              value={tier.max_guests}
                              onChange={(e) => {
                                const next = [...(form.hosting_config[cat].tiers || [])];
                                next[idx] = { ...next[idx], max_guests: e.target.value };
                                setForm((p) => ({
                                  ...p,
                                  hosting_config: {
                                    ...p.hosting_config,
                                    [cat]: { ...p.hosting_config[cat], tiers: next },
                                  },
                                }));
                              }}
                              className="mt-1 h-10 rounded-xl"
                              style={{ backgroundColor: 'var(--sec-bg-card)', borderColor: 'var(--sec-border)' }}
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
                                const next = [...(form.hosting_config[cat].tiers || [])];
                                next[idx] = { ...next[idx], min_spend: e.target.value };
                                setForm((p) => ({
                                  ...p,
                                  hosting_config: {
                                    ...p.hosting_config,
                                    [cat]: { ...p.hosting_config[cat], tiers: next },
                                  },
                                }));
                              }}
                              className="mt-1 h-10 rounded-xl"
                              style={{ backgroundColor: 'var(--sec-bg-card)', borderColor: 'var(--sec-border)' }}
                            />
                          </div>
                          <div className="flex-1 min-w-[120px]">
                            <Label className="text-xs text-gray-500">Hosted tables (tier)</Label>
                            <Input
                              type="number"
                              min={1}
                              value={tier.tier_table_slots || ''}
                              onChange={(e) => {
                                const next = [...(form.hosting_config[cat].tiers || [])];
                                const raw = e.target.value;
                                const nextSlots = parseInt(String(raw || ''), 10) || 0;
                                const maxTables = parseInt(String(form.hosting_config?.[cat]?.max_tables || ''), 10) || 0;
                                const usedByOthers = next.reduce(
                                  (acc, row, rowIdx) =>
                                    rowIdx === idx ? acc : acc + (parseInt(String(row?.tier_table_slots || ''), 10) || 0),
                                  0,
                                );
                                if (maxTables > 0 && nextSlots + usedByOthers > maxTables) {
                                  toast.error(
                                    `${label} tier allocations cannot exceed ${maxTables} total hosted tables for this category.`,
                                  );
                                  return;
                                }
                                next[idx] = { ...next[idx], tier_table_slots: raw };
                                setForm((p) => ({
                                  ...p,
                                  hosting_config: {
                                    ...p.hosting_config,
                                    [cat]: { ...p.hosting_config[cat], tiers: next },
                                  },
                                }));
                              }}
                              className="mt-1 h-10 rounded-xl"
                              style={{ backgroundColor: 'var(--sec-bg-card)', borderColor: 'var(--sec-border)' }}
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
                                hosting_config: {
                                  ...p.hosting_config,
                                  [cat]: {
                                    ...p.hosting_config[cat],
                                    tiers: (p.hosting_config[cat].tiers || []).filter((_, i) => i !== idx),
                                  },
                                },
                              }))
                            }
                          >
                            Remove
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
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
            <div className="flex gap-3 pt-2 pb-1">
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
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!doorPinEvent}
        onOpenChange={(open) => {
          if (!open) {
            setDoorPinEvent(null);
            setDoorPinInput('');
          }
        }}
      >
        <DialogContent className="text-white sm:max-w-[400px]" style={{ backgroundColor: 'var(--sec-bg-card)', borderColor: 'var(--sec-border)' }}>
          <DialogHeader>
            <DialogTitle>Door check PIN</DialogTitle>
          </DialogHeader>
          {doorPinEvent && (
            <>
              <p className="text-sm text-gray-400">
                Optional 4–8 digit PIN for <span className="text-gray-200 font-medium">{doorPinEvent.title}</span>.
                Staff at the door enter it when they record entry from the ticket verify page.
              </p>
              <p className="text-xs text-gray-500">
                Status:{' '}
                {doorPinEvent.door_pin_configured ? (
                  <span className="text-emerald-400 font-medium">PIN is set</span>
                ) : (
                  <span>No PIN (any authorised staff can admit)</span>
                )}
              </p>
              <div>
                <Label className="text-gray-400 text-sm">New PIN (digits only)</Label>
                <Input
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="4–8 digits"
                  value={doorPinInput}
                  onChange={(e) => setDoorPinInput(e.target.value.replace(/\D/g, '').slice(0, 8))}
                  className="mt-1.5 h-11 rounded-xl"
                  style={{ backgroundColor: 'var(--sec-bg-elevated)', borderColor: 'var(--sec-border)' }}
                />
              </div>
              <DialogFooter className="flex-col sm:flex-row gap-2 sm:justify-between sm:space-x-0">
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-xl w-full sm:w-auto"
                  style={{ borderColor: 'var(--sec-border)' }}
                  onClick={() => {
                    setDoorPinEvent(null);
                    setDoorPinInput('');
                  }}
                  disabled={doorPinSaving}
                >
                  Close
                </Button>
                <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto sm:ml-auto">
                  {doorPinEvent.door_pin_configured ? (
                    <Button
                      type="button"
                      variant="outline"
                      className="rounded-xl text-red-400 border-red-900/50 hover:bg-red-950/30"
                      onClick={removeDoorPin}
                      disabled={doorPinSaving}
                    >
                      {doorPinSaving ? <Loader2 size={16} className="animate-spin" /> : 'Remove PIN'}
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    className="rounded-xl font-semibold"
                    style={{ backgroundColor: 'var(--sec-accent)', color: '#000' }}
                    onClick={saveDoorPin}
                    disabled={doorPinSaving || doorPinInput.replace(/\D/g, '').length < 4}
                  >
                    {doorPinSaving ? <Loader2 size={16} className="animate-spin mr-1.5" /> : null}
                    Save PIN
                  </Button>
                </div>
              </DialogFooter>
            </>
          )}
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
