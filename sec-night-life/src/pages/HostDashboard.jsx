import React, { useEffect, useState, useMemo } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { createPageUrl, getPublicAppOrigin } from '@/utils';
import * as authService from '@/services/authService';
import { dataService } from '@/services/dataService';
import { apiGet, apiPost, apiDelete, apiPatch } from '@/api/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { format, parseISO } from 'date-fns';
import { toast } from 'sonner';
import RefundPolicyNote from '@/components/legal/RefundPolicyNote';
import { Plus, Loader2, MessageCircle, Copy, UserPlus } from 'lucide-react';
import SecLogo from '@/components/ui/SecLogo';
import GoogleAddressInput from '@/components/GoogleAddressInput';
import { Input } from '@/components/ui/input';
import { launchPaystackInline, verifyPaystackReference } from '@/lib/paystackInline';
import MenuPicker, { menuSelectionTotal, menuSelectionToPayload } from '@/components/menu/MenuPicker';

function eventStartTimeForInput(ev) {
  if (!ev) return undefined;
  const raw = ev.startTime ?? ev.start_time;
  if (!raw) return undefined;
  const s = String(raw).trim();
  const m = s.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return undefined;
  return `${m[1].padStart(2, '0')}:${m[2]}`;
}

function eventStartTimeLabel(ev) {
  const raw = ev?.startTime ?? ev?.start_time;
  if (!raw) return null;
  return String(raw).slice(0, 5);
}

function isTimeEarlierThan(a, b) {
  if (!a || !b) return false;
  const am = a.match(/^(\d{1,2}):(\d{2})$/);
  const bm = b.match(/^(\d{1,2}):(\d{2})$/);
  if (!am || !bm) return false;
  const aMin = Number(am[1]) * 60 + Number(am[2]);
  const bMin = Number(bm[1]) * 60 + Number(bm[2]);
  return aMin < bMin;
}

const STATUS_BADGE = {
  DRAFT: { label: 'Draft', bg: 'var(--sec-bg-hover)', color: 'var(--sec-text-muted)' },
  PENDING_PAYMENT: { label: 'Pending payment', bg: 'var(--sec-warning-muted)', color: 'var(--sec-text-primary)' },
  PUBLISHED: { label: 'Live', bg: 'var(--sec-success-muted)', color: 'var(--sec-text-primary)' },
  CANCELLED: { label: 'Cancelled', bg: 'var(--sec-error-muted)', color: 'var(--sec-error)' },
  COMPLETED: { label: 'Completed', bg: 'var(--sec-bg-card)', color: 'var(--sec-accent)' },
};

/** Hosted table row uses HostedTableStatus (DRAFT / ACTIVE / FULL). */
const TABLE_HOST_STATUS_BADGE = {
  DRAFT: { label: 'Awaiting listing payment', bg: 'var(--sec-warning-muted)', color: 'var(--sec-text-primary)' },
  ACTIVE: { label: 'Live', bg: 'var(--sec-success-muted)', color: 'var(--sec-text-primary)' },
  FULL: { label: 'Full', bg: 'var(--sec-bg-hover)', color: 'var(--sec-text-muted)' },
  CLOSED: { label: 'Closed', bg: 'var(--sec-bg-hover)', color: 'var(--sec-text-muted)' },
};

