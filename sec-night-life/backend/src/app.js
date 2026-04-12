import 'dotenv/config';
import { validateEnv } from './lib/env.js';

// Validate env before anything else
validateEnv();

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { logger } from './lib/logger.js';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import venueRoutes from './routes/venues.js';
import eventRoutes from './routes/events.js';
import tableRoutes from './routes/tables.js';
import jobRoutes from './routes/jobs.js';
import uploadRoutes from './routes/upload.js';
import blockRoutes from './routes/blocks.js';
import reportRoutes from './routes/reports.js';
import notificationRoutes from './routes/notifications.js';
import friendsRoutes from './routes/friends.js';
import groupChatRoutes from './routes/groupChats.js';
import chatRoutes from './routes/chats.js';
import messageRoutes from './routes/messages.js';
import analyticsRoutes from './routes/analytics.js';
import friendRequestRoutes from './routes/friend-requests.js';
import transactionRoutes from './routes/transactions.js';
import reviewRoutes from './routes/reviews.js';
import ratingRoutes from './routes/ratings.js';
import paymentRoutes, { paystackWebhookHandler } from './routes/payments.js';
import promotionRoutes from './routes/promotions.js';
import cronRoutes from './routes/cron.js';
import hostEventRoutes from './routes/host-events.js';
import userRoleRoutes from './routes/user-roles.js';
import adminRoutes from './routes/admin.js';
import legalRoutes from './routes/legal.js';
import complianceDocumentsRoutes from './routes/compliance-documents.js';
import { errorHandler } from './middleware/errorHandler.js';
import { requestLogger } from './middleware/requestLogger.js';
import { optionalAuth } from './middleware/auth.js';

const app = express();
const isProd = process.env.NODE_ENV === 'production';

// Trust proxy (required behind Vercel/other proxies for rate limiting and correct IP)
app.set('trust proxy', 1);

// Security headers
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: isProd ? undefined : false,
  hsts: isProd ? { maxAge: 31536000, includeSubDomains: true, preload: true } : false
}));

// Strict CORS (normalize origins: trim trailing slashes for comparison)
const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5173,http://localhost:4173')
  .split(',')
  .map(o => o.trim().replace(/\/+$/, ''))
  .filter(Boolean);

app.use(cors({
  origin: (origin, cb) => {
    if (!origin) {
      if (isProd) return cb(new Error('CORS: requests without Origin are not allowed in production'), false);
      return cb(null, true);
    }
    const normalizedOrigin = origin.replace(/\/+$/, '');
    if (allowedOrigins.includes(normalizedOrigin)) return cb(null, true);
    // Allow any Vercel preview URL (*.vercel.app) for preview deployments
    if (normalizedOrigin.endsWith('.vercel.app')) return cb(null, true);
    cb(new Error('CORS: origin not allowed'), false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  // Home promotions feed sends x-session-id; preflight fails if not listed (feed appeared empty on Vercel).
  allowedHeaders: ['Content-Type', 'Authorization', 'x-session-id'],
}));

// Paystack webhooks — raw body required for HMAC signature verification
app.post('/api/webhooks/paystack', express.raw({ type: 'application/json' }), paystackWebhookHandler);
app.post('/api/payments/paystack/webhook', express.raw({ type: 'application/json' }), paystackWebhookHandler);

// Body size limits
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Rate limiting
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isProd ? 100 : 1000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Try again later.' }
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isProd ? 20 : 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Try again in a few minutes.' }
});

const resendLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: isProd ? 3 : 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many verification email requests. Try again in an hour.' }
});

const paymentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isProd ? 20 : 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many payment requests. Try again later.' }
});

// Request logging
app.use(requestLogger);

// Routes
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/auth/resend-verification', resendLimiter);
app.use('/api/users', generalLimiter, userRoutes);
app.use('/api/venues', generalLimiter, venueRoutes);
app.use('/api/events', generalLimiter, eventRoutes);
app.use('/api/tables', generalLimiter, tableRoutes);
app.use('/api/jobs', generalLimiter, jobRoutes);
app.use('/api/upload', generalLimiter, uploadRoutes);
app.use('/api/blocks', generalLimiter, blockRoutes);
app.use('/api/reports', generalLimiter, reportRoutes);
app.use('/api/notifications', generalLimiter, notificationRoutes);
app.use('/api/friends', generalLimiter, friendsRoutes);
app.use('/api/group-chats', generalLimiter, groupChatRoutes);
app.use('/api/chats', generalLimiter, chatRoutes);
app.use('/api/messages', generalLimiter, messageRoutes);
app.use('/api/analytics', generalLimiter, analyticsRoutes);
app.use('/api/friend-requests', generalLimiter, friendRequestRoutes);
app.use('/api/transactions', generalLimiter, transactionRoutes);
app.use('/api/reviews', generalLimiter, optionalAuth, reviewRoutes);
app.use('/api/ratings', generalLimiter, ratingRoutes);
app.use('/api/payments', paymentLimiter, paymentRoutes);
app.use('/api/promotions', generalLimiter, promotionRoutes);
app.use('/api/cron', cronRoutes);
app.use('/api/host-events', generalLimiter, hostEventRoutes);
app.use('/api/user-roles', generalLimiter, userRoleRoutes);
app.use('/api/admin', generalLimiter, adminRoutes);
app.use('/api/legal', legalRoutes);
app.use('/api/compliance-documents', generalLimiter, complianceDocumentsRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handler
app.use(errorHandler);

export { app, logger };

