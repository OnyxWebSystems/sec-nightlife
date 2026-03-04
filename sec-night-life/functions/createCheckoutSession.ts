import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import Stripe from 'npm:stripe@17.5.0';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'), {
  apiVersion: '2024-12-18.acacia',
});

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { event_id, ticket_tier_name, quantity, table_id, amount, description, success_url, cancel_url } = body;

    // Handle table join payments
    if (table_id && amount) {
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [
          {
            price_data: {
              currency: 'zar',
              product_data: {
                name: description || 'Table Join Fee',
              },
              unit_amount: Math.round(amount * 100), // Convert to cents
            },
            quantity: 1,
          },
        ],
        mode: 'payment',
        success_url: success_url || `${req.headers.get('origin')}/tables`,
        cancel_url: cancel_url || `${req.headers.get('origin')}/tables`,
        metadata: {
          base44_app_id: Deno.env.get('BASE44_APP_ID'),
          type: 'table_join',
          table_id: table_id,
          user_id: user.id,
          user_email: user.email
        }
      });

      return Response.json({ 
        url: session.url,
        session_id: session.id 
      });
    }

    // Handle ticket purchases
    if (event_id && ticket_tier_name) {
      const event = await base44.asServiceRole.entities.Event.get(event_id);
      if (!event) {
        return Response.json({ error: 'Event not found' }, { status: 404 });
      }

      const ticketTier = event.ticket_tiers?.find(t => t.name === ticket_tier_name);
      if (!ticketTier) {
        return Response.json({ error: 'Ticket tier not found' }, { status: 404 });
      }

      const sold = ticketTier.sold || 0;
      const available = ticketTier.quantity - sold;
      if (quantity > available) {
        return Response.json({ error: 'Not enough tickets available' }, { status: 400 });
      }

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [
          {
            price_data: {
              currency: 'zar',
              product_data: {
                name: `${event.title} - ${ticket_tier_name}`,
                description: ticketTier.description || event.description,
              },
              unit_amount: Math.round(ticketTier.price * 100),
            },
            quantity: quantity,
          },
        ],
        mode: 'payment',
        success_url: `${req.headers.get('origin')}/ticket-success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${req.headers.get('origin')}/event/${event_id}`,
        metadata: {
          base44_app_id: Deno.env.get('BASE44_APP_ID'),
          type: 'ticket',
          event_id: event_id,
          ticket_tier_name: ticket_tier_name,
          quantity: quantity.toString(),
          user_id: user.id,
          user_email: user.email
        }
      });

      return Response.json({ 
        url: session.url,
        session_id: session.id 
      });
    }

    return Response.json({ error: 'Invalid request' }, { status: 400 });
  } catch (error) {
    console.error('Checkout session error:', error);
    return Response.json({ 
      error: error.message 
    }, { status: 500 });
  }
});