export default function HostDashboard() {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [user, setUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [tab, setTab] = useState('parties');
  const [showPartyModal, setShowPartyModal] = useState(false);
  const [showTableModal, setShowTableModal] = useState(false);
  const [partyStep, setPartyStep] = useState(1);
  const [partyForm, setPartyForm] = useState({
    title: '',
    description: '',
    location: '',
    latitude: null,
    longitude: null,
    startTime: '',
    endTime: '',
    guestQuantity: 20,
    hasEntranceFee: false,
    entranceFeeAmount: '',
    entranceFeeNote: '',
    freeEntryGroup: '',
    guestGenderPreference: 'ANY',
  });
  const [tableForm, setTableForm] = useState({
    tableType: 'IN_APP_EVENT',
    tableName: '',
    tableDescription: '',
    eventType: 'CLUB_TABLE',
    eventId: '',
    venueName: '',
    venueAddress: '',
    eventDate: '',
    eventTime: '21:00',
    guestQuantity: 4,
    hostingCategory: 'GENERAL',
    hostingTierIndex: 0,
    tierMaxGuests: null,
    hasJoiningFee: false,
    joiningFee: '',
    photo: '',
    photoPublicId: '',
    drinkPreferences: '',
    desiredCompany: '',
    isPublic: true,
  });
  const [saving, setSaving] = useState(false);
  const [pendingTableId, setPendingTableId] = useState(null);
  const [eventSearch, setEventSearch] = useState('');
  const [inviteOpenTableId, setInviteOpenTableId] = useState(null);
  const [inviteSearch, setInviteSearch] = useState('');
  const [tableMenuSelected, setTableMenuSelected] = useState({});

  useEffect(() => {
    authService.getCurrentUser().then(async (u) => {
      setUser(u);
      const profiles = await dataService.User.filter({ created_by: u.email });
      setUserProfile(profiles?.[0] || null);
    }).catch(() => authService.redirectToLogin());
  }, []);

  useEffect(() => {
    const c = searchParams.get('create');
    const preEventId = searchParams.get('event');
    if (c === 'party') {
      setShowPartyModal(true);
      setTab('parties');
    }
    if (c === 'table') {
      setShowTableModal(true);
      setTab('tables');
      if (preEventId) {
        setTableForm((f) => ({ ...f, tableType: 'IN_APP_EVENT', eventId: preEventId }));
      }
    }
    if (c === 'invite') {
      setTab('tables');
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    if (!inviteOpenTableId) setInviteSearch('');
  }, [inviteOpenTableId]);

  const inviteUserSearchQ = useQuery({
    queryKey: ['host-invite-user-search', inviteSearch.trim()],
    queryFn: () => apiGet(`/api/host/invite-user-search?q=${encodeURIComponent(inviteSearch.trim())}`),
    enabled: Boolean(inviteOpenTableId && inviteSearch.trim().length >= 2),
    staleTime: 20_000,
  });

  const closePartyModal = () => {
    setShowPartyModal(false);
    setPartyStep(1);
    setSearchParams({}, { replace: true });
  };

  const { data: parties = [], isLoading: loadP } = useQuery({
    queryKey: ['host-parties', user?.id],
    queryFn: () => apiGet('/api/host/parties'),
    enabled: !!user?.id,
  });

  const { data: tables = [], isLoading: loadT } = useQuery({
    queryKey: ['host-tables', user?.id],
    queryFn: () => apiGet('/api/host/tables'),
    enabled: !!user?.id,
  });

  const { data: jobs = [], isLoading: loadJ } = useQuery({
    queryKey: ['host-jobs', user?.id],
    queryFn: () => apiGet('/api/host/jobs'),
    enabled: !!user?.id,
  });

  const { data: activity } = useQuery({
    queryKey: ['host-activity', user?.id],
    queryFn: () => apiGet('/api/host/activity/summary'),
    enabled: !!user?.id,
  });

  const { data: publicEvents = [] } = useQuery({
    queryKey: ['events-published'],
    queryFn: () => dataService.Event.filter({ status: 'published' }),
    enabled: showTableModal && tableForm.tableType === 'IN_APP_EVENT',
  });

  const { data: selectedEventDetail, isFetching: selectedEventDetailLoading } = useQuery({
    queryKey: ['event-detail-host', tableForm.eventId],
    queryFn: () => apiGet(`/api/events/${tableForm.eventId}`),
    enabled: Boolean(tableForm.eventId && showTableModal && tableForm.tableType === 'IN_APP_EVENT'),
  });

  const selectedEvent = useMemo(() => {
    if (!tableForm.eventId) return null;
    const fromList = publicEvents.find((e) => e.id === tableForm.eventId);
    if (selectedEventDetail?.id === tableForm.eventId) {
      const merged = { ...fromList, ...selectedEventDetail };
      const mergedCfg = merged?.hosting_config || merged?.hostingConfig;
      const listCfg = fromList?.hosting_config || fromList?.hostingConfig;
      const mergedGeneral = Array.isArray(mergedCfg?.general?.tiers) ? mergedCfg.general.tiers.length : 0;
      const mergedVip = Array.isArray(mergedCfg?.vip?.tiers) ? mergedCfg.vip.tiers.length : 0;
      const listGeneral = Array.isArray(listCfg?.general?.tiers) ? listCfg.general.tiers.length : 0;
      const listVip = Array.isArray(listCfg?.vip?.tiers) ? listCfg.vip.tiers.length : 0;
      if (mergedGeneral + mergedVip === 0 && listGeneral + listVip > 0) {
        return { ...merged, hosting_config: listCfg };
      }
      return merged;
    }
    return fromList ?? null;
  }, [publicEvents, tableForm.eventId, selectedEventDetail]);
  const selectedVenueId = selectedEvent?.venue_id || selectedEvent?.venueId || selectedEvent?.venue?.id;

  const { data: venueMenuItems = [] } = useQuery({
    queryKey: ['venue-menu-public', selectedVenueId],
    queryFn: () => apiGet(`/api/business/venues/${selectedVenueId}/menu-items/public`),
    enabled: Boolean(selectedVenueId && showTableModal),
  });

  const selectedHostingTier = useMemo(() => {
    const cfg = selectedEvent?.hosting_config || selectedEvent?.hostingConfig;
    const categoryKey = tableForm.hostingCategory === 'VIP' ? 'vip' : 'general';
    const tiers = Array.isArray(cfg?.[categoryKey]?.tiers) ? cfg[categoryKey].tiers : [];
    const idx = Number(tableForm.hostingTierIndex || 0);
    if (!tiers[idx]) return null;
    return { ...tiers[idx], index: idx };
  }, [selectedEvent, tableForm.hostingCategory, tableForm.hostingTierIndex]);

  const tierIncludedDisplay = useMemo(() => {
    const raw = selectedHostingTier?.included_items;
    if (!Array.isArray(raw) || !venueMenuItems.length) return [];
    const map = new Map(venueMenuItems.map((m) => [m.id, m]));
    return raw.map((inc) => {
      const id = inc.menu_item_id || inc.menuItemId;
      const row = id ? map.get(id) : null;
      const qty = Math.max(1, Number(inc.quantity) || 1);
      return {
        name: row?.name || inc.name || 'Included',
        quantity: qty,
        price: row ? Number(row.price) : Number(inc.price || 0),
        image_url: row?.image_url || null,
      };
    });
  }, [selectedHostingTier, venueMenuItems]);

  const hostingTierOptions = useMemo(() => {
    const cfg = selectedEvent?.hosting_config || selectedEvent?.hostingConfig;
    const key = tableForm.hostingCategory === 'VIP' ? 'vip' : 'general';
    const tiers = Array.isArray(cfg?.[key]?.tiers) ? cfg[key].tiers : [];
    return tiers.map((t, i) => ({
      value: i,
      name: (t?.tier_name || t?.name || `Tier ${i + 1}`).toString(),
      maxGuests: t?.max_guests,
      minSpend: t?.min_spend,
      tableSlots: t?.tier_table_slots,
    }));
  }, [selectedEvent, tableForm.hostingCategory]);

  const hasEventStartTime = Boolean(eventStartTimeForInput(selectedEvent));
  const inAppHasTiersForCategory = hostingTierOptions.length > 0;
  const canSubmitInAppTable =
    Boolean(tableForm.eventId) &&
    inAppHasTiersForCategory &&
    hasEventStartTime &&
    !selectedEventDetailLoading;

  const tableGuestMax = useMemo(() => {
    if (tableForm.tableType === 'EXTERNAL_VENUE') return 20;
    const cap = selectedHostingTier?.max_guests != null ? Number(selectedHostingTier.max_guests) : null;
    if (cap != null && Number.isFinite(cap)) return Math.min(500, cap);
    return 500;
  }, [tableForm.tableType, selectedHostingTier?.max_guests]);

  /** Mirrors server listing total: door + host table fee + tier min spend (ZAR). */
  const inAppListingBreakdown = useMemo(() => {
    if (tableForm.tableType !== 'IN_APP_EVENT' || !selectedEvent) return null;
    const ev = selectedEvent;
    const hasEntrance = Boolean(ev.hasEntranceFee ?? ev.has_entrance_fee);
    const entranceAmt = Number(ev.entranceFeeAmount ?? ev.entrance_fee_amount ?? 0);
    const entrance = hasEntrance && Number.isFinite(entranceAmt) && entranceAmt > 0 ? entranceAmt : 0;
    const cfg = ev.hosting_config || ev.hostingConfig || {};
    const cat = tableForm.hostingCategory === 'VIP' ? 'vip' : 'general';
    const hf = Number(cfg[cat]?.host_table_fee_zar ?? 0);
    const hostFee = Number.isFinite(hf) && hf > 0 ? hf : 0;
    const msRaw = selectedHostingTier?.min_spend ?? selectedHostingTier?.minSpend;
    const minSpend =
      msRaw != null && msRaw !== '' && Number.isFinite(Number(msRaw)) ? Math.max(0, Number(msRaw)) : 0;
    const menuCart = menuSelectionTotal(venueMenuItems, tableMenuSelected, tierIncludedDisplay);
    const total = entrance + hostFee + menuCart;
    return { entrance, hostFee, minSpend, menuCart, total };
  }, [tableForm.tableType, tableForm.hostingCategory, selectedEvent, selectedHostingTier, tableMenuSelected, venueMenuItems, tierIncludedDisplay]);

  useEffect(() => {
    if (tableForm.tableType !== 'IN_APP_EVENT') return;
    const cap = selectedHostingTier?.max_guests != null ? Number(selectedHostingTier.max_guests) : null;
    if (cap == null || !Number.isFinite(cap)) return;
    if (tableForm.guestQuantity > cap) {
      setTableForm((f) => ({ ...f, guestQuantity: cap }));
    }
  }, [tableForm.tableType, tableForm.guestQuantity, selectedHostingTier?.max_guests]);

  const filteredPublicEvents = useMemo(() => {
    const q = eventSearch.trim().toLowerCase();
    if (!q) return publicEvents;
    return publicEvents.filter(
      (e) =>
        (e.title || '').toLowerCase().includes(q) ||
        (e.city || '').toLowerCase().includes(q),
    );
  }, [publicEvents, eventSearch]);

  const { data: pendingRequests = [], refetch: refetchPending, isFetching: pendingLoading } = useQuery({
    queryKey: ['host-table-pending', pendingTableId],
    queryFn: () => apiGet(`/api/host/tables/${pendingTableId}/pending-requests`),
    enabled: !!pendingTableId,
  });

  const submitParty = async (thenPublish) => {
    setSaving(true);
    try {
      const start = new Date(partyForm.startTime);
      const end = new Date(partyForm.endTime);
      const payload = {
        title: partyForm.title,
        description: partyForm.description,
        location: partyForm.location,
        latitude: partyForm.latitude,
        longitude: partyForm.longitude,
        startTime: start.toISOString(),
        endTime: end.toISOString(),
        guestQuantity: partyForm.guestQuantity,
        hasEntranceFee: partyForm.hasEntranceFee,
        entranceFeeAmount: partyForm.hasEntranceFee ? parseFloat(partyForm.entranceFeeAmount) : null,
        entranceFeeNote: partyForm.entranceFeeNote || null,
        freeEntryGroup: partyForm.freeEntryGroup || null,
        guestGenderPreference: partyForm.guestGenderPreference,
      };
      const created = await apiPost('/api/host/parties', payload);
      queryClient.invalidateQueries(['host-parties']);
      toast.success('House party saved');
      closePartyModal();
      if (thenPublish && created?.id) {
        const pay = await apiPost(`/api/host/parties/${created.id}/publish`, {});
        if (pay?.reference && pay?.access_code) {
          launchPaystackInline({
            email: user?.email,
            amount: 200,
            reference: pay.reference,
            accessCode: pay.access_code,
            onSuccess: async (payload) => {
              await verifyPaystackReference(payload?.reference || pay.reference);
              queryClient.invalidateQueries(['host-parties']);
              toast.success('Party listing payment received.');
            },
            onCancel: () => {
              toast.message('Checkout closed', {
                description: 'Your party stays unpublished until you complete the listing payment.',
              });
              queryClient.invalidateQueries(['host-parties']);
            },
          });
        }
      }
    } catch (e) {
      toast.error(e?.message || 'Could not create party');
    } finally {
      setSaving(false);
    }
  };

  const submitTable = async () => {
    setSaving(true);
    try {
      if (tableForm.tableType === 'IN_APP_EVENT') {
        if (!tableForm.eventId) {
          toast.error('Select an event');
          setSaving(false);
          return;
        }
        if (selectedEventDetailLoading) {
          toast.error('Loading event details… try again in a moment.');
          setSaving(false);
          return;
        }
        if (!inAppHasTiersForCategory) {
          toast.error(
            'This event has no table pricing tiers for the selected category. Ask the venue to add tiers in event setup.',
          );
          setSaving(false);
          return;
        }
        if (!hasEventStartTime) {
          toast.error(
            'This event has no start time. Ask the venue to set an event start time before you can host a table.',
          );
          setSaving(false);
          return;
        }
        if (!selectedEvent?.date) {
          toast.error('Event date missing — pick another event or try again.');
          setSaving(false);
          return;
        }
        const minT = eventStartTimeForInput(selectedEvent);
        if (minT && tableForm.eventTime && tableForm.eventTime < minT) {
          toast.error('Table time cannot be before the event start time');
          setSaving(false);
          return;
        }
        if (selectedHostingTier?.max_guests && Number(tableForm.guestQuantity) > Number(selectedHostingTier.max_guests)) {
          toast.error(`Guest quantity cannot exceed selected tier max (${selectedHostingTier.max_guests}).`);
          setSaving(false);
          return;
        }
        const minSpendReq = inAppListingBreakdown?.minSpend ?? 0;
        const menuCart = inAppListingBreakdown?.menuCart ?? 0;
        if (minSpendReq > 0 && menuCart + 0.01 < minSpendReq) {
          toast.error(`Select menu items totaling at least R${minSpendReq} for this tier.`);
          setSaving(false);
          return;
        }
        const menuPayload = menuSelectionToPayload(venueMenuItems, tableMenuSelected);
        const created = await apiPost('/api/host/tables', {
          tableType: 'IN_APP_EVENT',
          tableName: tableForm.tableName,
          tableDescription: tableForm.tableDescription || null,
          eventType: tableForm.eventType,
          eventId: tableForm.eventId,
          eventDate: new Date(`${selectedEvent.date}T12:00:00`).toISOString(),
          eventTime: tableForm.eventTime,
          guestQuantity: tableForm.guestQuantity,
          hostingCategory: tableForm.hostingCategory,
          hostingTierIndex: Number(tableForm.hostingTierIndex || 0),
          hasJoiningFee: tableForm.hasJoiningFee,
          joiningFee: tableForm.hasJoiningFee ? Number(tableForm.joiningFee) : null,
          photo: tableForm.photo || null,
          photoPublicId: tableForm.photoPublicId || null,
          drinkPreferences: tableForm.drinkPreferences || null,
          desiredCompany: tableForm.desiredCompany || null,
          isPublic: tableForm.isPublic,
          ...(menuPayload.length ? { selectedMenuItems: menuPayload.map((m) => ({ menuItemId: m.menuItemId, quantity: m.quantity })) } : {}),
        });
        if (created?.payment?.reference && created?.payment?.access_code) {
          launchPaystackInline({
            email: user?.email,
            amount: Number(created.payment.amount_zar ?? inAppListingBreakdown?.total ?? 0),
            reference: created.payment.reference,
            accessCode: created.payment.access_code,
            onSuccess: async (payload) => {
              await verifyPaystackReference(payload?.reference || created.payment.reference);
              queryClient.invalidateQueries(['host-tables']);
              toast.success('Payment received — your table is live.');
              setShowTableModal(false);
              setSearchParams({}, { replace: true });
            },
            onCancel: () => {
              toast.message('Checkout closed', {
                description: 'Your table stays in draft until payment succeeds. You can retry from your tables list.',
              });
              queryClient.invalidateQueries(['host-tables']);
            },
          });
          return;
        }
      } else {
        if (!tableForm.venueName || !tableForm.eventDate) {
          toast.error('Venue name and date required');
          setSaving(false);
          return;
        }
        if (!tableForm.venueAddress?.trim()) {
          toast.error('Enter the venue address so guests know where to meet');
          setSaving(false);
          return;
        }
        const created = await apiPost('/api/host/tables', {
          tableType: 'EXTERNAL_VENUE',
          tableName: tableForm.tableName,
          tableDescription: tableForm.tableDescription || null,
          eventType: tableForm.eventType,
          venueName: tableForm.venueName,
          venueAddress: tableForm.venueAddress.trim(),
          eventDate: new Date(tableForm.eventDate).toISOString(),
          eventTime: tableForm.eventTime,
          guestQuantity: tableForm.guestQuantity,
          hasJoiningFee: tableForm.hasJoiningFee,
          joiningFee: tableForm.hasJoiningFee ? Number(tableForm.joiningFee) : null,
          photo: tableForm.photo || null,
          photoPublicId: tableForm.photoPublicId || null,
          drinkPreferences: tableForm.drinkPreferences || null,
          desiredCompany: tableForm.desiredCompany || null,
          isPublic: tableForm.isPublic,
        });
        if (created?.payment?.reference && created?.payment?.access_code) {
          launchPaystackInline({
            email: user?.email,
            amount: 200,
            reference: created.payment.reference,
            accessCode: created.payment.access_code,
            onSuccess: async (payload) => {
              await verifyPaystackReference(payload?.reference || created.payment.reference);
              queryClient.invalidateQueries(['host-tables']);
              toast.success('Listing payment received — your external table is live.');
              setShowTableModal(false);
              setSearchParams({}, { replace: true });
            },
            onCancel: () => {
              toast.message('Checkout closed', {
                description: 'Your external table stays in draft until you complete the listing payment.',
              });
              queryClient.invalidateQueries(['host-tables']);
            },
          });
          return;
        }
      }
      queryClient.invalidateQueries(['host-tables']);
      toast.success('Table listed');
      setShowTableModal(false);
      setSearchParams({}, { replace: true });
    } catch (e) {
      toast.error(e?.message || 'Could not create table');
    } finally {
      setSaving(false);
    }
  };

  const publishParty = async (id) => {
    try {
      const pay = await apiPost(`/api/host/parties/${id}/publish`, {});
      if (pay?.reference && pay?.access_code) {
        launchPaystackInline({
          email: user?.email,
          amount: 200,
          reference: pay.reference,
          accessCode: pay.access_code,
          onSuccess: async (payload) => {
            await verifyPaystackReference(payload?.reference || pay.reference);
            queryClient.invalidateQueries(['host-parties']);
            toast.success('Party listing payment received.');
          },
          onCancel: () => {
            toast.message('Checkout closed', {
              description: 'Your party stays unpublished until you complete the listing payment.',
            });
            queryClient.invalidateQueries(['host-parties']);
          },
        });
      }
    } catch (e) {
      toast.error(e?.message || 'Payment failed to start');
    }
  };

  const boostParty = async (id) => {
    try {
      const pay = await apiPost(`/api/host/parties/${id}/boost`, {});
      if (pay?.reference && pay?.access_code) {
        await launchPaystackInline({
          email: user?.email,
          amount: 200,
          reference: pay.reference,
          accessCode: pay.access_code,
          onSuccess: async (payload) => {
            await verifyPaystackReference(payload?.reference || pay.reference);
            queryClient.invalidateQueries(['host-tables']);
          },
        });
      }
    } catch (e) {
      toast.error(e?.message || 'Payment failed to start');
    }
  };

  const copyHostedTableLink = async (tableId) => {
    const url = `${getPublicAppOrigin()}${createPageUrl(
      `TableDetails?id=${encodeURIComponent(tableId)}&source=hosted`,
    )}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Table link copied');
    } catch {
      toast.error('Could not copy link');
    }
  };

  const startRetryListingPayment = async (tableId) => {
    try {
      const pay = await apiPost(`/api/host/tables/${encodeURIComponent(tableId)}/retry-listing-payment`, {});
      if (pay?.reference && pay?.access_code) {
        launchPaystackInline({
          email: user?.email,
          amount: Number(pay.amount_zar || 0),
          reference: pay.reference,
          accessCode: pay.access_code,
          onSuccess: async (payload) => {
            await verifyPaystackReference(payload?.reference || pay.reference);
            queryClient.invalidateQueries({ queryKey: ['host-tables', user?.id] });
            toast.success('Payment received — your table is live.');
          },
          onCancel: () => {
            toast.message('Checkout closed', {
              description: 'Your table stays in draft until payment succeeds. You can retry from your tables list.',
            });
            queryClient.invalidateQueries({ queryKey: ['host-tables', user?.id] });
          },
        });
      } else {
        toast.message('Nothing to pay', {
          description: 'This listing may already be paid or does not require checkout.',
        });
      }
    } catch (e) {
      toast.error(e?.message || 'Could not start checkout');
    }
  };

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="animate-spin" />
      </div>
    );
  }

  return (
    <div className="px-4 py-6 max-w-[1100px] mx-auto pb-24 lg:pb-10">
      <div className="flex items-center gap-2 mb-6">
        <SecLogo size={30} />
        <div>
          <h1 className="text-xl font-bold">Host</h1>
          <p className="text-sm opacity-70">House parties & tables</p>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid w-full grid-cols-4 mb-4">
          <TabsTrigger value="parties">Parties</TabsTrigger>
          <TabsTrigger value="tables">Tables</TabsTrigger>
          <TabsTrigger value="jobs">Jobs</TabsTrigger>
          <TabsTrigger value="activity">Stats</TabsTrigger>
        </TabsList>

        <TabsContent value="parties">
          <div className="flex justify-between items-center mb-3">
            <h2 className="font-semibold">My House Parties</h2>
            <button
              type="button"
              onClick={() => setShowPartyModal(true)}
              className="sec-btn sec-btn-primary text-sm py-2 px-3 inline-flex items-center gap-1"
            >
              <Plus size={16} /> Create
            </button>
          </div>
          <div className="mb-3 opacity-90">
            {!userProfile?.payment_setup_complete ? (
              <div className="mb-3 rounded-xl p-3 border" style={{ borderColor: 'var(--sec-border)', backgroundColor: 'var(--sec-bg-card)' }}>
                <p className="text-sm" style={{ color: 'var(--sec-text-primary)' }}>
                  Add payout details to receive your earnings automatically.
                  <Link to={createPageUrl('Payments')} className="ml-1 underline" style={{ color: 'var(--sec-accent)' }}>
                    Settings &gt; Payment Methods
                  </Link>
                </p>
              </div>
            ) : null}
            <RefundPolicyNote />
          </div>
          {loadP ? <Loader2 className="animate-spin" /> : null}
          <div className="grid gap-3 xl:grid-cols-2">
            {parties.map((p) => {
              const sb = STATUS_BADGE[p.status] || STATUS_BADGE.DRAFT;
              return (
                <div key={p.id} className="sec-card p-4 rounded-xl border border-[var(--sec-border)]">
                  <div className="flex justify-between gap-2">
                    <div>
                      <div className="font-semibold">{p.title}</div>
                      <div className="text-xs opacity-70">{p.location}</div>
                      <div className="text-xs mt-1">
                        {format(parseISO(p.startTime), 'dd MMM yyyy HH:mm')} — {format(parseISO(p.endTime), 'HH:mm')}
                      </div>
                    </div>
                    <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: sb.bg, color: sb.color }}>
                      {sb.label}
                    </span>
                  </div>
                  <div className="text-sm mt-2">
                    RSVPs: {p.attendeeCount ?? p._count?.attendees ?? 0} / {p.guestQuantity} · Spots left: {p.spotsRemaining}
                  </div>
                  {p.boosted && <div className="text-xs text-amber-400 mt-1">Boosted</div>}
                  <div className="flex flex-wrap gap-2 mt-3">
                    {p.status === 'DRAFT' && (
                      <button type="button" className="sec-btn sec-btn-secondary text-xs py-1.5" onClick={() => publishParty(p.id)}>
                        Publish (R100)
                      </button>
                    )}
                    {p.status === 'PUBLISHED' && (
                      <>
                        <button type="button" className="sec-btn sec-btn-secondary text-xs py-1.5" onClick={() => boostParty(p.id)}>
                          Boost (R150)
                        </button>
                        <button
                          type="button"
                          className="sec-btn sec-btn-ghost text-xs py-1.5"
                          onClick={async () => {
                            try {
                              await apiDelete(`/api/host/parties/${p.id}`);
                              queryClient.invalidateQueries(['host-parties']);
                              toast.success('Party cancelled');
                            } catch (e) {
                              toast.error(e?.message || 'Could not cancel');
                            }
                          }}
                        >
                          Cancel
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
            {parties.length === 0 && !loadP && (
              <p className="text-sm opacity-60 text-center py-8">No parties yet. Create one to get started.</p>
            )}
          </div>
        </TabsContent>

        <TabsContent value="tables">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h2 className="font-semibold text-lg">My tables</h2>
              <p className="text-xs text-[var(--sec-text-muted)] mt-0.5">
                Each live table has a group chat. Drafts stay off Home and the Tables tab until listing payment succeeds.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowTableModal(true)}
              className="sec-btn sec-btn-primary text-sm py-2.5 px-3 inline-flex items-center gap-1 rounded-xl"
            >
              <Plus size={16} /> Host table
            </button>
          </div>
          {loadT ? <Loader2 className="animate-spin" /> : null}
          <div className="grid gap-4 xl:grid-cols-2">
            {tables.map((t) => {
              const loc =
                t.eventLocation?.displayLabel ||
                [t.venueAddress, t.venueName].filter(Boolean).join(' · ') ||
                t.venueName;
              const hostStatusBadge = TABLE_HOST_STATUS_BADGE[t.status] || TABLE_HOST_STATUS_BADGE.DRAFT;
              return (
                <div
                  key={t.id}
                  className="sec-card p-4 rounded-2xl border border-[var(--sec-border)] bg-[var(--sec-bg-card)] shadow-sm"
                >
                  <div className="flex justify-between gap-2 items-start">
                    <div>
                      <div className="font-semibold text-base">{t.tableName || t.venueName}</div>
                      <div className="text-xs text-[var(--sec-text-muted)] mt-1 flex items-start gap-1">
                        <span className="opacity-80">{loc}</span>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span
                        className="text-[10px] px-2 py-0.5 rounded-full"
                        style={{ background: hostStatusBadge.bg, color: hostStatusBadge.color }}
                      >
                        {hostStatusBadge.label}
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full border border-[var(--sec-border)]">
                        {t.isPublic ? 'Public' : 'Private'}
                      </span>
                      {(t.pendingInviteCount ?? 0) > 0 && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-200">
                          {t.pendingInviteCount} invite{t.pendingInviteCount === 1 ? '' : 's'} pending
                        </span>
                      )}
                    </div>
                  </div>
                  {t.photo && <img src={t.photo} alt="" className="w-full h-28 object-cover rounded-xl mt-3" />}
                  <div className="text-xs text-[var(--sec-text-muted)] mt-2">
                    {format(parseISO(t.eventDate), 'EEE d MMM')} · {t.eventTime} ·{' '}
                    {t.tableType === 'IN_APP_EVENT' ? 'SEC event' : 'External'}
                  </div>
                  <div className="text-xs mt-2 flex flex-wrap gap-2">
                    <span className="px-2 py-0.5 rounded-lg bg-[var(--sec-bg-elevated)] border border-[var(--sec-border)]">
                      {t.eventType || 'CLUB_TABLE'}
                    </span>
                  </div>
                  {t.tableDescription && (
                    <div className="text-xs text-[var(--sec-text-muted)] mt-2 line-clamp-2">{t.tableDescription}</div>
                  )}
                  <div className="text-sm mt-3 flex flex-wrap gap-3 items-center">
                    <span>Members {t._count?.members ?? 0}</span>
                    <span className="opacity-60">·</span>
                    <span>Spots left {t.spotsRemaining}</span>
                    {t.hasJoiningFee && (
                      <span className="text-amber-200">R{Number(t.joiningFee || 0).toFixed(0)} join</span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2 mt-3">
                    {t.status === 'DRAFT' && (
                      <button
                        type="button"
                        className="text-xs sec-btn sec-btn-primary py-2 px-3 rounded-xl"
                        onClick={() => startRetryListingPayment(t.id)}
                      >
                        Pay listing & go live
                      </button>
                    )}
                    {t.groupChat?.id && (
                      <Link
                        to={`${createPageUrl('Messages')}?group=${encodeURIComponent(t.groupChat.id)}&gk=HOSTED_TABLE`}
                        className="inline-flex items-center gap-1.5 text-xs sec-btn sec-btn-secondary py-2 px-3 rounded-xl"
                      >
                        <MessageCircle className="w-4 h-4" />
                        Open group chat
                      </Link>
                    )}
                    {t.status === 'ACTIVE' && (
                      <>
                        <button
                          type="button"
                          className="inline-flex items-center gap-1.5 text-xs sec-btn sec-btn-secondary py-2 px-3 rounded-xl"
                          onClick={() => copyHostedTableLink(t.id)}
                        >
                          <Copy className="w-4 h-4" />
                          Copy table link
                        </button>
                        <button
                          type="button"
                          className="inline-flex items-center gap-1.5 text-xs sec-btn sec-btn-ghost py-2 px-3 rounded-xl border border-[var(--sec-border)]"
                          onClick={() =>
                            setInviteOpenTableId((cur) => {
                              const next = cur === t.id ? null : t.id;
                              return next;
                            })
                          }
                        >
                          <UserPlus className="w-4 h-4" />
                          {inviteOpenTableId === t.id ? 'Hide invite search' : 'Invite a user'}
                        </button>
                      </>
                    )}
                    {t.pendingJoinCount > 0 && (
                      <button
                        type="button"
                        className="text-xs sec-btn sec-btn-ghost py-2 px-3 rounded-xl"
                        onClick={() => setPendingTableId(pendingTableId === t.id ? null : t.id)}
                      >
                        {pendingTableId === t.id ? 'Hide requests' : 'Review requests'}
                      </button>
                    )}
                  </div>
                  {t.status === 'DRAFT' && (
                    <p className="text-xs text-[var(--sec-text-muted)] mt-2 leading-relaxed">
                      This table is not visible to others and has no group chat until Paystack confirms your listing payment.
                      After it goes live, your host ticket appears under Profile, and you can invite registered users below.
                    </p>
                  )}
                  {t.status === 'ACTIVE' && inviteOpenTableId === t.id && (
                    <div className="mt-3 rounded-xl border border-[var(--sec-border)] bg-[var(--sec-bg-elevated)] p-3 space-y-2">
                      <p className="text-[11px] text-[var(--sec-text-muted)]">
                        Search by username or name. Only people with an SEC account receive the in-app invite. Private
                        tables: you can invite anyone registered — they do not need to be friends with you.
                      </p>
                      <Input
                        placeholder="Type at least 2 characters…"
                        value={inviteSearch}
                        onChange={(e) => setInviteSearch(e.target.value)}
                        className="bg-[var(--sec-bg-card)] border-[var(--sec-border)]"
                      />
                      {inviteUserSearchQ.isFetching ? (
                        <p className="text-xs text-[var(--sec-text-muted)] flex items-center gap-2">
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          Searching…
                        </p>
                      ) : inviteSearch.trim().length >= 2 ? (
                        <ul className="max-h-40 overflow-y-auto space-y-1">
                          {(inviteUserSearchQ.data || []).length === 0 ? (
                            <li className="text-xs text-[var(--sec-text-muted)] px-1 py-2">No matches</li>
                          ) : (
                            (inviteUserSearchQ.data || []).map((u) => (
                              <li
                                key={u.id}
                                className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 hover:bg-[var(--sec-bg-hover)]"
                              >
                                <div className="min-w-0 text-sm">
                                  <span className="font-medium text-white">@{u.username || 'user'}</span>
                                  {u.fullName ? (
                                    <span className="text-[var(--sec-text-muted)] text-xs ml-1 truncate">{u.fullName}</span>
                                  ) : null}
                                </div>
                                <button
                                  type="button"
                                  className="text-[10px] sec-btn sec-btn-primary py-1 px-2 rounded-lg shrink-0"
                                  onClick={async () => {
                                    try {
                                      await apiPost(`/api/host/tables/${t.id}/invite`, { inviteeUserId: u.id });
                                      toast.success('Invite sent');
                                      setInviteOpenTableId(null);
                                      setInviteSearch('');
                                      queryClient.invalidateQueries({ queryKey: ['host-tables'] });
                                    } catch (err) {
                                      toast.error(err?.message || 'Could not send invite');
                                    }
                                  }}
                                >
                                  Invite
                                </button>
                              </li>
                            ))
                          )}
                        </ul>
                      ) : (
                        <p className="text-[11px] text-[var(--sec-text-muted)]">Enter 2+ characters to search.</p>
                      )}
                    </div>
                  )}
                  {pendingTableId === t.id && (
                    <div className="mt-3 space-y-2 border-t border-[var(--sec-border)] pt-3">
                      {pendingLoading ? (
                        <p className="text-xs text-[var(--sec-text-muted)]">Loading…</p>
                      ) : (pendingRequests || []).length === 0 ? (
                        <p className="text-xs text-[var(--sec-text-muted)]">No pending requests.</p>
                      ) : (
                        (pendingRequests || []).map((pr) => (
                          <div
                            key={pr.id}
                            className="flex items-center justify-between gap-2 p-2 rounded-xl bg-[var(--sec-bg-elevated)]"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              {pr.user?.avatarUrl ? (
                                <img src={pr.user.avatarUrl} alt="" className="w-9 h-9 rounded-full object-cover" />
                              ) : (
                                <div className="w-9 h-9 rounded-full bg-[var(--sec-border)] flex items-center justify-center text-xs">
                                  {(pr.user?.username || '?')[0]}
                                </div>
                              )}
                              <div className="min-w-0">
                                <div className="text-sm font-medium truncate">@{pr.user?.username}</div>
                                <div className="text-[10px] text-[var(--sec-text-muted)] truncate">{pr.user?.fullName}</div>
                                {pr.user?.gender && (
                                  <div className="text-[10px] text-[var(--sec-text-muted)] mt-0.5">Gender: {pr.user.gender}</div>
                                )}
                                {pr.user?.city && (
                                  <div className="text-[10px] text-[var(--sec-text-muted)]">City: {pr.user.city}</div>
                                )}
                                {pr.user?.bio && (
                                  <div className="text-[10px] text-[var(--sec-text-muted)] line-clamp-2 mt-1">{pr.user.bio}</div>
                                )}
                                {pr.decisionLabel && (
                                  <div className="text-[10px] text-amber-200/90 mt-1">{pr.decisionLabel}</div>
                                )}
                                {(pr.user?.date_of_birth || pr.user?.verification_status) && (
                                  <div className="text-[10px] text-[var(--sec-text-muted)] mt-0.5">
                                    {pr.user?.date_of_birth ? `DOB: ${String(pr.user.date_of_birth).slice(0, 10)}` : ''}
                                    {pr.user?.date_of_birth && pr.user?.verification_status ? ' · ' : ''}
                                    {pr.user?.verification_status ? `ID: ${pr.user.verification_status}` : ''}
                                  </div>
                                )}
                                {pr.user?.id && (
                                  <Link
                                    to={createPageUrl(`Profile?id=${pr.user.id}`)}
                                    className="text-[10px] text-[var(--sec-accent)] underline mt-1 inline-block"
                                  >
                                    View profile
                                  </Link>
                                )}
                              </div>
                            </div>
                            <div className="flex gap-1 shrink-0">
                              {pr.reviewStatus === 'pending' && (
                                <>
                                  <button
                                    type="button"
                                    className="text-xs px-2 py-1.5 rounded-lg bg-[var(--sec-success-muted)] text-black"
                                    onClick={async () => {
                                      try {
                                        await apiPatch(`/api/host/tables/${t.id}/join-requests/${pr.userId}`, {
                                          action: 'approve',
                                        });
                                        toast.success('Approved');
                                        queryClient.invalidateQueries({ queryKey: ['host-tables'] });
                                        refetchPending();
                                      } catch (e) {
                                        toast.error(e?.message || 'Could not approve');
                                      }
                                    }}
                                  >
                                    Approve
                                  </button>
                                  <button
                                    type="button"
                                    className="text-xs px-2 py-1.5 rounded-lg border border-[var(--sec-border)]"
                                    onClick={async () => {
                                      try {
                                        await apiPatch(`/api/host/tables/${t.id}/join-requests/${pr.userId}`, {
                                          action: 'reject',
                                        });
                                        toast.success('Declined');
                                        queryClient.invalidateQueries({ queryKey: ['host-tables'] });
                                        refetchPending();
                                      } catch (e) {
                                        toast.error(e?.message || 'Could not decline');
                                      }
                                    }}
                                  >
                                    Decline
                                  </button>
                                </>
                              )}
                              {pr.reviewStatus === 'awaiting_payment' && (
                                <button
                                  type="button"
                                  className="text-xs px-2 py-1.5 rounded-lg border border-[var(--sec-border)]"
                                  onClick={async () => {
                                    try {
                                      await apiPatch(`/api/host/tables/${t.id}/join-requests/${pr.userId}`, {
                                        action: 'reject',
                                      });
                                      toast.success('Cancelled');
                                      queryClient.invalidateQueries({ queryKey: ['host-tables'] });
                                      refetchPending();
                                    } catch (e) {
                                      toast.error(e?.message || 'Could not cancel');
                                    }
                                  }}
                                >
                                  Cancel approval
                                </button>
                              )}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                  {t.boosted && <div className="text-xs text-amber-400 mt-2">Boosted</div>}
                </div>
              );
            })}
            {tables.length === 0 && !loadT && (
              <p className="text-sm text-[var(--sec-text-muted)] text-center py-10">No tables yet. Host one to start a group chat.</p>
            )}
          </div>
        </TabsContent>

        <TabsContent value="jobs">
          {loadJ ? <Loader2 className="animate-spin" /> : null}
          <div className="grid gap-2 xl:grid-cols-2">
            {jobs.map((j) => (
              <div key={j.id} className="sec-card p-3 rounded-lg border border-[var(--sec-border)] text-sm">
                <div className="font-medium">{j.title}</div>
                <div className="text-xs opacity-70">{j.houseParty?.title}</div>
                <div className="text-xs mt-1">
                  {j.status} · Applicants: {j._count?.applications ?? 0}
                </div>
              </div>
            ))}
            {jobs.length === 0 && !loadJ && <p className="text-sm opacity-60">No jobs posted on your parties yet.</p>}
          </div>
        </TabsContent>

        <TabsContent value="activity">
          <div className="sec-card p-4 rounded-xl text-sm grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            <div>Total parties hosted: {activity?.totalHousePartiesHosted ?? '—'}</div>
            <div>Total tables hosted: {activity?.totalTablesHosted ?? '—'}</div>
            <div>Party attendees (going): {activity?.totalPartyAttendees ?? '—'}</div>
            <div>Table joiners: {activity?.totalTableJoiners ?? '—'}</div>
            <div>Avg rating: {activity?.averageRatingReceived != null ? activity.averageRatingReceived.toFixed(1) : '—'}</div>
            <div>Jobs posted: {activity?.jobsPostedCount ?? '—'}</div>
          </div>
        </TabsContent>
      </Tabs>

      {showPartyModal && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/60 p-4" role="dialog">
          <div className="bg-[var(--sec-bg-card)] w-full max-w-md rounded-t-2xl sm:rounded-2xl p-4 max-h-[90vh] overflow-y-auto border border-[var(--sec-border)]">
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-semibold">Create house party</h3>
              <button type="button" className="text-sm opacity-70" onClick={closePartyModal}>
                Close
              </button>
            </div>
            <div className="text-xs opacity-60 mb-2">Step {partyStep} of 4</div>
            {partyStep === 1 && (
              <div className="space-y-3">
                <label className="block text-sm">
                  Title
                  <input
                    className="w-full mt-1 px-3 py-2 rounded-lg bg-[var(--sec-bg-elevated)] border border-[var(--sec-border)]"
                    value={partyForm.title}
                    onChange={(e) => setPartyForm((f) => ({ ...f, title: e.target.value }))}
                    maxLength={100}
                  />
                </label>
                <label className="block text-sm">
                  Description
                  <textarea
                    className="w-full mt-1 px-3 py-2 rounded-lg bg-[var(--sec-bg-elevated)] border border-[var(--sec-border)]"
                    rows={3}
                    value={partyForm.description}
                    onChange={(e) => setPartyForm((f) => ({ ...f, description: e.target.value }))}
                    maxLength={500}
                  />
                </label>
                <GoogleAddressInput
                  value={partyForm.location}
                  onChange={(structured) => {
                    const loc =
                      typeof structured === 'string'
                        ? structured
                        : structured?.formattedAddress || structured?.street || '';
                    setPartyForm((f) => ({
                      ...f,
                      location: loc,
                      latitude: typeof structured === 'object' ? structured?.latitude ?? null : f.latitude,
                      longitude: typeof structured === 'object' ? structured?.longitude ?? null : f.longitude,
                    }));
                  }}
                />
              </div>
            )}
            {partyStep === 2 && (
              <div className="space-y-3">
                <label className="block text-sm">
                  Start
                  <input
                    type="datetime-local"
                    className="w-full mt-1 px-3 py-2 rounded-lg bg-[var(--sec-bg-elevated)] border border-[var(--sec-border)]"
                    value={partyForm.startTime}
                    onChange={(e) => setPartyForm((f) => ({ ...f, startTime: e.target.value }))}
                  />
                </label>
                <label className="block text-sm">
                  End
                  <input
                    type="datetime-local"
                    className="w-full mt-1 px-3 py-2 rounded-lg bg-[var(--sec-bg-elevated)] border border-[var(--sec-border)]"
                    value={partyForm.endTime}
                    onChange={(e) => setPartyForm((f) => ({ ...f, endTime: e.target.value }))}
                  />
                </label>
              </div>
            )}
            {partyStep === 3 && (
              <div className="space-y-3">
                <label className="block text-sm">
                  Guest capacity
                  <input
                    type="number"
                    min={2}
                    max={500}
                    className="w-full mt-1 px-3 py-2 rounded-lg bg-[var(--sec-bg-elevated)] border border-[var(--sec-border)]"
                    value={partyForm.guestQuantity}
                    onChange={(e) => setPartyForm((f) => ({ ...f, guestQuantity: parseInt(e.target.value, 10) || 2 }))}
                  />
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={partyForm.hasEntranceFee}
                    onChange={(e) => setPartyForm((f) => ({ ...f, hasEntranceFee: e.target.checked }))}
                  />
                  Entrance fee at door
                </label>
                {partyForm.hasEntranceFee && (
                  <>
                    <input
                      type="number"
                      placeholder="Amount (ZAR)"
                      className="w-full px-3 py-2 rounded-lg bg-[var(--sec-bg-elevated)] border border-[var(--sec-border)]"
                      value={partyForm.entranceFeeAmount}
                      onChange={(e) => setPartyForm((f) => ({ ...f, entranceFeeAmount: e.target.value }))}
                    />
                    <input
                      placeholder="Note (e.g. R100 per person)"
                      className="w-full px-3 py-2 rounded-lg bg-[var(--sec-bg-elevated)] border border-[var(--sec-border)]"
                      value={partyForm.entranceFeeNote}
                      onChange={(e) => setPartyForm((f) => ({ ...f, entranceFeeNote: e.target.value }))}
                    />
                  </>
                )}
                <input
                  placeholder="Free entry group (optional)"
                  className="w-full px-3 py-2 rounded-lg bg-[var(--sec-bg-elevated)] border border-[var(--sec-border)]"
                  value={partyForm.freeEntryGroup}
                  onChange={(e) => setPartyForm((f) => ({ ...f, freeEntryGroup: e.target.value }))}
                />
                <label className="text-xs text-[var(--sec-text-muted)] block">
                  Who can join this party?
                  <select
                    className="w-full mt-1 px-3 py-2 rounded-lg bg-[var(--sec-bg-elevated)] border border-[var(--sec-border)] text-sm"
                    value={partyForm.guestGenderPreference}
                    onChange={(e) => setPartyForm((f) => ({ ...f, guestGenderPreference: e.target.value }))}
                  >
                    <option value="ANY">Everyone</option>
                    <option value="MALE_ONLY">Male only</option>
                    <option value="FEMALE_ONLY">Female only</option>
                    <option value="OTHER_ONLY">Other gender only</option>
                  </select>
                </label>
              </div>
            )}
            {partyStep === 4 && (
              <div className="text-sm space-y-2 opacity-90">
                <p><strong>{partyForm.title}</strong></p>
                <p>{partyForm.description}</p>
                <p>{partyForm.location}</p>
                <p>Guests: {partyForm.guestQuantity}</p>
              </div>
            )}
            <div className="flex gap-2 mt-4">
              {partyStep > 1 && (
                <button type="button" className="sec-btn sec-btn-ghost flex-1" onClick={() => setPartyStep((s) => s - 1)}>
                  Back
                </button>
              )}
              {partyStep < 4 && (
                <button type="button" className="sec-btn sec-btn-primary flex-1" onClick={() => setPartyStep((s) => s + 1)}>
                  Next
                </button>
              )}
              {partyStep === 4 && (
                <>
                  <button type="button" disabled={saving} className="sec-btn sec-btn-secondary flex-1" onClick={() => submitParty(false)}>
                    Save draft
                  </button>
                  <button type="button" disabled={saving} className="sec-btn sec-btn-primary flex-1" onClick={() => submitParty(true)}>
                    Publish R100
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {showTableModal && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/60 p-4">
          <div className="bg-[var(--sec-bg-card)] w-full max-w-md rounded-t-2xl sm:rounded-2xl p-4 max-h-[90vh] overflow-y-auto border border-[var(--sec-border)]">
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-semibold">Host a table</h3>
              <button type="button" className="text-sm opacity-70" onClick={() => { setShowTableModal(false); setSearchParams({}, { replace: true }); }}>
                Close
              </button>
            </div>
            <div className="space-y-4 text-sm">
              <p className="text-xs text-[var(--sec-text-muted)] leading-relaxed">
                Choose whether your table is for an official SEC event or your own meet-up. Table name becomes the group chat name.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  className={`flex-1 py-3 rounded-xl border text-sm font-medium transition-colors ${tableForm.tableType === 'IN_APP_EVENT' ? 'border-[var(--sec-accent)] bg-[var(--sec-bg-elevated)]' : 'border-[var(--sec-border)]'}`}
                  onClick={() => setTableForm((f) => ({ ...f, tableType: 'IN_APP_EVENT' }))}
                >
                  SEC app event
                </button>
                <button
                  type="button"
                  className={`flex-1 py-3 rounded-xl border text-sm font-medium transition-colors ${tableForm.tableType === 'EXTERNAL_VENUE' ? 'border-[var(--sec-accent)] bg-[var(--sec-bg-elevated)]' : 'border-[var(--sec-border)]'}`}
                  onClick={() =>
                    setTableForm((f) => ({
                      ...f,
                      tableType: 'EXTERNAL_VENUE',
                      guestQuantity: Math.min(Number(f.guestQuantity) || 1, 20),
                    }))
                  }
                >
                  External meet-up
                </button>
              </div>
              {tableForm.tableType === 'IN_APP_EVENT' ? (
                <>
                  <label className="block text-sm font-medium">
                    Find event
                    <input
                      type="search"
                      placeholder="Search by title or city…"
                      className="w-full mt-1 px-3 py-2.5 rounded-xl bg-[var(--sec-bg-elevated)] border border-[var(--sec-border)]"
                      value={eventSearch}
                      onChange={(e) => setEventSearch(e.target.value)}
                    />
                  </label>
                  <div className="rounded-xl border border-[var(--sec-border)] bg-[var(--sec-bg-elevated)] max-h-44 overflow-y-auto">
                    {filteredPublicEvents.length === 0 ? (
                      <p className="px-3 py-3 text-xs text-[var(--sec-text-muted)]">No matches</p>
                    ) : (
                      filteredPublicEvents.slice(0, 50).map((ev) => (
                        <button
                          key={ev.id}
                          type="button"
                          onClick={() => setTableForm((f) => ({ ...f, eventId: ev.id }))}
                          className={`w-full text-left px-3 py-2.5 text-sm border-b border-[var(--sec-border)] last:border-0 transition-colors ${
                            tableForm.eventId === ev.id ? 'bg-[var(--sec-bg-hover)]' : 'hover:bg-[var(--sec-bg-base)]'
                          }`}
                        >
                          <div className="font-medium">{ev.title}</div>
                          <div className="text-xs opacity-70">{ev.city}</div>
                        </button>
                      ))
                    )}
                  </div>
                  {selectedEvent && (
                    <div className="rounded-xl border border-[var(--sec-border)] bg-[var(--sec-bg-elevated)] px-3 py-2 text-xs space-y-1">
                      <div className="font-medium text-[var(--sec-text-primary)]">Event location</div>
                      <div className="opacity-90">
                        {[selectedEvent.city, selectedEvent.venue?.name, selectedEvent.venue_name]
                          .filter(Boolean)
                          .join(' · ')}
                      </div>
                      {eventStartTimeLabel(selectedEvent) ? (
                        <div className="opacity-70">Event starts {eventStartTimeLabel(selectedEvent)}</div>
                      ) : (
                        <div className="text-[var(--sec-error)] font-medium">
                          No event start time — the venue must add one before you can list a table.
                        </div>
                      )}
                    </div>
                  )}
                  {selectedEventDetailLoading ? (
                    <p className="text-xs text-[var(--sec-text-muted)] flex items-center gap-2">
                      <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                      Loading latest event hosting settings…
                    </p>
                  ) : null}
                  {!selectedEventDetailLoading && selectedEvent && !inAppHasTiersForCategory ? (
                    <p className="text-xs text-[var(--sec-error)] rounded-lg border border-[var(--sec-border)] px-3 py-2 bg-[var(--sec-bg-elevated)]">
                      No table pricing tiers for{' '}
                      <strong>{tableForm.hostingCategory === 'VIP' ? 'VIP' : 'General'}</strong> on this event. Ask the venue
                      owner to add tiers under event hosting setup.
                    </p>
                  ) : null}
                  <div className="grid grid-cols-2 gap-2">
                    <label className="block text-sm font-medium">
                      Hosting category
                      <select
                        className="w-full mt-1 px-3 py-2 rounded-lg bg-[var(--sec-bg-elevated)] border border-[var(--sec-border)]"
                        value={tableForm.hostingCategory}
                        onChange={(e) => setTableForm((f) => ({ ...f, hostingCategory: e.target.value, hostingTierIndex: 0 }))}
                      >
                        <option value="GENERAL">General</option>
                        <option value="VIP">VIP</option>
                      </select>
                    </label>
                    <label className="block text-sm font-medium">
                      Tier
                      <select
                        className="w-full mt-1 px-3 py-2 rounded-lg bg-[var(--sec-bg-elevated)] border border-[var(--sec-border)] disabled:opacity-60"
                        disabled={hostingTierOptions.length === 0}
                        value={
                          hostingTierOptions.length === 0
                            ? '0'
                            : String(Math.min(tableForm.hostingTierIndex, hostingTierOptions.length - 1))
                        }
                        onChange={(e) => setTableForm((f) => ({ ...f, hostingTierIndex: Number(e.target.value || 0) }))}
                      >
                        {hostingTierOptions.length === 0 ? (
                          <option value="0">No tiers configured</option>
                        ) : (
                          hostingTierOptions.map((t) => (
                            <option key={t.value} value={t.value}>
                              {t.name} · Max {t.maxGuests ?? '-'} · Min spend {t.minSpend ?? '-'} · Tables {t.tableSlots ?? '-'}
                            </option>
                          ))
                        )}
                      </select>
                    </label>
                  </div>
                </>
              ) : (
                <>
                  <label className="block text-sm font-medium">
                    Venue name
                    <input
                      placeholder="e.g. Rooftop Lounge"
                      className="w-full mt-1 px-3 py-2.5 rounded-xl bg-[var(--sec-bg-elevated)] border border-[var(--sec-border)]"
                      value={tableForm.venueName}
                      onChange={(e) => setTableForm((f) => ({ ...f, venueName: e.target.value }))}
                    />
                  </label>
                  <div>
                    <div className="text-sm font-medium mb-1">Address</div>
                    <p className="text-xs text-[var(--sec-text-muted)] mb-2">Required so friends know exactly where to go.</p>
                    <GoogleAddressInput
                      value={tableForm.venueAddress}
                      onChange={(structured) => {
                        const addr =
                          typeof structured === 'string'
                            ? structured
                            : structured?.formattedAddress || structured?.street || '';
                        setTableForm((f) => ({ ...f, venueAddress: addr }));
                      }}
                    />
                  </div>
                  <label className="block text-sm font-medium">
                    Date
                    <input
                      type="date"
                      className="w-full mt-1 px-3 py-2.5 rounded-xl bg-[var(--sec-bg-elevated)] border border-[var(--sec-border)]"
                      value={tableForm.eventDate}
                      onChange={(e) => setTableForm((f) => ({ ...f, eventDate: e.target.value }))}
                    />
                  </label>
                </>
              )}
              <input
                placeholder="Table name (e.g. VIP Section)"
                className="w-full px-3 py-2 rounded-lg bg-[var(--sec-bg-elevated)] border border-[var(--sec-border)]"
                value={tableForm.tableName}
                onChange={(e) => setTableForm((f) => ({ ...f, tableName: e.target.value }))}
                maxLength={60}
              />
              <select
                className="w-full px-3 py-2 rounded-lg bg-[var(--sec-bg-elevated)] border border-[var(--sec-border)]"
                value={tableForm.eventType}
                onChange={(e) => setTableForm((f) => ({ ...f, eventType: e.target.value }))}
              >
                <option value="CLUB_TABLE">Club Table</option>
                <option value="HOUSE_PARTY">House Party</option>
                <option value="BOAT_PARTY">Boat Party</option>
                <option value="RESTAURANT">Restaurant</option>
                <option value="OTHER">Other</option>
              </select>
              <textarea
                placeholder="Description (optional)"
                className="w-full px-3 py-2 rounded-lg bg-[var(--sec-bg-elevated)] border border-[var(--sec-border)]"
                rows={3}
                value={tableForm.tableDescription}
                onChange={(e) => setTableForm((f) => ({ ...f, tableDescription: e.target.value }))}
                maxLength={300}
              />
              <label className="block text-sm font-medium">
                {tableForm.tableType === 'IN_APP_EVENT' ? 'When will you meet at the table?' : 'Meet time'}
                <input
                  type="time"
                  min={tableForm.tableType === 'IN_APP_EVENT' ? eventStartTimeForInput(selectedEvent) : undefined}
                  disabled={tableForm.tableType === 'IN_APP_EVENT' && selectedEvent && !hasEventStartTime}
                  className="w-full mt-1 px-3 py-2.5 rounded-xl bg-[var(--sec-bg-elevated)] border border-[var(--sec-border)] disabled:opacity-60"
                  value={tableForm.eventTime}
                  onChange={(e) =>
                    setTableForm((f) => {
                      const nextTime = e.target.value;
                      const minTime = f.tableType === 'IN_APP_EVENT' ? eventStartTimeForInput(selectedEvent) : undefined;
                      if (minTime && isTimeEarlierThan(nextTime, minTime)) {
                        return { ...f, eventTime: minTime };
                      }
                      return { ...f, eventTime: nextTime };
                    })
                  }
                />
                {tableForm.tableType === 'IN_APP_EVENT' && hasEventStartTime && (
                  <span className="text-xs text-[var(--sec-text-muted)] mt-1 block">
                    Earliest meet time is event start ({eventStartTimeLabel(selectedEvent)}). Earlier times are blocked when
                    you submit.
                  </span>
                )}
              </label>
              <label className="block text-sm font-medium">
                Spots at table
                <input
                  type="number"
                  min={1}
                  max={tableGuestMax}
                  placeholder="Spots at table"
                  className="w-full mt-1 px-3 py-2 rounded-lg bg-[var(--sec-bg-elevated)] border border-[var(--sec-border)]"
                  value={tableForm.guestQuantity}
                  onChange={(e) =>
                    setTableForm((f) => {
                      const raw = parseInt(e.target.value, 10) || 1;
                      return { ...f, guestQuantity: Math.min(Math.max(1, raw), tableGuestMax) };
                    })
                  }
                />
              </label>
              {tableForm.tableType === 'IN_APP_EVENT' && selectedHostingTier?.max_guests ? (
                <p className="text-xs text-[var(--sec-text-muted)]">
                  Max guests for this tier: {selectedHostingTier.max_guests} — you cannot exceed this limit.
                </p>
              ) : null}
              {tableForm.tableType === 'EXTERNAL_VENUE' ? (
                <p className="text-xs text-[var(--sec-text-muted)]">External meet-ups allow at most 20 spots.</p>
              ) : null}
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={tableForm.hasJoiningFee}
                  onChange={(e) => setTableForm((f) => ({ ...f, hasJoiningFee: e.target.checked }))}
                />
                Charge joining fee
              </label>
              {tableForm.hasJoiningFee && (
                <input
                  type="number"
                  min={10}
                  placeholder="Joining fee (ZAR)"
                  className="w-full px-3 py-2 rounded-lg bg-[var(--sec-bg-elevated)] border border-[var(--sec-border)]"
                  value={tableForm.joiningFee}
                  onChange={(e) => setTableForm((f) => ({ ...f, joiningFee: e.target.value }))}
                />
              )}
              {tableForm.tableType === 'IN_APP_EVENT' && selectedEvent && venueMenuItems.length > 0 && (
                <div>
                  <p className="text-sm font-medium mb-2">Build your table order (minimum spend)</p>
                  <MenuPicker
                    items={venueMenuItems}
                    selected={tableMenuSelected}
                    onChange={(id, qty) => setTableMenuSelected((s) => ({ ...s, [id]: qty }))}
                    includedItems={tierIncludedDisplay}
                  />
                </div>
              )}
              {tableForm.tableType === 'IN_APP_EVENT' && inAppListingBreakdown && inAppListingBreakdown.total > 0 && (
                <div className="rounded-xl border border-[var(--sec-border)] p-3 space-y-2 text-sm bg-[var(--sec-bg-elevated)]">
                  <p className="text-xs font-medium text-[var(--sec-text-muted)] uppercase tracking-wide">Your listing payment</p>
                  <div className="flex justify-between gap-2">
                    <span className="text-[var(--sec-text-muted)]">Door entrance</span>
                    <span>R{inAppListingBreakdown.entrance.toFixed(0)}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-[var(--sec-text-muted)]">Booking (host table fee)</span>
                    <span>R{inAppListingBreakdown.hostFee.toFixed(0)}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-[var(--sec-text-muted)]">Menu selection</span>
                    <span>R{inAppListingBreakdown.menuCart.toFixed(0)}</span>
                  </div>
                  {inAppListingBreakdown.minSpend > 0 && (
                    <p className="text-[11px] text-[var(--sec-text-muted)]">
                      Tier minimum: R{inAppListingBreakdown.minSpend.toFixed(0)}
                      {inAppListingBreakdown.menuCart >= inAppListingBreakdown.minSpend ? ' (met)' : ' (add more items)'}
                    </p>
                  )}
                  <div className="flex justify-between gap-2 pt-2 border-t border-[var(--sec-border)] font-semibold">
                    <span>Total due now</span>
                    <span>R{inAppListingBreakdown.total.toFixed(0)}</span>
                  </div>
                  <p className="text-[11px] text-[var(--sec-text-muted)] pt-1">
                    After Paystack succeeds, your table goes live. Payouts: 15% platform / 85% to the venue on this total.
                  </p>
                </div>
              )}
              <div className="rounded-xl border border-[var(--sec-border)] p-3 space-y-2">
                <label className="flex items-start gap-3 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={tableForm.isPublic}
                    onChange={(e) => setTableForm((f) => ({ ...f, isPublic: e.target.checked }))}
                  />
                  <span>
                    <span className="font-medium">Show in public table list</span>
                    <span className="block text-xs text-[var(--sec-text-muted)] mt-0.5">
                      Turn off for a private table: only people you invite can join, and others must request approval to join.
                    </span>
                  </span>
                </label>
              </div>
              <button
                type="button"
                disabled={saving || (tableForm.tableType === 'IN_APP_EVENT' && !canSubmitInAppTable)}
                className="sec-btn sec-btn-primary w-full disabled:opacity-50"
                onClick={submitTable}
              >
                List my table
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
