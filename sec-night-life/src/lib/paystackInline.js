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

function getPublicKey() {
  return String(import.meta.env.VITE_PAYSTACK_PUBLIC_KEY || '').trim();
}

/**
 * Opens Paystack **on the same page** (overlay). Uses Inline v2 `resumeTransaction`
 * with the `access_code` from your backend — no navigation to checkout.paystack.com.
 *
 * Requires `VITE_PAYSTACK_PUBLIC_KEY` (pk_test_… / pk_live_…) in the frontend env.
 */
export async function launchPaystackInline({ email, amount, reference, accessCode, onSuccess, onCancel }) {
  const key = getPublicKey();
  if (!key || !key.startsWith('pk_')) {
    const err = new Error(
      'Paystack public key is missing or invalid. Add VITE_PAYSTACK_PUBLIC_KEY (pk_test_… or pk_live_…) to sec-night-life/.env and restart `npm run dev`.',
    );
    toast.error(err.message);
    throw err;
  }

  await loadPaystackScript();
  const PaystackPop = window.PaystackPop;
  const popup = new PaystackPop();

  if (accessCode) {
    popup.resumeTransaction(String(accessCode), {
      onSuccess: (transaction) => onSuccess?.(transaction),
      onCancel: () => onCancel?.(),
      onError: (error) => {
        const msg = error?.message || 'Paystack could not start checkout';
        console.error('Paystack onError', error);
        toast.error(msg);
        onCancel?.();
      },
    });
    return;
  }

  popup.newTransaction({
    key,
    email,
    amount: Math.round(Number(amount) * 100),
    reference,
    currency: 'ZAR',
    onSuccess: (transaction) => onSuccess?.(transaction),
    onCancel: () => onCancel?.(),
    onError: (error) => {
      const msg = error?.message || 'Paystack could not start checkout';
      console.error('Paystack onError', error);
      toast.error(msg);
      onCancel?.();
    },
  });
}

export async function verifyPaystackReference(reference) {
  return apiGet(`/api/payments/verify/${encodeURIComponent(reference)}`);
}
