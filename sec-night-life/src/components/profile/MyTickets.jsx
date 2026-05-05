import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/api/client';
import { Card, CardContent } from "@/components/ui/card";
import { Ticket, Calendar } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { Button } from "@/components/ui/button";
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';

export default function MyTickets({ userId }) {
  const { data: tickets = [], isLoading } = useQuery({
    queryKey: ['my-tickets', userId],
    queryFn: () => apiGet('/api/tickets/my'),
    enabled: !!userId
  });

  if (isLoading) {
    return <div className="text-center py-8 text-gray-500">Loading tickets...</div>;
  }

  if (tickets.length === 0) {
    return (
      <div className="text-center py-12">
        <Ticket className="w-12 h-12 text-gray-600 mx-auto mb-3" />
        <p className="text-gray-500 mb-4">No tickets purchased yet</p>
        <Link to={createPageUrl('Events')}>
          <Button className="sec-btn-accent">
            Browse Events
          </Button>
        </Link>
      </div>
    );
  }

  const TicketCard = ({ ticket }) => {
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(
      `${window.location.origin}/api/tickets/qr?token=${ticket.qr_token}`,
    )}`;

    return (
      <Link to={ticket.event_id ? createPageUrl(`EventDetails?id=${ticket.event_id}`) : createPageUrl('Profile')}>
        <Card className="glass-card border-[#262629] hover:border-[var(--sec-accent)]/50 transition-all">
          <CardContent className="p-4">
            <div className="flex gap-4">
              <div className="flex-1">
                <h3 className="font-semibold mb-1">{ticket.title}</h3>
                <div className="space-y-1 text-sm text-gray-400">
                  {ticket.subtitle && (
                    <div className="flex items-center gap-2">
                      <Ticket className="w-3 h-3" />
                      <span>{ticket.subtitle}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <Calendar className="w-3 h-3" />
                    <span>Valid until {format(parseISO(ticket.visible_until), 'MMM dd, yyyy HH:mm')}</span>
                  </div>
                </div>
              </div>

              <div className="flex flex-col items-end justify-between">
                <img src={qrUrl} alt="Ticket QR" className="w-20 h-20 rounded-md bg-white p-1" />
                <span className="text-xs text-gray-500">
                  {format(parseISO(ticket.created_at), 'MMM dd')}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </Link>
    );
  };

  return (
    <div className="space-y-6">
      <h3 className="font-semibold mb-3 text-white">Active Tickets</h3>
      <div className="space-y-3">
        {tickets.map(ticket => (
          <TicketCard key={ticket.id} ticket={ticket} />
        ))}
      </div>
    </div>
  );
}