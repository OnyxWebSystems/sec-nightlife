import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import * as authService from '@/services/authService';
import { apiGet, apiPost } from '@/api/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, Loader2, UserPlus, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import HostedTableCard from '@/components/home/HostedTableCard';
import HostedTableJoinWizard from '@/components/tables/HostedTableJoinWizard';
import InviteFriendsDialog from '@/components/tables/InviteFriendsDialog';
import { launchPaystackInline } from '@/lib/paystackInline';
import { completePaystackCheckout } from '@/lib/completePaystackCheckout';
import { getEventImage } from '@/lib/placeholders';

const TABLE_BOOST_ZAR = 200;

export default function EventHostTables() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const eventId = searchParams.get('eventId') || '';
  const hostUserId = searchParams.get('hostUserId') || '';
  const queryClient = useQueryClient();
  const [user, setUser] = useState(null);
  const [inviteTable, setInviteTable] = useState(null);
  const [joinTarget, setJoinTarget] = useState(null);
  const [isJoining, setIsJoining] = useState(false);

  useEffect(() => {
    authService.getCurrentUser().then(setUser).catch(() => setUser(null));
  }, []);

  const { data, isLoading } = useQuery({
    queryKey: ['host-at-event', eventId, hostUserId],
    queryFn: () => {
      const q = new URLSearchParams({ hostUserId });
      if (eventId) q.set('eventId', eventId);
      return apiGet(`/api/host/tables/host-at-event?${q.toString()}`);
    },
    enabled: !!hostUserId,
  });

  const host = data?.host;
  const event = data?.event;
  const tables = data?.tables || [];
  const venueMenu = data?.venue_menu || [];
  const entranceZar = Number(data?.entrance_zar ?? 0);
  const isOwnHost = user?.id && hostUserId && user.id === hostUserId;

  const joinFeesForTable = (table) => {
    const joinZar = table?.hasJoiningFee && Number(table?.joiningFee || 0) > 0 ? Number(table.joiningFee) : 0;
    return { joinZar, totalOnline: entranceZar + joinZar };
  };

  const executeJoin = async (tableId, menuPayload = []) => {
    try {
      setIsJoining(true);
      const u = await authService.getCurrentUser();
      if (!u) {
        authService.redirectToLogin();
        return;
      }
      const body = menuPayload.length ? { selectedMenuItems: menuPayload } : {};
      const res = await apiPost(`/api/host/tables/${tableId}/join`, body);
      if (res?.pending || res?.pending_approval) {
        toast.success('Request sent to the host');
        setJoinTarget(null);
        queryClient.invalidateQueries({ queryKey: ['host-at-event', eventId, hostUserId] });
        return;
      }
      if (res?.authorization_url || (res?.pendingPayment && res?.reference)) {
        await launchPaystackInline({
          authorizationUrl: res.authorization_url,
          accessCode: res.access_code,
          reference: res.reference,
          onSuccess: async (payload) => {
            await completePaystackCheckout({
              reference: res.reference,
              payload,
              queryClient,
              showToasts: false,
            });
            toast.success('You joined the table');
            setJoinTarget(null);
            queryClient.invalidateQueries({ queryKey: ['host-at-event', eventId, hostUserId] });
            queryClient.invalidateQueries({ queryKey: ['home-table-offerings'] });
          },
        });
        return;
      }
      toast.success('You joined the table');
      setJoinTarget(null);
      queryClient.invalidateQueries({ queryKey: ['host-at-event', eventId, hostUserId] });
      queryClient.invalidateQueries({ queryKey: ['home-table-offerings'] });
    } catch (e) {
      toast.error(e?.data?.error || e.message || 'Could not join');
    } finally {
      setIsJoining(false);
    }
  };

  const openJoinWizard = async (table) => {
    try {
      const u = await authService.getCurrentUser();
      if (!u) {
        authService.redirectToLogin();
        return;
      }
      setJoinTarget(table);
    } catch {
      authService.redirectToLogin();
    }
  };

  const boostTable = async (tableId) => {
    try {
      const pay = await apiPost(`/api/host/tables/${tableId}/boost`, {});
      if (pay?.authorization_url) {
        await launchPaystackInline({
          authorizationUrl: pay.authorization_url,
          accessCode: pay.access_code,
          reference: pay.reference,
          onSuccess: async (payload) => {
            await completePaystackCheckout({
              reference: pay.reference,
              payload,
              queryClient,
              showToasts: false,
            });
            toast.success('Table boosted for 7 days');
            queryClient.invalidateQueries({ queryKey: ['host-at-event', eventId, hostUserId] });
            queryClient.invalidateQueries({ queryKey: ['home-table-offerings'] });
          },
        });
      }
    } catch (e) {
      toast.error(e?.data?.error || e.message || 'Boost failed');
    }
  };

  if (!hostUserId) {
    return (
      <div className="event-host-tables-page" style={{ padding: 24, maxWidth: 640, margin: '0 auto' }}>
        <p>Missing host information.</p>
        <Link to={createPageUrl('Home')} className="sec-btn sec-btn-ghost sec-btn-md" style={{ marginTop: 12, display: 'inline-flex' }}>
          Back home
        </Link>
      </div>
    );
  }

  const joinTargetFees = joinTarget ? joinFeesForTable(joinTarget) : { joinZar: 0, totalOnline: 0 };

  return (
    <div
      className="event-host-tables-page"
      style={{
        minHeight: '100vh',
        backgroundColor: 'var(--sec-bg-base)',
        paddingBottom: 'max(48px, env(safe-area-inset-bottom))',
      }}
    >
      <div
        style={{
          position: 'relative',
          minHeight: 'clamp(180px, 32vw, 280px)',
          backgroundImage: `url(${getEventImage(event?.cover_image_url)})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(180deg, rgba(0,0,0,0.25), rgba(0,0,0,0.94))',
          }}
        />
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="absolute top-4 left-4 sec-btn sec-btn-ghost sec-btn-md"
          style={{
            borderRadius: '50%',
            width: 44,
            height: 44,
            padding: 0,
            backdropFilter: 'blur(8px)',
          }}
          aria-label="Back"
        >
          <ChevronLeft size={22} />
        </button>
        <div
          style={{
            position: 'absolute',
            bottom: 20,
            left: 'max(16px, env(safe-area-inset-left))',
            right: 'max(16px, env(safe-area-inset-right))',
            maxWidth: 720,
            margin: '0 auto',
          }}
        >
          <p
            style={{
              fontSize: 12,
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              color: 'rgba(255,255,255,0.6)',
              fontWeight: 600,
            }}
          >
            {event?.title || 'Hosted tables'}
          </p>
          <h1 style={{ fontSize: 'clamp(1.5rem, 4vw, 2rem)', fontWeight: 700, color: '#fff', marginTop: 6, lineHeight: 1.2 }}>
            {host?.username ? `@${host.username}` : host?.fullName || 'Host'}
          </h1>
          {event?.city && (
            <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.72)', marginTop: 6 }}>{event.city}</p>
          )}
        </div>
      </div>

      <div
        style={{
          padding: '20px max(16px, env(safe-area-inset-left)) max(24px, env(safe-area-inset-right))',
          maxWidth: 720,
          margin: '0 auto',
          width: '100%',
        }}
      >
        {isLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 64 }}>
            <Loader2 className="animate-spin" size={32} />
          </div>
        ) : tables.length === 0 ? (
          <div
            style={{
              textAlign: 'center',
              padding: '48px 20px',
              borderRadius: 16,
              border: '1px solid var(--sec-border)',
              background: 'var(--sec-bg-card)',
            }}
          >
            <p style={{ color: 'var(--sec-text-muted)', fontSize: 15 }}>No open tables from this host right now.</p>
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))',
              gap: 16,
            }}
          >
            {tables.map((table) => {
              const showInvite = isOwnHost || table.memberCount > 0;
              const showBoost = isOwnHost && !table.boosted;
              const footer =
                showInvite || showBoost || table.boosted ? (
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 10,
                    }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {showInvite && (
                        <button
                          type="button"
                          className="sec-btn sec-btn-secondary sec-btn-lg sec-btn-full"
                          onClick={() =>
                            setInviteTable({
                              id: table.id,
                              members: [],
                              is_public: table.isPublic,
                            })
                          }
                        >
                          <UserPlus size={18} className="inline mr-2" />
                          Invite friends
                        </button>
                      )}
                      {showBoost && (
                        <button
                          type="button"
                          className="sec-btn sec-btn-primary sec-btn-lg sec-btn-full"
                          onClick={() => boostTable(table.id)}
                        >
                          <Sparkles size={18} className="inline mr-2" />
                          Boost R{TABLE_BOOST_ZAR}
                        </button>
                      )}
                    </div>
                    {table.boosted && (
                      <span className="text-sm text-center font-medium" style={{ color: 'var(--sec-accent-bright)' }}>Promoted table</span>
                    )}
                  </div>
                ) : null;

              return (
                <HostedTableCard
                  key={table.id}
                  layout="page"
                  table={{
                    ...table,
                    host,
                    event: event
                      ? {
                          id: event.id,
                          title: event.title,
                          date: event.date,
                          city: event.city,
                        }
                      : null,
                    joinedCount: Math.max(0, (table.guestQuantity || 0) - (table.spotsRemaining || 0)),
                  }}
                  onJoin={openJoinWizard}
                  footer={footer}
                />
              );
            })}
          </div>
        )}

        {eventId && (
          <Link
            to={createPageUrl(`EventDetails?id=${eventId}`)}
            className="sec-btn sec-btn-ghost sec-btn-lg sec-btn-full"
            style={{
              display: 'flex',
              marginTop: 24,
              textAlign: 'center',
              textDecoration: 'none',
              minHeight: 48,
            }}
          >
            View full event
          </Link>
        )}
      </div>

      <HostedTableJoinWizard
        open={!!joinTarget}
        onOpenChange={(open) => !open && !isJoining && setJoinTarget(null)}
        tableName={joinTarget?.tableName || 'this table'}
        venueMenu={venueMenu}
        entranceZar={entranceZar}
        joinZar={joinTargetFees.joinZar}
        totalOnline={joinTargetFees.totalOnline}
        isProcessing={isJoining}
        onConfirm={(menuPayload) => joinTarget && executeJoin(joinTarget.id, menuPayload)}
      />

      {inviteTable && (
        <InviteFriendsDialog
          open={!!inviteTable}
          onOpenChange={(open) => !open && setInviteTable(null)}
          table={inviteTable}
          event={event}
          source="hosted"
        />
      )}
    </div>
  );
}
