import { Router } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();

function requirePaystackKey() {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) {
    const err = new Error('Paystack is not configured');
    err.status = 500;
    throw err;
  }
  return key;
}

async function paystackFetch(path, { method = 'GET', body } = {}) {
  const key = requirePaystackKey();
  const res = await fetch(`https://api.paystack.co${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.status) {
    const msg = data?.message || 'Paystack request failed';
    const err = new Error(msg);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

async function applyReferenceSideEffects(reference, paystackData) {
  // Update transaction
  await prisma.transaction.updateMany({
    where: { stripeId: reference },
    data: { status: 'paid', metadata: paystackData }
  });

  // If this payment was for a promotion boost, activate it
  const tx = await prisma.transaction.findFirst({ where: { stripeId: reference } });
  const promoId = tx?.metadata?.promotion_id;
  if (promoId) {
    await prisma.promotion.updateMany({
      where: { id: promoId, deletedAt: null },
      data: { boostStatus: 'active', boostRef: reference, boostPaidAt: new Date() }
    });
  }
}

// Initialize a Paystack transaction (returns authorization_url)
router.post('/paystack/initialize', authenticateToken, async (req, res, next) => {
  try {
    const schema = z.object({
      amount: z.number().positive(), // ZAR
      email: z.string().email().optional(),
      description: z.string().max(2000).optional().nullable(),
      venue_id: z.string().uuid().optional().nullable(),
      event_id: z.string().uuid().optional().nullable(),
      metadata: z.record(z.any()).optional().nullable(),
    });
    const parsed = schema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ error: 'Invalid input' });
    const d = parsed.data;

    // Paystack expects amount in kobo/cents-like units: ZAR -> cents
    const amountInCents = Math.round(d.amount * 100);
    const reference = crypto.randomBytes(16).toString('hex');

    // Create our transaction record first (pending)
    await prisma.transaction.create({
      data: {
        userId: req.userId,
        venueId: d.venue_id || null,
        eventId: d.event_id || null,
        amount: d.amount,
        currency: 'ZAR',
        type: 'paystack',
        status: 'pending',
        stripeId: reference, // reuse column as provider ref
        metadata: {
          provider: 'paystack',
          reference,
          description: d.description || null,
          ...(d.metadata || {}),
        }
      }
    });

    const paystackResp = await paystackFetch('/transaction/initialize', {
      method: 'POST',
      body: {
        email: d.email || 'user@secnightlife.app',
        amount: amountInCents,
        reference,
        metadata: {
          user_id: req.userId,
          description: d.description || null,
          ...(d.metadata || {}),
        },
        callback_url: process.env.APP_URL ? `${process.env.APP_URL}/PaymentSuccess?ref=${reference}` : undefined,
      },
    });

    res.json({
      reference,
      authorization_url: paystackResp.data.authorization_url,
      access_code: paystackResp.data.access_code,
    });
  } catch (err) {
    next(err);
  }
});

// Verify a Paystack transaction (client calls after redirect)
router.get('/paystack/verify/:reference', authenticateToken, async (req, res, next) => {
  try {
    const reference = req.params.reference;
    const paystackResp = await paystackFetch(`/transaction/verify/${encodeURIComponent(reference)}`);

    const status = paystackResp.data.status; // success | failed | abandoned
    const mapped = status === 'success' ? 'paid' : status === 'failed' ? 'failed' : 'pending';

    await prisma.transaction.updateMany({
      where: { userId: req.userId, stripeId: reference },
      data: { status: mapped, metadata: paystackResp.data }
    });

    if (mapped === 'paid') {
      await applyReferenceSideEffects(reference, paystackResp.data);
    }

    res.json({ status: mapped, paystack_status: status });
  } catch (err) {
    next(err);
  }
});

// Paystack webhook (NO auth) - app.js must mount this with raw body
export async function paystackWebhookHandler(req, res) {
  const sig = req.headers['x-paystack-signature'];
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!sig || !key) return res.status(400).send('bad request');
  const hash = crypto.createHmac('sha512', key).update(req.body).digest('hex');
  if (hash !== sig) return res.status(401).send('invalid signature');

  let payload;
  try {
    payload = JSON.parse(req.body.toString('utf8'));
  } catch {
    return res.status(400).send('invalid json');
  }

  // Only handle successful charges
  const event = payload?.event;
  const data = payload?.data;
  const reference = data?.reference;
  if (!reference) return res.status(200).send('ok');

  if (event === 'charge.success') {
    try {
      await applyReferenceSideEffects(reference, data);
    } catch {}
  }

  return res.status(200).send('ok');
}

export default router;

