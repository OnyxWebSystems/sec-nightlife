import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import * as authService from '@/services/authService';
import { apiGet, apiPost } from '@/api/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, Loader2, UserPlus, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import HostedTableCard from '@/components/home/HostedTableCard';
import InviteFriendsDialog from '@/components/tables/InviteFriendsDialog';
import { launchPaystackInline, verifyPaystackReference } from '@/lib/paystackInline';
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
  const isOwnHost = user?.id && hostUserId && user.id === hostUserId;

  const joinHostedTable = async (tableId) => {
    try {
      const u = await authService.getCurrentUser();
      if (!u) {
        authService.redirectToLogin();
        return;
      }
      const res = await apiPost(`/api/host/tables/${tableId}/join`, {});
      if (res?.pending_approval) {
        toast.success('Request sent to the host');
        queryClient.invalidateQueries({ queryKey: ['host-at-event', eventId, hostUserId] });
        return;
      }
      if (res?.authorization_url) {
        await launchPaystackInline({
          authorizationUrl: res.authorization_url,
          accessCode: res.access_code,
          reference: res.reference,
          onSuccess: async (ref) => {
            await verifyPaystackReference(ref);
            toast.success('You joined the table');
            queryClient.invalidateQueries({ queryKey: ['host-at-event', eventId, hostUserId] });
            queryClient.invalidateQueries({ queryKey: ['home-table-offerings'] });
          },
        });
        return;
      }
      toast.success('You joined the table');
      queryClient.invalidateQueries({ queryKey: ['host-at-event', eventId, hostUserId] });
      queryClient.invalidateQueries({ queryKey: ['home-table-offerings'] });
    } catch (e) {
      toast.error(e?.data?.error || e.message || 'Could not join');
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
          onSuccess: async (ref) => {
            await verifyPaystackReference(ref);
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
      <div style={{ padding: 24 }}>
        <p>Missing host information.</p>
        <Link to={createPageUrl('Home')}>Back home</Link>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--sec-bg-base)', paddingBottom: 48 }}>
      <div
        style={{
          position: 'relative',
          height: 200,
          backgroundImage: `url(${getEventImage(event?.cover_image_url)})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(180deg, rgba(0,0,0,0.3), rgba(0,0,0,0.92))',
          }}
        />
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="absolute top-4 left-4 sec-btn sec-btn-ghost"
          style={{ borderRadius: '50%', width: 40, height: 40, padding: 0 }}
          aria-label="Back"
        >
          <ChevronLeft size={20} />
        </button>
        <div style={{ position: 'absolute', bottom: 16, left: 16, right: 16 }}>
          <p style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgba(255,255,255,0.55)' }}>
            {event?.title || 'Hosted tables'}
          </p>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#fff', marginTop: 4 }}>
            {host?.username ? `@${host.username}` : host?.fullName || 'Host'}
          </h1>
          {event?.city && (
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', marginTop: 4 }}>{event.city}</p>
          )}
        </div>
      </div>

      <div style={{ padding: '20px 16px', maxWidth: 640, margin: '0 auto' }}>
        {isLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
            <Loader2 className="animate-spin" />
          </div>
        ) : tables.length === 0 ? (
          <p style={{ color: 'var(--sec-text-muted)', textAlign: 'center', padding: 32 }}>
            No open tables from this host right now.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {tables.map((table) => (
              <div key={table.id}>
                <HostedTableCard
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
                  onJoin={() => joinHostedTable(table.id)}
                />
                <div className="flex gap-2 mt-2 px-1">
                  {(isOwnHost || table.memberCount > 0) && (
                    <button
                      type="button"
                      className="sec-btn sec-btn-secondary text-xs flex-1"
                      onClick={() =>
                        setInviteTable({
                          id: table.id,
                          members: [],
                          is_public: table.isPublic,
                        })
                      }
                    >
                      <UserPlus size={14} className="inline mr-1" />
                      Invite friends
                    </button>
                  )}
                  {isOwnHost && !table.boosted && (
                    <button
                      type="button"
                      className="sec-btn sec-btn-primary text-xs flex-1"
                      onClick={() => boostTable(table.id)}
                    >
                      <Sparkles size={14} className="inline mr-1" />
                      Boost R{TABLE_BOOST_ZAR}
                    </button>
                  )}
                  {table.boosted && (
                    <span className="text-xs text-amber-400 self-center px-2">Promoted</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {eventId && (
          <Link
            to={createPageUrl(`EventDetails?id=${eventId}`)}
            className="sec-btn sec-btn-ghost sec-btn-full mt-6"
            style={{ display: 'block', textAlign: 'center', textDecoration: 'none' }}
          >
            View full event
          </Link>
        )}
      </div>

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
