import { apiGet } from '@/api/client';
import { toast } from 'sonner';

const PAYSTACK_INLINE_SRC = 'https://js.paystack.co/v2/inline.js';

let loaderPromise = null;

function isPaystackV2Loaded() {
  return (
    typeof window !== 'undefined' &&
    typeof window.PaystackPop === 'function' &&
    typeof window.PaystackPop.prototype?.resumeTransaction === 'function'
  );
}

function loadPaystackScript() {
  if (typeof window === 'undefined') return Promise.reject(new Error('Window not available'));
  if (isPaystackV2Loaded()) return Promise.resolve(window.PaystackPop);

  const stale = document.querySelector('script[data-sec-paystack-inline]');
  if (stale && !isPaystackV2Loaded()) {
    stale.remove();
    delete window.PaystackPop;
    loaderPromise = null;
  }

  if (loaderPromise) return loaderPromise;

  loaderPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = PAYSTACK_INLINE_SRC;
    script.async = true;
    script.dataset.secPaystackInline = 'v2';
    script.onload = () => {
      if (isPaystackV2Loaded()) {
        resolve(window.PaystackPop);
      } else {
        loaderPromise = null;
        reject(new Error('Paystack Inline v2 failed to load (unexpected global).'));
      }
    };
    script.onerror = () => {
      loaderPromise = null;
      reject(new Error('Failed to load Paystack checkout script'));
    };
    document.head.appendChild(script);
  });
  return loaderPromise;
}

let cachedPaystackPublicKey = '';
let paystackPublicKeyFetch = null;

/**
 * Inline checkout needs Paystack's **public** key in the browser.
 * 1) Prefer `VITE_PAYSTACK_PUBLIC_KEY` (baked in at Vite build time).
 * 2) Otherwise load from `GET /api/payments/paystack-public-key` (uses `PAYSTACK_PUBLIC_KEY` on the API).
 * Backend-only env vars do not reach the frontend bundle — set the public key on the API or use VITE_ on the SPA build.
 */
async function resolvePaystackPublicKey() {
  const fromVite = String(import.meta.env.VITE_PAYSTACK_PUBLIC_KEY || '').trim();
  if (fromVite.startsWith('pk_')) return fromVite;
  if (cachedPaystackPublicKey.startsWith('pk_')) return cachedPaystackPublicKey;

  if (!paystackPublicKeyFetch) {
    paystackPublicKeyFetch = apiGet('/api/payments/paystack-public-key', { skipAuth: true })
      .then((data) => {
        const pk = String(data?.public_key || '').trim();
        if (pk.startsWith('pk_')) cachedPaystackPublicKey = pk;
        return cachedPaystackPublicKey || '';
      })
      .catch(() => '')
      .finally(() => {
        paystackPublicKeyFetch = null;
      });
  }
  const pk = await paystackPublicKeyFetch;
  return pk.startsWith('pk_') ? pk : '';
}

/**
 * Opens Paystack **on the same page** (overlay). Uses Inline v2 `resumeTransaction`
 * with the `access_code` from your backend — no navigation to checkout.paystack.com.
 */
export async function launchPaystackInline({ email, amount, reference, accessCode, onSuccess, onCancel }) {
  const key = await resolvePaystackPublicKey();
  if (!key) {
    const err = new Error(
      'Paystack public key is missing. Add PAYSTACK_PUBLIC_KEY to your backend (same Vercel project as the API) or VITE_PAYSTACK_PUBLIC_KEY to the frontend .env, then restart dev / redeploy.',
    );
    toast.error(err.message);
    throw err;
  }

  await loadPaystackScript();
  const PaystackPop = window.PaystackPop;
  const popup = new PaystackPop();

  return new Promise((resolve, reject) => {
    const handleSuccess = async (transaction) => {
      try {
        await onSuccess?.(transaction);
        resolve(transaction);
      } catch (err) {
        reject(err);
      }
    };
    const handleCancel = () => {
      onCancel?.();
      reject(new Error('Payment cancelled'));
    };
    const handleError = (error) => {
      const msg = error?.message || 'Paystack could not start checkout';
      console.error('Paystack onError', error);
      toast.error(msg);
      onCancel?.();
      reject(new Error(msg));
    };

    if (accessCode) {
      popup.resumeTransaction(String(accessCode), {
        onSuccess: (transaction) => void handleSuccess(transaction),
        onCancel: handleCancel,
        onError: handleError,
      });
      return;
    }

    popup.newTransaction({
      key,
      email,
      amount: Math.round(Number(amount) * 100),
      reference,
      currency: 'ZAR',
      onSuccess: (transaction) => void handleSuccess(transaction),
      onCancel: handleCancel,
      onError: handleError,
    });
  });
}

export async function verifyPaystackReference(reference) {
  return apiGet(`/api/payments/verify/${encodeURIComponent(reference)}`);
}

export async function verifyPaystackReferenceWithRetry(reference, options = {}) {
  const retries = Math.max(0, Number(options.retries ?? 3));
  const baseDelayMs = Math.max(200, Number(options.baseDelayMs ?? 1000));
  let lastResult = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const result = await verifyPaystackReference(reference);
    lastResult = result;
    if (result?.status === 'paid') return result;
    if (result?.status === 'failed') return result;
    if (attempt === retries) break;

    const delayMs = baseDelayMs * (attempt + 1);
    await new Promise((resolve) => {
      window.setTimeout(resolve, delayMs);
    });
  }

  return lastResult;
}
