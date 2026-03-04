const isNode = typeof window === 'undefined';
const storage = isNode ? { getItem: () => null, setItem: () => {}, removeItem: () => {} } : (window.localStorage || {});

export const appParams = {
  get token() {
    return storage.getItem('access_token') || storage.getItem('token');
  }
};
