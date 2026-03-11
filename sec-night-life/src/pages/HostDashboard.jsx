import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import * as authService from '@/services/authService';
import { dataService } from '@/services/dataService';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Users, Settings, MessageCircle, ChevronRight, Calendar, Clock, TrendingUp, AlertCircle, Plus, Building } from 'lucide-react';
import SecLogo from '@/components/ui/SecLogo';
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format, parseISO } from 'date-fns';
import { motion } from 'framer-motion';

export default function HostDashboard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [user, setUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);

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

  const { data: hostedTables = [] } = useQuery({
    queryKey: ['hosted-tables', user?.id],
    queryFn: async () => {
      const tables = await dataService.Table.filter({ host_user_id: user.id });
      return tables;
    },
    enabled: !!user?.id,
  });

  const { data: venueEvents = [] } = useQuery({
    queryKey: ['venue-events'],
    queryFn: () => dataService.Event.filter({ status: 'published' }),
  });

  const { data: myHostEvents = [] } = useQuery({
    queryKey: ['my-host-events', user?.id],
    queryFn: () => dataService.HostEvent.filter({ host_user_id: user.id }),
    enabled: !!user?.id,
  });

  const eventsMap = venueEvents.reduce((acc, event) => {
    acc[event.id] = event;
    return acc;
  }, {});

  const acceptRequestMutation = useMutation({
    mutationFn: async ({ tableId, userId }) => {
      const tables = await dataService.Table.filter({ id: tableId });
      const table = tables[0];
      
      const updatedMembers = table.members.map(m => 
        m.user_id === userId ? { ...m, status: 'confirmed' } : m
      );
      const updatedPending = table.pending_requests.filter(id => id !== userId);
      
      await dataService.Table.update(tableId, {
        members: updatedMembers,
        pending_requests: updatedPending,
        current_guests: (table.current_guests || 1) + 1
      });

      await dataService.Notification.create({
        user_id: userId,
        type: 'table_invite',
        title: 'Request Accepted!',
        message: `You've been accepted to join "${table.name}"`,
        data: { table_id: tableId },
        action_url: createPageUrl(`TableDetails?id=${tableId}`)
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['hosted-tables']);
    },
  });

  const rejectRequestMutation = useMutation({
    mutationFn: async ({ tableId, userId }) => {
      const tables = await dataService.Table.filter({ id: tableId });
      const table = tables[0];
      
      const updatedMembers = table.members.filter(m => m.user_id !== userId);
      const updatedPending = table.pending_requests.filter(id => id !== userId);
      
      await dataService.Table.update(tableId, {
        members: updatedMembers,
        pending_requests: updatedPending
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['hosted-tables']);
    },
  });

  const activeTables = hostedTables.filter(t => t.status === 'open' || t.status === 'full');
  const completedTables = hostedTables.filter(t => t.status === 'completed');
  const totalPendingRequests = hostedTables.reduce((sum, t) => sum + (t.pending_requests?.length || 0), 0);
  const totalGuests = hostedTables.reduce((sum, t) => sum + (t.current_guests || 1), 0);

  if (!user || !userProfile) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--sec-bg-base)' }}>
        <div className="sec-spinner" />
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', paddingBottom: 32, backgroundColor: 'var(--sec-bg-base)' }}>
      <header style={{ position: 'sticky', top: 0, zIndex: 40, backgroundColor: 'rgba(0,0,0,0.92)', backdropFilter: 'blur(16px)', borderBottom: '1px solid var(--sec-border)' }}>
        <div style={{ padding: 'var(--space-4) var(--space-6)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <SecLogo size={36} variant="full" />
              </div>
              <div>
                <h1 style={{ fontSize: 20, fontWeight: 600, color: 'var(--sec-text-primary)' }}>Host Dashboard</h1>
                <p style={{ fontSize: 13, color: 'var(--sec-text-muted)' }}>Manage your tables</p>
              </div>
            </div>
            <Link to={createPageUrl('CreateTable')} className="sec-btn sec-btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 20px', textDecoration: 'none' }}>
              <Plus size={18} strokeWidth={1.5} />
              New Table
            </Link>
          </div>
        </div>
      </header>

      <div style={{ padding: 'var(--space-6)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 16 }}>
          <div className="sec-card" style={{ padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: 'var(--sec-accent-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Users size={20} strokeWidth={1.5} style={{ color: 'var(--sec-accent)' }} />
              </div>
              <div>
                <p style={{ fontSize: 24, fontWeight: 700, color: 'var(--sec-text-primary)' }}>{activeTables.length}</p>
                <p style={{ fontSize: 12, color: 'var(--sec-text-muted)' }}>Active Tables</p>
              </div>
            </div>
          </div>

          <div className="sec-card" style={{ padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: 'var(--sec-bg-elevated)', border: '1px solid var(--sec-border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Clock size={20} strokeWidth={1.5} style={{ color: 'var(--sec-accent)' }} />
              </div>
              <div>
                <p style={{ fontSize: 24, fontWeight: 700, color: 'var(--sec-text-primary)' }}>{totalPendingRequests}</p>
                <p style={{ fontSize: 12, color: 'var(--sec-text-muted)' }}>Pending Requests</p>
              </div>
            </div>
          </div>

          <div className="sec-card" style={{ padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: 'var(--sec-bg-elevated)', border: '1px solid var(--sec-border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Users size={20} strokeWidth={1.5} style={{ color: 'var(--sec-silver)' }} />
              </div>
              <div>
                <p style={{ fontSize: 24, fontWeight: 700, color: 'var(--sec-text-primary)' }}>{totalGuests}</p>
                <p style={{ fontSize: 12, color: 'var(--sec-text-muted)' }}>Total Guests</p>
              </div>
            </div>
          </div>

          <div className="sec-card" style={{ padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: 'var(--sec-accent-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <TrendingUp size={20} strokeWidth={1.5} style={{ color: 'var(--sec-accent)' }} />
              </div>
              <div>
                <p style={{ fontSize: 24, fontWeight: 700, color: 'var(--sec-text-primary)' }}>{hostedTables.length}</p>
                <p style={{ fontSize: 12, color: 'var(--sec-text-muted)' }}>Total Hosted</p>
              </div>
            </div>
          </div>
        </div>

        {/* My Host Events (informal: house parties, boat parties, etc.) */}
        <div className="sec-card" style={{ padding: 20, marginTop: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <h2 style={{ fontSize: 18, fontWeight: 600, color: 'var(--sec-text-primary)' }}>My Host Events</h2>
            <Link to={createPageUrl('CreateHostEvent')} className="sec-btn sec-btn-ghost" style={{ padding: '8px 12px', fontSize: 13, textDecoration: 'none' }}>
              <Plus size={14} strokeWidth={1.5} style={{ marginRight: 6, verticalAlign: 'middle' }} />
              Create
            </Link>
          </div>
          {myHostEvents.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {myHostEvents.slice(0, 5).map((ev) => (
                <div key={ev.id} className="sec-card" style={{ padding: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <p style={{ fontWeight: 600, color: 'var(--sec-text-primary)' }}>{ev.title}</p>
                    <p style={{ fontSize: 13, color: 'var(--sec-text-muted)' }}>
                      {ev.city || ev.location || 'TBA'} • {format(parseISO(ev.date), 'MMM d, yyyy')}
                    </p>
                  </div>
                  <span className={`sec-badge ${ev.status === 'published' ? 'sec-badge-success' : 'sec-badge-muted'}`}>{ev.status}</span>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: 24 }}>
              <Calendar size={32} strokeWidth={1.5} style={{ color: 'var(--sec-text-muted)', marginBottom: 12 }} />
              <p style={{ fontSize: 14, color: 'var(--sec-text-muted)', marginBottom: 16 }}>Host house parties, boat parties & more</p>
              <Link to={createPageUrl('CreateHostEvent')} className="sec-btn sec-btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 20px', textDecoration: 'none' }}>
                <Plus size={16} strokeWidth={1.5} />
                Create Host Event
              </Link>
            </div>
          )}
        </div>

        {/* Register Venue — for hosts who want to list venues and create events */}
        <Link
          to={createPageUrl('VenueOnboarding')}
          className="sec-card"
          style={{ display: 'flex', alignItems: 'center', gap: 16, padding: 20, marginTop: 24, textDecoration: 'none' }}
        >
          <div
            style={{ width: 48, height: 48, borderRadius: 12, backgroundColor: '#000000', border: '2px solid var(--sec-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <Building size={24} strokeWidth={1.5} style={{ color: 'var(--sec-accent)' }} />
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ fontWeight: 600, fontSize: 16, color: 'var(--sec-text-primary)', marginBottom: 4 }}>Register a Venue</p>
            <p style={{ fontSize: 13, color: 'var(--sec-text-muted)' }}>List your nightclub or event company on Sec</p>
          </div>
          <ChevronRight size={20} strokeWidth={1.5} style={{ color: 'var(--sec-text-muted)' }} />
        </Link>

        {totalPendingRequests > 0 && (
          <div className="sec-card" style={{ padding: 16, marginTop: 24, borderColor: 'var(--sec-accent-border)', backgroundColor: 'var(--sec-accent-muted)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <AlertCircle size={20} strokeWidth={1.5} style={{ color: 'var(--sec-accent)' }} />
            <p style={{ fontSize: 14, color: 'var(--sec-text-primary)' }}>
              You have <span style={{ fontWeight: 600 }}>{totalPendingRequests}</span> pending request{totalPendingRequests > 1 ? 's' : ''} to review
            </p>
            </div>
          </div>
        )}

        <Tabs defaultValue="active" style={{ width: '100%', marginTop: 24 }}>
          <TabsList style={{ width: '100%', backgroundColor: 'var(--sec-bg-card)', border: '1px solid var(--sec-border)' }} className="sec-card">
            <TabsTrigger value="active" className="flex-1">Active ({activeTables.length})</TabsTrigger>
            <TabsTrigger value="completed" className="flex-1">Completed ({completedTables.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="active" className="mt-6 space-y-4">
            {activeTables.length > 0 ? (
              activeTables.map((table, index) => {
                const event = eventsMap[table.event_id];
                const pendingCount = table.pending_requests?.length || 0;
                
                return (
                  <motion.div
                    key={table.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className="sec-card p-4"
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex-1">
                        <h3 className="font-bold text-lg mb-1">{table.name}</h3>
                        {event && (
                          <p className="text-sm text-gray-400 flex items-center gap-2">
                            <Calendar className="w-4 h-4" />
                            {event.title} • {format(parseISO(event.date), 'MMM d')}
                          </p>
                        )}
                      </div>
                      <span className={`sec-badge ${table.status === 'open' ? 'sec-badge-success' : table.status === 'full' ? 'sec-badge-gold' : 'sec-badge-muted'}`}>
                        {table.status}
                      </span>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }}>
                      <div className="sec-card" style={{ padding: 12, textAlign: 'center' }}>
                        <p style={{ fontSize: 20, fontWeight: 700, color: 'var(--sec-accent)' }}>{table.current_guests || 1}/{table.max_guests}</p>
                        <p style={{ fontSize: 12, color: 'var(--sec-text-muted)' }}>Guests</p>
                      </div>
                      <div className="sec-card" style={{ padding: 12, textAlign: 'center' }}>
                        <p style={{ fontSize: 20, fontWeight: 700, color: 'var(--sec-text-primary)' }}>{pendingCount}</p>
                        <p style={{ fontSize: 12, color: 'var(--sec-text-muted)' }}>Pending</p>
                      </div>
                      <div className="sec-card" style={{ padding: 12, textAlign: 'center' }}>
                        <p style={{ fontSize: 20, fontWeight: 700, color: 'var(--sec-text-primary)' }}>R{(table.min_spend || 0).toLocaleString()}</p>
                        <p style={{ fontSize: 12, color: 'var(--sec-text-muted)' }}>Min Spend</p>
                      </div>
                    </div>

                    {/* Pending Requests */}
                    {pendingCount > 0 && (
                      <div className="sec-card" style={{ marginBottom: 16, padding: 12, borderColor: 'var(--sec-accent-border)' }}>
                        <p style={{ fontSize: 13, fontWeight: 500, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                          <AlertCircle size={16} strokeWidth={1.5} />
                          {pendingCount} Pending Request{pendingCount > 1 ? 's' : ''}
                        </p>
                        <Link
                          to={createPageUrl(`ManageTable?id=${table.id}`)}
                          className="sec-link"
                        >
                          Review requests →
                        </Link>
                      </div>
                    )}

                    <div style={{ display: 'flex', gap: 8 }}>
                      <Link
                        to={createPageUrl(`ManageTable?id=${table.id}`)}
                        className="sec-btn sec-btn-primary"
                        style={{ flex: 1, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, textDecoration: 'none' }}
                      >
                        <Settings size={16} strokeWidth={1.5} />
                        Manage
                      </Link>
                      <Link to={createPageUrl(`ChatRoom?table=${table.id}`)} className="sec-btn sec-btn-ghost" style={{ height: 40, width: 40, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' }}>
                        <MessageCircle size={18} strokeWidth={1.5} />
                      </Link>
                      <Link to={createPageUrl(`TableDetails?id=${table.id}`)} className="sec-btn sec-btn-ghost" style={{ height: 40, width: 40, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' }}>
                        <ChevronRight size={18} strokeWidth={1.5} />
                      </Link>
                    </div>
                  </motion.div>
                );
              })
            ) : (
              <div style={{ textAlign: 'center', padding: '48px 24px' }}>
                <div style={{ width: 72, height: 72, borderRadius: '50%', backgroundColor: 'var(--sec-bg-card)', border: '1px solid var(--sec-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                  <Users size={32} strokeWidth={1.5} style={{ color: 'var(--sec-text-muted)' }} />
                </div>
                <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8, color: 'var(--sec-text-primary)' }}>No active tables</h3>
                <p style={{ fontSize: 14, color: 'var(--sec-text-muted)', marginBottom: 24 }}>Create your first table to start hosting</p>
                <Link to={createPageUrl('CreateTable')} className="sec-btn sec-btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '12px 24px', textDecoration: 'none' }}>
                  <Plus size={18} strokeWidth={1.5} />
                  Create Table
                </Link>
              </div>
            )}
          </TabsContent>

          <TabsContent value="completed" className="mt-6 space-y-4">
            {completedTables.length > 0 ? (
              completedTables.map((table, index) => {
                const event = eventsMap[table.event_id];
                const totalContributions = table.members?.reduce((sum, m) => sum + (m.contribution || 0), 0) || 0;
                
                return (
                  <motion.div
                    key={table.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className="sec-card p-4"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <h3 className="font-bold mb-1">{table.name}</h3>
                        {event && (
                          <p className="text-sm text-gray-400">
                            {event.title} • {format(parseISO(event.date), 'MMM d, yyyy')}
                          </p>
                        )}
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                      <div className="sec-card" style={{ padding: 12, textAlign: 'center' }}>
                        <p style={{ fontSize: 18, fontWeight: 700, color: 'var(--sec-text-primary)' }}>{table.current_guests || 0}</p>
                        <p style={{ fontSize: 12, color: 'var(--sec-text-muted)' }}>Guests</p>
                      </div>
                      <div className="sec-card" style={{ padding: 12, textAlign: 'center' }}>
                        <p style={{ fontSize: 18, fontWeight: 700, color: 'var(--sec-accent)' }}>R{totalContributions.toLocaleString()}</p>
                        <p style={{ fontSize: 12, color: 'var(--sec-text-muted)' }}>Total Spent</p>
                      </div>
                      <div className="sec-card" style={{ padding: 12, textAlign: 'center' }}>
                        <p style={{ fontSize: 18, fontWeight: 700, color: 'var(--sec-text-primary)' }}>R{(table.current_spend || 0).toLocaleString()}</p>
                        <p style={{ fontSize: 12, color: 'var(--sec-text-muted)' }}>Actual</p>
                      </div>
                    </div>
                  </motion.div>
                );
              })
            ) : (
              <div style={{ textAlign: 'center', padding: '48px 24px' }}>
                <TrendingUp size={40} strokeWidth={1.5} style={{ color: 'var(--sec-text-muted)', margin: '0 auto 12px' }} />
                <p style={{ color: 'var(--sec-text-muted)' }}>No completed tables yet</p>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}