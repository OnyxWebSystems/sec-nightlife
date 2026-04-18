import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import * as authService from '@/services/authService';
import { dataService } from '@/services/dataService';
import { apiGet } from '@/api/client';
import { useQuery } from '@tanstack/react-query';
import { 
  Users,
  Calendar,
  DollarSign,
  ChevronRight,
  ChevronLeft,
  Check,
  Search,
  MapPin,
  Info,
  Lock,
  LockOpen,
  Link as LinkIcon,
  Copy,
  Share2
} from 'lucide-react';
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { motion, AnimatePresence } from 'framer-motion';
import { format, parseISO, isToday, isTomorrow } from 'date-fns';
import { Link } from 'react-router-dom';
import { isIdentityVerifiedUser } from '@/lib/identityVerification';
import { toast } from 'sonner';

export default function CreateTable() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [user, setUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);
  const [createdTable, setCreatedTable] = useState(null);
  const [copiedLink, setCopiedLink] = useState(false);
  
  const [formData, setFormData] = useState({
    event_id: '',
    table_category: 'general',
    name: '',
    description: '',
    max_guests: 8,
    min_spend: 5000,
    joining_fee: 0,
    is_public: true,
    gender_rules: {
      min_spend_male: 0,
      min_spend_female: 0,
      ratio_required: false
    }
  });

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
      authService.redirectToLogin(createPageUrl('CreateTable'));
    }
  };

  const { data: events = [] } = useQuery({
    queryKey: ['upcoming-events'],
    queryFn: () => dataService.Event.filter({ status: 'published' }, 'date', 50),
    enabled: !!user,
  });

  const { data: venues = [] } = useQuery({
    queryKey: ['venues'],
    queryFn: () => dataService.Venue.list(),
    enabled: !!user,
  });

  const venuesMap = useMemo(() => {
    return venues.reduce((acc, venue) => {
      acc[venue.id] = venue;
      return acc;
    }, {});
  }, [venues]);

  const filteredEvents = events.filter((event) => {
    const q = searchQuery.toLowerCase();
    return (
      (event.title ?? '').toLowerCase().includes(q) ||
      (event.city ?? '').toLowerCase().includes(q)
    );
  });

  const selectedEvent = events.find(e => e.id === formData.event_id);

  const { data: eventDetail } = useQuery({
    queryKey: ['event-detail', formData.event_id],
    queryFn: () => apiGet(`/api/events/${formData.event_id}`),
    enabled: !!formData.event_id,
  });
  const stats = eventDetail?.stats;

  const identityOk = isIdentityVerifiedUser(user, userProfile);

  const tableCategory = formData.table_category === 'vip' ? 'vip' : 'general';
  const catStats = stats?.[tableCategory];
  const maxForSelectedCategory = eventDetail?.hosting_config?.[tableCategory]?.max_tables;
  const atTableCapacity =
    maxForSelectedCategory != null && catStats && (catStats.tables_remaining ?? 0) === 0;

  const handleSubmit = async () => {
    if (!identityOk) {
      toast.error('Verify your identity in Profile before hosting a table.');
      return;
    }
    if (atTableCapacity) {
      toast.error('This event has no table slots left.');
      return;
    }
    setIsSubmitting(true);

    try {
      const table = await dataService.Table.create({
        event_id: formData.event_id,
        venue_id: selectedEvent?.venue_id,
        name: formData.name,
        table_category: formData.table_category,
        max_guests: formData.max_guests,
        min_spend: formData.min_spend,
        joining_fee: formData.joining_fee,
        is_public: formData.is_public,
      });
      
      await dataService.Chat.create({
        type: 'table',
        name: formData.name,
        participants: [userProfile?.id],
        admins: [userProfile?.id],
        related_table_id: table.id,
        related_event_id: formData.event_id
      });

      setCreatedTable(table);
      setShowSuccessDialog(true);
    } catch (error) {
      console.error('Failed to create table:', error);
      const msg = error?.data?.error || error?.message || 'Failed to create table.';
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleShare = async () => {
    if (!createdTable) return;
    
    const shareUrl = `${window.location.origin}${createPageUrl('TableDetails')}?id=${createdTable.id}`;
    
    if (navigator.share) {
      try {
        await navigator.share({
          title: formData.name,
          text: `Join my table at ${selectedEvent?.title || 'this event'}!`,
          url: shareUrl,
        });
      } catch (err) {
        console.log('Share failed:', err);
      }
    }
  };

  const copyLink = () => {
    if (!createdTable) return;
    const shareUrl = `${window.location.origin}${createPageUrl('TableDetails')}?id=${createdTable.id}`;
    navigator.clipboard.writeText(shareUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const getDateLabel = (date) => {
    if (!date) return '';
    const d = parseISO(date);
    if (isToday(d)) return 'Tonight';
    if (isTomorrow(d)) return 'Tomorrow';
    return format(d, 'EEE, MMM d');
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--sec-bg-base)' }}>
      {/* Header */}
      <header style={{ position: 'sticky', top: 0, zIndex: 40, backgroundColor: 'rgba(0,0,0,0.92)', backdropFilter: 'blur(16px)', borderBottom: '1px solid var(--sec-border)' }}>
        <div className="px-4 py-4 flex items-center gap-4">
          <button 
            onClick={() => {
              if (step > 1) {
                setStep(step - 1);
              } else {
                navigate(-1);
              }
            }} 
            style={{ width: 40, height: 40, borderRadius: '50%', backgroundColor: 'var(--sec-bg-card)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--sec-border)' }}
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-xl font-bold">Create Table</h1>
            <p className="text-sm text-gray-500">Step {step} of 3</p>
          </div>
        </div>

        {/* Progress */}
        <div className="px-4 pb-4">
          <div className="flex gap-2">
            {[1, 2, 3].map((s) => (
              <div
                key={s}
                style={{
                  flex: 1,
                  height: 4,
                  borderRadius: 999,
                  backgroundColor: s <= step ? 'var(--sec-accent)' : 'var(--sec-border)',
                  transition: 'background-color 0.2s ease'
                }}
              />
            ))}
          </div>
        </div>
      </header>

      {user && userProfile && !identityOk && (
        <div className="px-4 pt-4 max-w-lg mx-auto">
          <div
            style={{
              padding: 14,
              borderRadius: 12,
              border: '1px solid var(--sec-border)',
              backgroundColor: 'var(--sec-bg-card)',
              fontSize: 13,
              color: 'var(--sec-text-secondary)',
            }}
          >
            Identity verification is required to host a table.{' '}
            <Link to={createPageUrl('EditProfile')} style={{ color: 'var(--sec-accent)', fontWeight: 600 }}>
              Upload your ID in Edit profile
            </Link>
          </div>
        </div>
      )}

      <div className="px-4 py-6">
        <AnimatePresence mode="wait">
          {/* Step 1: Select Event */}
          {step === 1 && (
            <motion.div
              key="step1"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
              <h2 className="text-lg font-semibold mb-4">Select an Event</h2>
              <p className="text-xs text-gray-500 mb-3">
                After you pick an event, you&apos;ll see how many people are going, table slots left, and full tables.
              </p>
              
              <div className="relative mb-4">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                <Input
                  placeholder="Search events..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="sec-input pl-12 h-12"
                />
              </div>

              <div className="space-y-3 max-h-[60vh] overflow-y-auto">
                {filteredEvents.map((event) => {
                  const venue = venuesMap[event.venue_id];
                  const isSelected = formData.event_id === event.id;

                  return (
                    <button
                      key={event.id}
                      onClick={() => {
                        setFormData((prev) => ({ ...prev, event_id: event.id, table_category: 'general' }));
                        setTimeout(() => setStep(2), 300);
                      }}
                      style={{
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 16,
                        padding: 16,
                        borderRadius: 12,
                        textAlign: 'left',
                        backgroundColor: isSelected ? 'var(--sec-accent-muted)' : 'var(--sec-bg-card)',
                        border: `1px solid ${isSelected ? 'var(--sec-accent-border)' : 'var(--sec-border)'}`,
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <div style={{ width: 64, height: 64, borderRadius: 12, backgroundColor: 'var(--sec-bg-elevated)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
                        {event.cover_image_url ? (
                          <img src={event.cover_image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                          <Calendar size={24} strokeWidth={1.5} style={{ color: 'var(--sec-accent)' }} />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold truncate">{event.title}</h3>
                        {venue && <p className="text-sm text-gray-500">{venue.name}</p>}
                        {(event.hosting_config?.general?.max_tables != null ||
                          event.hosting_config?.vip?.max_tables != null) && (
                          <p className="text-xs text-gray-500 mt-0.5">
                            {(event.hosting_config?.general?.max_tables != null) ? (
                              <>General cap: {event.hosting_config.general.max_tables}</>
                            ) : null}
                            {(event.hosting_config?.general?.max_tables != null && event.hosting_config?.vip?.max_tables != null) ? ' · ' : null}
                            {(event.hosting_config?.vip?.max_tables != null) ? (
                              <>VIP cap: {event.hosting_config.vip.max_tables}</>
                            ) : null}
                          </p>
                        )}
                        <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {getDateLabel(event.date)}
                          </span>
                          {event.city && (
                            <span className="flex items-center gap-1">
                              <MapPin className="w-3 h-3" />
                              {event.city}
                            </span>
                          )}
                        </div>
                      </div>
                      {isSelected && (
                        <div style={{ width: 24, height: 24, borderRadius: '50%', backgroundColor: 'var(--sec-accent)', color: 'var(--sec-bg-base)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <Check size={14} strokeWidth={2.5} />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </motion.div>
          )}

          {/* Step 2: Table Details */}
          {step === 2 && (
            <motion.div
              key="step2"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <h2 className="text-lg font-semibold">Table Details</h2>

              {stats && (
                <div
                  className="rounded-xl p-4 mb-4 text-sm"
                  style={{
                    backgroundColor: 'var(--sec-bg-card)',
                    border: '1px solid var(--sec-border)',
                    color: 'var(--sec-text-secondary)',
                  }}
                >
                  <p className="font-semibold text-[var(--sec-text-primary)] mb-2">Event snapshot</p>
                  <div className="grid gap-1.5 text-xs sm:text-sm">
                    <span>Going: {stats.going_count} people</span>
                    <span>Hosted tables (all): {stats.hosted_tables}</span>
                    {stats.general && (
                      <>
                        <span className="font-medium text-[var(--sec-text-primary)] mt-1">General</span>
                        <span>Slots left: {stats.general.tables_remaining ?? '—'} · Open to join: {stats.general.tables_with_join_space} · Full: {stats.general.tables_full}</span>
                      </>
                    )}
                    {stats.vip && (
                      <>
                        <span className="font-medium text-[var(--sec-text-primary)] mt-1">VIP</span>
                        <span>Slots left: {stats.vip.tables_remaining ?? '—'} · Open to join: {stats.vip.tables_with_join_space} · Full: {stats.vip.tables_full}</span>
                      </>
                    )}
                  </div>
                  {atTableCapacity && (
                    <p className="mt-3 text-amber-400 text-xs font-medium">
                      No table slots left for this event — choose another event or contact the venue.
                    </p>
                  )}
                </div>
              )}

              <div className="mb-4 space-y-3">
                <div>
                  <Label className="text-gray-400 text-sm">Table category</Label>
                  <Select
                    value={formData.table_category}
                    onValueChange={(v) => setFormData((p) => ({ ...p, table_category: v }))}
                  >
                    <SelectTrigger className="mt-2 h-12 rounded-xl sec-input">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="text-white" style={{ backgroundColor: 'var(--sec-bg-card)', borderColor: 'var(--sec-border)' }}>
                      <SelectItem value="general">General</SelectItem>
                      <SelectItem value="vip">VIP</SelectItem>
                    </SelectContent>
                  </Select>
                  {maxForSelectedCategory != null && (
                    <p className="text-xs text-gray-500 mt-1.5">
                      {tableCategory === 'vip' ? 'VIP' : 'General'} slots left: {catStats?.tables_remaining ?? 0}
                    </p>
                  )}
                </div>
                {(['general', 'vip']).map((cat) => {
                  const tiers = eventDetail?.hosting_config?.[cat]?.tiers;
                  if (!Array.isArray(tiers) || tiers.length === 0) return null;
                  const label = cat === 'vip' ? 'VIP' : 'General';
                  return (
                    <div key={cat} className="text-xs text-gray-500">
                      <span className="text-gray-400 font-medium">{label} pricing guide: </span>
                      {tiers.map((t, i) => (
                        <span key={i}>
                          {i > 0 ? ' · ' : ''}
                          {t.max_guests} guests from R{Number(t.min_spend).toLocaleString()}
                        </span>
                      ))}
                    </div>
                  );
                })}
              </div>

              <div>
                <Label className="text-gray-400 text-sm">Table Name</Label>
                <Input
                  placeholder="e.g., VIP Section, Birthday Crew..."
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && formData.name.trim()) {
                      setStep(3);
                    }
                  }}
                  className="sec-input mt-2 h-12"
                  autoFocus
                />
              </div>

              <div>
                <Label className="text-gray-400 text-sm">Description (optional)</Label>
                <Textarea
                  placeholder="Tell people about your table..."
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  className="mt-2 bg-[#141416] border-[#262629] rounded-xl resize-none"
                  rows={3}
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label className="text-gray-400 text-sm">Max Guests</Label>
                  <span className="text-lg font-bold">{formData.max_guests}</span>
                </div>
                <Slider
                  value={[formData.max_guests]}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, max_guests: value[0] }))}
                  min={2}
                  max={20}
                  step={1}
                  className="py-4"
                />
                <div className="flex justify-between text-xs text-gray-500">
                  <span>2</span>
                  <span>20</span>
                </div>
              </div>

              <div className="sec-card flex items-center justify-between p-4 rounded-xl">
                <div className="flex items-center gap-3">
                  <div style={{ width: 20, height: 20, borderRadius: 4, backgroundColor: 'var(--sec-accent)', color: 'var(--sec-bg-base)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {formData.is_public ? (
                      <LockOpen size={14} strokeWidth={1.5} />
                    ) : (
                      <Lock size={14} strokeWidth={1.5} />
                    )}
                  </div>
                  <div>
                    <p className="font-medium">{formData.is_public ? 'Public Table' : 'Private Table'}</p>
                    <p className="text-xs text-gray-500">
                      {formData.is_public ? 'Anyone can request to join' : 'Invite only'}
                    </p>
                  </div>
                </div>
                <Switch
                  checked={formData.is_public}
                  onCheckedChange={(checked) => setFormData(prev => ({ ...prev, is_public: checked }))}
                  className="data-[state=checked]:bg-[var(--sec-accent)]"
                />
              </div>
            </motion.div>
          )}

          {/* Step 3: Spending Rules */}
          {step === 3 && (
            <motion.div
              key="step3"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <h2 className="text-lg font-semibold">Spending Rules</h2>

              {stats && (
                <div
                  className="rounded-xl p-3 mb-4 text-xs"
                  style={{
                    backgroundColor: 'var(--sec-bg-card)',
                    border: '1px solid var(--sec-border)',
                    color: 'var(--sec-text-secondary)',
                  }}
                >
                  Going {stats.going_count} ·{' '}
                  {tableCategory === 'vip' ? 'VIP' : 'General'} slots left{' '}
                  {maxForSelectedCategory != null ? catStats?.tables_remaining ?? 0 : '—'} · Full ({tableCategory}){' '}
                  {catStats?.tables_full ?? 0}
                </div>
              )}

              <div className="sec-card rounded-xl p-4">
                <div className="flex items-start gap-3 mb-4">
                  <Info size={20} strokeWidth={1.5} style={{ color: 'var(--sec-accent)', flexShrink: 0, marginTop: 2 }} />
                  <p className="text-sm text-gray-400">
                    Set minimum spend requirements for your table. This helps ensure everyone contributes fairly.
                  </p>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label className="text-gray-400 text-sm">Minimum Table Spend</Label>
                  <span className="text-lg font-bold" style={{ color: 'var(--sec-accent)' }}>R{formData.min_spend.toLocaleString()}</span>
                </div>
                <Slider
                  value={[formData.min_spend]}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, min_spend: value[0] }))}
                  min={1000}
                  max={50000}
                  step={500}
                  className="py-4"
                />
                <div className="flex justify-between text-xs text-gray-500">
                  <span>R1,000</span>
                  <span>R50,000</span>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label className="text-gray-400 text-sm">Joining Fee (optional)</Label>
                  <span className="text-lg font-bold">R{formData.joining_fee.toLocaleString()}</span>
                </div>
                <Slider
                  value={[formData.joining_fee]}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, joining_fee: value[0] }))}
                  min={0}
                  max={2000}
                  step={50}
                  className="py-4"
                />
                <p className="text-xs text-gray-500 mt-2">
                  Joining fee is paid upfront to join the table
                </p>
              </div>

              {/* Summary */}
              {selectedEvent && (
                <div className="sec-card rounded-2xl p-4 mt-6">
                  <h3 className="font-semibold mb-3">Table Summary</h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Event</span>
                      <span>{selectedEvent.title}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Table Name</span>
                      <span>{formData.name || 'Not set'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Max Guests</span>
                      <span>{formData.max_guests} people</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Min Spend</span>
                      <span style={{ color: 'var(--sec-accent)' }}>R{formData.min_spend.toLocaleString()}</span>
                    </div>
                    {formData.joining_fee > 0 && (
                      <div className="flex justify-between">
                        <span className="text-gray-500">Joining Fee</span>
                        <span>R{formData.joining_fee.toLocaleString()}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-gray-500">Per Person (approx)</span>
                      <span>R{Math.ceil(formData.min_spend / formData.max_guests).toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Bottom Actions */}
      <div style={{ position: 'fixed', bottom: 'calc(64px + env(safe-area-inset-bottom))', left: 0, right: 0, padding: 16, backgroundColor: 'rgba(0,0,0,0.95)', backdropFilter: 'blur(16px)', borderTop: '1px solid var(--sec-border)' }}>
        <div className="flex gap-3 max-w-md mx-auto">
          {step > 1 && (
            <Button
              onClick={() => setStep(step - 1)}
              variant="outline"
              className="sec-btn sec-btn-secondary h-14 px-6 rounded-xl"
            >
              <ChevronLeft className="w-5 h-5" />
            </Button>
          )}
          
          {step < 3 ? (
            <Button
              onClick={() => {
                if (step === 1 && formData.event_id) {
                  setStep(2);
                } else if (step === 2 && formData.name && !atTableCapacity) {
                  setStep(3);
                }
              }}
              disabled={
                (step === 1 && !formData.event_id) ||
                (step === 2 && (!formData.name || atTableCapacity))
              }
              style={{ flex: 1, height: 56, borderRadius: 12, backgroundColor: 'var(--sec-text-primary)', color: 'var(--sec-bg-base)', fontWeight: 600 }}
              className="disabled:opacity-50"
            >
              Continue
              <ChevronRight className="w-5 h-5 ml-2" />
            </Button>
          ) : (
            <Button
              onClick={handleSubmit}
              disabled={isSubmitting || !formData.name}
              style={{ flex: 1, height: 56, borderRadius: 12, backgroundColor: 'var(--sec-accent)', color: 'var(--sec-bg-base)', fontWeight: 600 }}
              className="disabled:opacity-50"
            >
              {isSubmitting ? 'Creating...' : 'Create Table'}
              {!isSubmitting && <Check className="w-5 h-5 ml-2" />}
            </Button>
          )}
        </div>
      </div>

      {/* Success Dialog */}
      <Dialog open={showSuccessDialog} onOpenChange={() => {
        setShowSuccessDialog(false);
        navigate(createPageUrl(`TableDetails?id=${createdTable?.id}`));
      }}>
        <DialogContent className="max-w-md" style={{ backgroundColor: 'var(--sec-bg-card)', borderColor: 'var(--sec-border)' }}>
          <DialogHeader>
            <DialogTitle>Table Created! 🎉</DialogTitle>
            <DialogDescription>
              Your table is ready. Invite friends to join!
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div style={{ padding: 16, borderRadius: 12, backgroundColor: 'var(--sec-accent-muted)', border: '1px solid var(--sec-accent-border)' }}>
              <p className="font-bold text-lg mb-1">{formData.name}</p>
              <p className="text-sm text-gray-400">at {selectedEvent?.title}</p>
              <div className="flex items-center gap-4 mt-3 text-sm">
                <span className="flex items-center gap-1.5">
                  <Users size={16} strokeWidth={1.5} style={{ color: 'var(--sec-accent)' }} />
                  {formData.max_guests} spots
                </span>
                <span className="flex items-center gap-1.5">
                  <DollarSign size={16} strokeWidth={1.5} style={{ color: 'var(--sec-accent)' }} />
                  R{formData.min_spend.toLocaleString()} min
                </span>
              </div>
            </div>

            <div>
              <Label className="text-sm text-gray-400 mb-2 block">Share Link</Label>
              <div className="flex items-center gap-2 p-3 rounded-xl" style={{ backgroundColor: 'var(--sec-bg-base)', border: '1px solid var(--sec-border)' }}>
                <LinkIcon className="w-4 h-4 text-gray-500 flex-shrink-0" />
                <input
                  type="text"
                  value={createdTable ? `${window.location.origin}${createPageUrl('TableDetails')}?id=${createdTable.id}` : ''}
                  readOnly
                  className="flex-1 bg-transparent text-sm outline-none overflow-hidden text-ellipsis"
                />
                <Button
                  size="sm"
                  onClick={copyLink}
                  style={{ backgroundColor: 'var(--sec-text-primary)', color: 'var(--sec-bg-base)', flexShrink: 0 }}
                >
                  {copiedLink ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>
              {copiedLink && (
                <p className="text-xs mt-2 text-center" style={{ color: 'var(--sec-accent)' }}>✓ Link copied!</p>
              )}
            </div>
          </div>
          <div className="flex gap-3">
            <Button
              onClick={handleShare}
              variant="outline"
              className="sec-btn sec-btn-secondary flex-1"
            >
              <Share2 className="w-4 h-4 mr-2" />
              Share
            </Button>
            <Button
              onClick={() => navigate(createPageUrl(`TableDetails?id=${createdTable?.id}`))}
              style={{ flex: 1, backgroundColor: 'var(--sec-accent)', color: 'var(--sec-bg-base)' }}
            >
              View Table
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}