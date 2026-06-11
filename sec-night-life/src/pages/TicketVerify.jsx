import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  isLikelyOffline,
  loadTicketVerifySnapshot,
  saveTicketVerifySnapshot,
} from '@/lib/ticketOfflineCache';
import { useSearchParams, Link } from 'react-router-dom';
import { apiGet, apiPost } from '@/api/client';
import { createPageUrl } from '@/utils';
import { format, parseISO } from 'date-fns';
import { CheckCircle2, XCircle, Loader2, Copy, MapPin, Building2, Users, CalendarDays, UserCheck } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/lib/AuthContext';
import { Button } from '@/components/ui/button';

function formatWhen(iso) {
  if (!iso) return null;
  try {
    return format(parseISO(iso), 'EEE, MMM d, yyyy HH:mm');
  } catch {
    return null;
  }
}

export default function TicketVerify() {
  const [params] = useSearchParams();
  const token = params.get('token');
  const queryKey = useMemo(() => params.toString(), [params]);
  const hintVenue = params.get('vn');
  const hintAt = params.get('at');
  const hintTimeLabel = hintAt ? formatWhen(hintAt) : null;
  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(true);
  const { isAuthenticated } = useAuth();
  const [admitting, setAdmitting] = useState(false);
  const [onlineNonce, setOnlineNonce] = useState(0);

  useEffect(() => {
    const onUp = () => setOnlineNonce((n) => n + 1);
    window.addEventListener('online', onUp);
    return () => window.removeEventListener('online', onUp);
  }, []);

  const fetchVerify = useCallback(async () => {
    if (!token) return null;
    const qs = new URLSearchParams();
    qs.set('token', token);
    const search = new URLSearchParams(queryKey);
    const vn = search.get('vn');
    const at = search.get('at');
    if (vn) qs.set('vn', vn);
    if (at) qs.set('at', at);
    return apiGet(`/api/tickets/qr?${qs.toString()}`, { skipAuth: true });
  }, [token, queryKey]);

  useEffect(() => {
    if (!token) {
      setPayload({ valid: false, reason: 'Missing ticket link. Open the QR from the SEC app again.' });
      setLoading(false);
      return;
    }
    setLoading(true);
    let cancelled = false;

    if (isLikelyOffline()) {
      const snap = loadTicketVerifySnapshot(token);
      if (snap) {
        const rest = { ...snap };
        delete rest._offline_cached;
        delete rest._verify_refresh_failed;
        if (!cancelled) {
          setPayload({ ...rest, _offline_cached: true });
          setLoading(false);
        }
      } else if (!cancelled) {
        setPayload({
          valid: false,
          reason:
            'You appear to be offline. Open this link once with internet so this device can save your ticket, or show staff the QR image from your confirmation email (it stays available offline in most mail apps).',
          _offline_no_cache: true,
        });
        setLoading(false);
      }
      return () => {
        cancelled = true;
      };
    }

    (async () => {
      try {
        const res = await fetchVerify();
        if (!cancelled && res) {
          setPayload(res);
          saveTicketVerifySnapshot(token, res);
        }
      } catch (e) {
        if (!cancelled) {
          const d = e?.data && typeof e.data === 'object' ? e.data : {};
          const merged = {
            valid: false,
            reason: d.reason || e?.message || 'Could not verify this ticket.',
            ...d,
          };
          if (Object.keys(d).length > 0) saveTicketVerifySnapshot(token, merged);
          const snap = loadTicketVerifySnapshot(token);
          if (snap && Object.keys(d).length === 0) {
            const rest = { ...snap };
            delete rest._offline_cached;
            delete rest._verify_refresh_failed;
            setPayload({ ...rest, _offline_cached: true, _verify_refresh_failed: true });
          } else {
            setPayload(merged);
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, queryKey, fetchVerify, onlineNonce]);

  const valid = payload?.valid === true;
  const expired = payload?.valid === false && payload?.reason === 'Ticket expired';

  const submitAdmit = async () => {
    if (!token) return;
    if (isLikelyOffline()) {
      toast.error('Recording entry requires an internet connection.');
      return;
    }
    setAdmitting(true);
    try {
      await apiPost('/api/tickets/admit', { qr_token: token });
      toast.success('Entry recorded');
      const res = await fetchVerify();
      if (res) {
        setPayload(res);
        saveTicketVerifySnapshot(token, res);
      }
    } catch (e) {
      toast.error(e?.message || 'Could not record entry');
    } finally {
      setAdmitting(false);
    }
  };

  const copySummary = async () => {
    const line = payload?.door_verify_summary || [
      payload?.holder_display_name,
      payload?.venue_name,
      payload?.event_title || payload?.title,
      payload?.table_allocation_label,
    ].filter(Boolean).join(' · ');
    if (!line) {
      toast.error('Nothing to copy');
      return;
    }
    try {
      await navigator.clipboard.writeText(line);
      toast.success('Copied for staff / radio');
    } catch {
      toast.error('Could not copy');
    }
  };

  return (
    <div
      className="min-h-[100dvh] flex flex-col items-center px-4 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(2rem,env(safe-area-inset-bottom))]"
      style={{ backgroundColor: 'var(--sec-bg-base, #050506)', color: 'var(--sec-text-primary, #fafafa)' }}
    >
      <img
        src="/sec-logo.png"
        alt="SEC"
        className="h-12 w-auto mb-6 object-contain"
        onError={(e) => {
          e.currentTarget.src = '/Logo/sec-email-logo-transparent.png';
        }}
      />

      {!loading && payload?._offline_cached && (
        <div
          className="w-full max-w-lg mb-4 rounded-xl border px-4 py-3 text-sm"
          style={{
            borderColor: 'rgba(251,191,36,0.4)',
            backgroundColor: 'rgba(251,191,36,0.08)',
            color: '#fcd34d',
          }}
        >
          {payload._verify_refresh_failed
            ? 'Could not reach SEC — showing the last ticket details saved on this device. Reconnect to refresh.'
            : 'Offline — showing ticket details saved on this device. Reconnect for the latest status.'}
        </div>
      )}

      {loading && (
        <div className="flex flex-col items-center gap-4 text-gray-400 my-auto w-full max-w-lg">
          <Loader2 className="w-10 h-10 animate-spin" />
          <p className="text-sm">Verifying ticket with SEC…</p>
          {(hintVenue || hintTimeLabel) && (
            <div
              className="w-full rounded-xl border p-4 text-left"
              style={{ borderColor: 'rgba(250,250,250,0.12)', backgroundColor: 'rgba(0,0,0,0.35)' }}
            >
              <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 mb-2">
                Printed on QR (quick glance)
              </p>
              {hintVenue && (
                <p className="text-lg font-bold text-white leading-snug">{hintVenue}</p>
              )}
              {hintTimeLabel && (
                <p className="text-sm text-gray-300 mt-1">Event time: {hintTimeLabel}</p>
              )}
              <p className="text-xs text-gray-500 mt-2">Wait for the green check — token is the source of truth.</p>
            </div>
          )}
        </div>
      )}

      {!loading && payload && (
        <div className="w-full max-w-lg space-y-4 my-auto">
          <div
            className="rounded-2xl border-2 p-5 sm:p-6"
            style={{
              backgroundColor: 'var(--sec-bg-elevated, #0f0f12)',
              borderColor: valid ? 'rgba(34,197,94,0.45)' : 'rgba(245,158,11,0.35)',
            }}
          >
            <div className="flex items-start gap-3 mb-5">
              {valid ? (
                <CheckCircle2 className="w-10 h-10 shrink-0 text-emerald-400" strokeWidth={2} />
              ) : (
                <XCircle className="w-10 h-10 shrink-0 text-amber-500" strokeWidth={2} />
              )}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1">
                  Door check
                </p>
                <h1 className="text-2xl sm:text-3xl font-bold leading-tight">
                  {valid ? 'Admit — ticket valid' : expired ? 'Do not admit — expired' : 'Do not admit'}
                </h1>
                {!valid && payload.reason && (
                  <p className="text-base text-gray-400 mt-2">{payload.reason}</p>
                )}
              </div>
            </div>

            {payload.printed_hints_mismatch && (
              <div
                className="rounded-xl border px-4 py-3 mb-4 text-sm"
                style={{
                  borderColor: 'rgba(251,191,36,0.45)',
                  backgroundColor: 'rgba(251,191,36,0.08)',
                  color: '#fcd34d',
                }}
              >
                The venue or time text in the link does not match this ticket record. Trust only the
                SEC-validated details below (not an edited screenshot or retyped URL).
              </div>
            )}

            {payload.host_instructions && (
              <p className="text-sm text-gray-400 leading-relaxed mb-4 border-l-2 border-emerald-500/50 pl-3">
                {payload.host_instructions}
              </p>
            )}

            {payload.event_starts_at && (
              <div
                className="rounded-xl border px-4 py-3 mb-4"
                style={{ borderColor: 'rgba(16,185,129,0.35)', backgroundColor: 'rgba(16,185,129,0.06)' }}
              >
                <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-400/90 mb-1">
                  Official event start (from ticket)
                </p>
                <p className="text-xl sm:text-2xl font-bold text-emerald-100">
                  {formatWhen(payload.event_starts_at) || '—'}
                </p>
              </div>
            )}

            {(payload.venue_name || payload.check_location_line) && (
              <div
                className="rounded-xl border p-4 mb-4"
                style={{
                  borderColor: 'rgba(250,250,250,0.12)',
                  backgroundColor: 'rgba(0,0,0,0.35)',
                }}
              >
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-emerald-400/90 mb-2">
                  <Building2 className="w-4 h-4" />
                  Match to your venue
                </div>
                <p className="text-xl sm:text-2xl font-bold leading-snug break-words">
                  {payload.venue_name || '—'}
                </p>
                {(payload.check_location_line || payload.venue_city) && (
                  <div className="flex items-start gap-2 mt-2 text-sm text-gray-400">
                    <MapPin className="w-4 h-4 shrink-0 mt-0.5" />
                    <span className="leading-relaxed">
                      {payload.check_location_line || payload.venue_city}
                    </span>
                  </div>
                )}
              </div>
            )}

            {(payload.event_title || payload.title) && (
              <div className="mb-4">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">
                  <CalendarDays className="w-3.5 h-3.5" />
                  Event
                </div>
                <p className="text-lg sm:text-xl font-semibold leading-snug">
                  {payload.event_title || payload.title}
                </p>
                {payload.event_title && payload.title && payload.title !== payload.event_title && (
                  <p className="text-sm text-gray-500 mt-1">{payload.title}</p>
                )}
              </div>
            )}

            {payload.table_allocation_label && (
              <div
                className="rounded-xl border p-4 mb-4"
                style={{ borderColor: 'var(--sec-border, #262629)', backgroundColor: 'rgba(255,255,255,0.03)' }}
              >
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
                  <Users className="w-4 h-4" />
                  Table / allocation
                </div>
                <p className="text-lg sm:text-xl font-bold text-white leading-snug">
                  {payload.table_allocation_label}
                </p>
              </div>
            )}

            {payload.holder_display_name && (
              <div className="mb-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">Guest name</div>
                <p className="text-2xl sm:text-3xl font-bold tracking-tight break-words">
                  {payload.holder_display_name}
                </p>
                {valid && (
                  <p className="text-sm text-gray-500 mt-2">
                    Ask for photo ID and confirm it matches this name before seating.
                  </p>
                )}
              </div>
            )}

            {payload.table_specs_summary && (
              <div className="mb-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">Booking details</div>
                <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-line">{payload.table_specs_summary}</p>
              </div>
            )}

            {(payload.quantity != null && payload.quantity > 1) && valid && (
              <p className="text-base text-amber-200/90 mb-3">
                Party size on this code: <strong>{payload.quantity}</strong> (verify headcount at door).
              </p>
            )}

            {valid && payload.already_admitted && (
              <div
                className="rounded-xl border px-4 py-3 mb-4 text-sm"
                style={{
                  borderColor: 'rgba(59,130,246,0.45)',
                  backgroundColor: 'rgba(59,130,246,0.1)',
                  color: '#93c5fd',
                }}
              >
                Entry already recorded in SEC
                {payload.admitted_at && (
                  <span className="block mt-1 text-xs text-blue-200/80">
                    {formatWhen(payload.admitted_at) || payload.admitted_at}
                  </span>
                )}
              </div>
            )}

            {valid && !payload.already_admitted && payload.can_admit_here && (
              <div className="mb-4 space-y-2">
                <Button
                  type="button"
                  className="w-full sm:w-auto gap-2 bg-emerald-600 hover:bg-emerald-500 text-white"
                  onClick={submitAdmit}
                  disabled={admitting || isLikelyOffline() || !!payload._offline_cached}
                >
                  {admitting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <UserCheck className="w-4 h-4" />
                  )}
                  Record entry
                </Button>
                <p className="text-xs text-gray-500 leading-relaxed">
                  Confirms check-in for this guest when the ticket is linked to an event. Use only after ID and
                  headcount checks.
                  {(isLikelyOffline() || payload._offline_cached) && (
                    <span className="block mt-1 text-amber-200/90">
                      Recording entry needs internet — not available while offline or on a saved-only copy.
                    </span>
                  )}
                </p>
              </div>
            )}

            {valid && !payload.already_admitted && !payload.can_admit_here && (
              <p className="text-xs text-gray-500 mb-4 leading-relaxed">
                {!payload.viewer_authenticated ? (
                  <>
                    Anyone can view this ticket by scanning the QR — no login required. Venue staff: sign in on this
                    device to record entry at the door.
                  </>
                ) : payload.admit_denied_for_viewer ? (
                  <>{payload.admit_denied_reason || 'This account cannot record entry for this ticket.'}</>
                ) : (
                  <>
                    Entry cannot be recorded from this screen right now. Reload the page to refresh, or confirm this
                    ticket is still valid and not already admitted elsewhere.
                  </>
                )}
              </p>
            )}

            {payload.door_verify_summary && (
              <div className="flex flex-col sm:flex-row gap-2 pt-3 border-t border-[#262629]">
                <button
                  type="button"
                  onClick={copySummary}
                  className="inline-flex items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-medium bg-white/10 hover:bg-white/15 border border-white/10"
                >
                  <Copy className="w-4 h-4" />
                  Copy door summary
                </button>
                <p className="text-xs text-gray-500 sm:flex-1 sm:self-center leading-relaxed">
                  Use for WhatsApp / radio handoff. Installed SEC app: same link can open the app when Universal Links are configured.
                </p>
              </div>
            )}

            {(payload.expires_at || payload.event_starts_at) && (
              <div className="text-xs text-gray-500 space-y-1 mt-4 pt-3 border-t border-[#262629]">
                {payload.event_starts_at && <p>Event start: {formatWhen(payload.event_starts_at) || '—'}</p>}
                {payload.expires_at && <p>Ticket valid until: {formatWhen(payload.expires_at) || '—'}</p>}
              </div>
            )}
          </div>
        </div>
      )}

      <Link
        to={createPageUrl('Home')}
        className="mt-auto pt-6 text-sm underline text-gray-500 hover:text-gray-300"
      >
        Back to SEC
      </Link>
    </div>
  );
}
