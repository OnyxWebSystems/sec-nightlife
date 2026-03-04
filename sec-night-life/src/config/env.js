/**
 * Environment configuration.
 * VITE_API_URL: Backend API base URL.
 * IS_LOCAL_DEV: True when running in development (Vite dev server).
 */
export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';
export const IS_LOCAL_DEV = import.meta.env.DEV;
