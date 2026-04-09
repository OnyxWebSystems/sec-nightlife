/**
 * Integration service - file upload via backend.
 */
import { uploadFile } from '@/api/client';

export const integrations = {
  Core: {
    async UploadFile({ file }) {
      const data = await uploadFile(file);
      return { file_url: data.file_url };
    },
    async InvokeLLM() {
      return { output: 'Automated analysis is unavailable.', is_valid_document: true, is_18_plus: true, dob_matches: true, extracted_dob: '', reason: 'Unavailable' };
    }
  }
};

export const appLogs = {
  logUserInApp() {
    return Promise.resolve();
  }
};

export async function invokeFunction(name, params) {
  // Legacy: createCheckoutSession removed — use Paystack via apiPost('/api/payments/initialize', ...)
  if (name === 'createCheckoutSession') {
    const { apiPost } = await import('@/api/client');
    const { amount, email, description, metadata } = params;
    const res = await apiPost('/api/payments/initialize', { amount, email, description, metadata });
    return { data: { url: res?.authorization_url } };
  }
  if (name === 'analyzeFeedback') {
    return { data: { success: true, summary: 'Feedback review is currently unavailable.', positive_themes: [], negative_themes: [], recommendations: [] } };
  }
  throw new Error(`Function "${name}" is not available.`);
}
