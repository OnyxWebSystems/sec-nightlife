import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { addDays, parseISO, format } from 'npm:date-fns';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    // Admin-only function for scheduled automation
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const tomorrow = format(addDays(new Date(), 1), 'yyyy-MM-dd');
    
    // Get events happening tomorrow
    const events = await base44.asServiceRole.entities.Event.filter({ 
      date: tomorrow,
      status: 'published'
    });

    console.log(`Found ${events.length} events happening tomorrow`);

    let notificationsSent = 0;

    for (const event of events) {
      // Get users who purchased tickets
      const ticketTransactions = await base44.asServiceRole.entities.Transaction.filter({
        event_id: event.id,
        type: 'ticket',
        status: 'completed'
      });

      const ticketUserIds = [...new Set(ticketTransactions.map(t => t.user_id))];

      // Get users who are interested
      const interestedUsers = await base44.asServiceRole.entities.User.list();
      const interestedUserIds = interestedUsers
        .filter(u => u.interested_events?.includes(event.id))
        .map(u => u.id);

      // Combine both groups
      const allUserIds = [...new Set([...ticketUserIds, ...interestedUserIds])];

      console.log(`Sending reminders to ${allUserIds.length} users for event: ${event.title}`);

      // Send notifications
      for (const userId of allUserIds) {
        await base44.asServiceRole.entities.Notification.create({
          user_id: userId,
          type: 'event_reminder',
          title: 'Event Tomorrow!',
          message: `Don't forget: ${event.title} is happening tomorrow at ${event.start_time || 'TBA'}`,
          data: { event_id: event.id },
          action_url: `/event?id=${event.id}`
        });
        notificationsSent++;
      }
    }

    console.log(`Successfully sent ${notificationsSent} event reminders`);

    return Response.json({ 
      success: true,
      events_found: events.length,
      notifications_sent: notificationsSent
    });
  } catch (error) {
    console.error('Event reminders error:', error);
    return Response.json({ 
      error: error.message 
    }, { status: 500 });
  }
});