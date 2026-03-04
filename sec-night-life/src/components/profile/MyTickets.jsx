import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { dataService } from '@/services/dataService';
import { Card, CardContent } from "@/components/ui/card";
import { Ticket, Calendar, MapPin, QrCode } from 'lucide-react';
import { format, parseISO, isFuture } from 'date-fns';
import { Button } from "@/components/ui/button";
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';

export default function MyTickets({ userId }) {
  const { data: transactions = [], isLoading } = useQuery({
    queryKey: ['my-tickets', userId],
    queryFn: () => dataService.Transaction.filter({ 
      user_id: userId, 
      type: 'ticket',
      status: 'completed'
    }),
    enabled: !!userId
  });

  const { data: events = [] } = useQuery({
    queryKey: ['ticket-events'],
    queryFn: async () => {
      const eventIds = [...new Set(transactions.map(t => t.event_id))];
      if (eventIds.length === 0) return [];
      const allEvents = await dataService.Event.list();
      return allEvents.filter(e => eventIds.includes(e.id));
    },
    enabled: transactions.length > 0
  });

  if (isLoading) {
    return <div className="text-center py-8 text-gray-500">Loading tickets...</div>;
  }

  if (transactions.length === 0) {
    return (
      <div className="text-center py-12">
        <Ticket className="w-12 h-12 text-gray-600 mx-auto mb-3" />
        <p className="text-gray-500 mb-4">No tickets purchased yet</p>
        <Link to={createPageUrl('Events')}>
          <Button className="bg-gradient-to-r from-[#FF3366] to-[#7C3AED]">
            Browse Events
          </Button>
        </Link>
      </div>
    );
  }

  const upcomingTickets = transactions.filter(t => {
    const event = events.find(e => e.id === t.event_id);
    return event && isFuture(parseISO(event.date));
  });

  const pastTickets = transactions.filter(t => {
    const event = events.find(e => e.id === t.event_id);
    return event && !isFuture(parseISO(event.date));
  });

  const TicketCard = ({ transaction }) => {
    const event = events.find(e => e.id === transaction.event_id);
    if (!event) return null;

    const isPast = !isFuture(parseISO(event.date));

    return (
      <Link to={createPageUrl(`EventDetails?id=${event.id}`)}>
        <Card className={`glass-card border-[#262629] hover:border-[#FF3366]/50 transition-all ${isPast && 'opacity-60'}`}>
          <CardContent className="p-4">
            <div className="flex gap-4">
              <div className="relative">
                {event.cover_image_url ? (
                  <img 
                    src={event.cover_image_url} 
                    alt={event.title}
                    className="w-20 h-20 rounded-xl object-cover"
                  />
                ) : (
                  <div className="w-20 h-20 rounded-xl bg-gradient-to-br from-[#FF3366] to-[#7C3AED]" />
                )}
                {isPast && (
                  <div className="absolute inset-0 bg-black/50 rounded-xl flex items-center justify-center">
                    <span className="text-xs font-bold">PAST</span>
                  </div>
                )}
              </div>
              
              <div className="flex-1">
                <h3 className="font-semibold mb-1">{event.title}</h3>
                <div className="space-y-1 text-sm text-gray-400">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-3 h-3" />
                    <span>{format(parseISO(event.date), 'MMM dd, yyyy')}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <MapPin className="w-3 h-3" />
                    <span>{event.city}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Ticket className="w-3 h-3" />
                    <span className="text-[#00D4AA]">{transaction.description}</span>
                  </div>
                </div>
              </div>

              <div className="flex flex-col items-end justify-between">
                <QrCode className="w-8 h-8 text-[#FF3366]" />
                <span className="text-xs text-gray-500">
                  {format(parseISO(transaction.created_date), 'MMM dd')}
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
      {upcomingTickets.length > 0 && (
        <div>
          <h3 className="font-semibold mb-3 text-white">Upcoming Events</h3>
          <div className="space-y-3">
            {upcomingTickets.map(ticket => (
              <TicketCard key={ticket.id} transaction={ticket} />
            ))}
          </div>
        </div>
      )}

      {pastTickets.length > 0 && (
        <div>
          <h3 className="font-semibold mb-3 text-gray-500">Past Events</h3>
          <div className="space-y-3">
            {pastTickets.map(ticket => (
              <TicketCard key={ticket.id} transaction={ticket} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}