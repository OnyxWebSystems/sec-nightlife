import { apiGet } from '@/api/client';

let loaderPromise = null;

function loadPaystackScript() {
  if (typeof window === 'undefined') return Promise.reject(new Error('Window not available'));
  if (window.PaystackPop) return Promise.resolve(window.PaystackPop);
  if (loaderPromise) return loaderPromise;
  loaderPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://js.paystack.co/v1/inline.js';
    script.async = true;
    script.onload = () => resolve(window.PaystackPop);
    script.onerror = () => reject(new Error('Failed to load Paystack inline checkout'));
    document.head.appendChild(script);
  });
  return loaderPromise;
}

export async function launchPaystackInline({ email, amount, reference, accessCode, onSuccess, onCancel }) {
  const PaystackPop = await loadPaystackScript();
  if (!PaystackPop) throw new Error('Paystack checkout is unavailable');
  const popup = PaystackPop.setup({
    key: import.meta.env.VITE_PAYSTACK_PUBLIC_KEY,
    email,
    amount: Math.round(Number(amount) * 100),
    ref: reference,
    access_code: accessCode,
    currency: 'ZAR',
    callback: (resp) => onSuccess?.(resp),
    onClose: () => onCancel?.(),
  });
  popup.openIframe();
}

export async function verifyPaystackReference(reference) {
  return apiGet(`/api/payments/verify/${encodeURIComponent(reference)}`);
}
