/**
 * Integration service - file upload via backend, no Base44.
 */
import { uploadFile } from '@/api/client';

export const integrations = {
  Core: {
    async UploadFile({ file }) {
      const data = await uploadFile(file);
      return { file_url: data.file_url };
    },
    async InvokeLLM() {
      return { output: 'AI integration not configured.', is_valid_document: true, is_18_plus: true, dob_matches: true, extracted_dob: '', reason: 'Not configured' };
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
  if (name === 'generateVenueDescription') {
    return { data: { success: true, description: 'AI description generation is not yet configured. Please use the Promotions page for local content generation.' } };
  }
  if (name === 'generatePromotion') {
    return { data: { success: true, promotions: [{ title: 'Promotion Stub', description: 'AI promotion generation is not yet configured. Please use the Promotions page.', target: 'All', impact: 'N/A' }] } };
  }
  if (name === 'analyzeFeedback') {
    return { data: { success: true, summary: 'Feedback analysis is not yet configured.', positive_themes: [], negative_themes: [], recommendations: [] } };
  }
  throw new Error(`Function "${name}" is not available.`);
}
