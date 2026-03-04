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
  if (name === 'createCheckoutSession') {
    const { apiPost } = await import('@/api/client');
    return apiPost('/api/stripe/checkout', params);
  }
  throw new Error(`Function "${name}" is not available.`);
}
