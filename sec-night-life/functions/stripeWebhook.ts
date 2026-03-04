import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import Stripe from 'npm:stripe@17.5.0';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'), {
  apiVersion: '2024-12-18.acacia',
});

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    const body = await req.text();
    const signature = req.headers.get('stripe-signature');
    const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');

    if (!webhookSecret) {
      console.error('STRIPE_WEBHOOK_SECRET not set');
      return Response.json({ error: 'Webhook secret not configured' }, { status: 500 });
    }

    let event;
    try {
      event = await stripe.webhooks.constructEventAsync(
        body,
        signature,
        webhookSecret
      );
    } catch (err) {
      console.error('Webhook signature verification failed:', err.message);
      return Response.json({ error: 'Signature verification failed' }, { status: 400 });
    }

    console.log('Webhook event received:', event.type);

    // Handle successful payment
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const { table_id, user_id, type, event_id, ticket_tier_name, quantity } = session.metadata;

      console.log('Payment completed:', { type, table_id, event_id, user_id });

      // Handle ticket purchase
      if (type === 'ticket' && event_id && ticket_tier_name) {
        const events = await base44.asServiceRole.entities.Event.filter({ id: event_id });
        const eventData = events[0];

        if (eventData) {
          // Update ticket tier sold count
          const updatedTiers = eventData.ticket_tiers.map(tier => 
            tier.name === ticket_tier_name 
              ? { ...tier, sold: (tier.sold || 0) + parseInt(quantity) }
              : tier
          );

          await base44.asServiceRole.entities.Event.update(event_id, {
            ticket_tiers: updatedTiers,
            total_attending: (eventData.total_attending || 0) + parseInt(quantity)
          });

          // Create transaction record
          await base44.asServiceRole.entities.Transaction.create({
            user_id: user_id,
            event_id: event_id,
            venue_id: eventData.venue_id,
            type: 'ticket',
            amount: session.amount_total / 100,
            status: 'completed',
            payment_reference: session.id,
            description: `${quantity}x ${ticket_tier_name} ticket(s) for ${eventData.title}`,
          });

          // Send confirmation notification
          await base44.asServiceRole.entities.Notification.create({
            user_id: user_id,
            type: 'payment',
            title: 'Tickets Confirmed',
            message: `Your ${quantity} ticket(s) for ${eventData.title} have been confirmed`,
            data: { event_id: event_id },
          });

          console.log('Ticket purchase processed successfully');
        }
      }

      // Handle table joining fee
      if (type === 'table_joining_fee' && table_id && user_id) {
        // Get table and user profile
        const tables = await base44.asServiceRole.entities.Table.filter({ id: table_id });
        const table = tables[0];

        if (!table) {
          console.error('Table not found:', table_id);
          return Response.json({ received: true });
        }

        const userProfiles = await base44.asServiceRole.entities.User.filter({ id: user_id });
        const userProfile = userProfiles[0];

        // Update table - add user as confirmed member
        const updatedMembers = table.members?.map(m => 
          m.user_id === user_id ? { ...m, status: 'confirmed' } : m
        ) || [];

        // If user not in members yet, add them
        if (!updatedMembers.some(m => m.user_id === user_id)) {
          updatedMembers.push({
            user_id: user_id,
            status: 'confirmed',
            joined_at: new Date().toISOString(),
            contribution: session.amount_total / 100,
          });
        }

        // Remove from pending requests
        const updatedPending = (table.pending_requests || []).filter(id => id !== user_id);

        await base44.asServiceRole.entities.Table.update(table_id, {
          members: updatedMembers,
          pending_requests: updatedPending,
          current_guests: updatedMembers.length,
          current_spend: (table.current_spend || 0) + (session.amount_total / 100),
        });

        // Create transaction record
        await base44.asServiceRole.entities.Transaction.create({
          user_id: user_id,
          table_id: table_id,
          event_id: table.event_id,
          venue_id: table.venue_id,
          type: 'table_join',
          amount: session.amount_total / 100,
          status: 'completed',
          payment_reference: session.id,
          description: `Joined table: ${table.name}`,
        });

        // Send notification to user
        await base44.asServiceRole.entities.Notification.create({
          user_id: user_id,
          type: 'payment',
          title: 'Payment Successful',
          message: `You've successfully joined "${table.name}"`,
          data: { table_id: table_id },
        });

        // Send notification to host
        await base44.asServiceRole.entities.Notification.create({
          user_id: table.host_user_id,
          type: 'table_request',
          title: 'New Member Joined',
          message: `${userProfile?.username || 'Someone'} has joined your table "${table.name}"`,
          data: { table_id: table_id, user_id: user_id },
        });

        console.log('Table updated successfully');
      }
    }

    return Response.json({ received: true });
  } catch (error) {
    console.error('Webhook processing failed:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});