/**
 * Data service - calls backend API for entities.
 */
import { apiGet, apiPost, apiPut, apiPatch, apiDelete } from '@/api/client';

function qs(params) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v != null && v !== '') search.set(k, v);
  });
  const s = search.toString();
  return s ? '?' + s : '';
}

function createEntityAdapter(endpoint, idField = 'id') {
  return {
    async filter(filter = {}, sortField, limit = 100) {
      const params = { ...filter, sort: sortField, limit };
      return apiGet('/api/' + endpoint + '/filter' + qs(params));
    },
    async list(sortField, limit = 100) {
      const params = { sort: sortField, limit };
      return apiGet('/api/' + endpoint + qs(params));
    },
    async create(payload) {
      return apiPost('/api/' + endpoint, payload);
    },
    async update(id, payload) {
      return apiPatch('/api/' + endpoint + '/' + id, payload);
    },
    async delete(id) {
      return apiDelete('/api/' + endpoint + '/' + id);
    }
  };
}

// Map frontend entity names to API endpoints
const endpointMap = {
  User: 'users',
  Event: 'events',
  Table: 'tables',
  Venue: 'venues',
  Job: 'jobs',
  Notification: 'notifications',
  Chat: 'chats',
  FriendRequest: 'friend-requests',
  HostEvent: 'host-events',
  Transaction: 'transactions',
  Review: 'reviews'
};

function adapterFor(entityName) {
  const endpoint = endpointMap[entityName] || entityName.toLowerCase() + 's';
  return createEntityAdapter(endpoint);
}

export const dataService = {
  User: adapterFor('User'),
  Event: adapterFor('Event'),
  Table: adapterFor('Table'),
  Venue: adapterFor('Venue'),
  Job: adapterFor('Job'),
  Notification: adapterFor('Notification'),
  Chat: adapterFor('Chat'),
  FriendRequest: adapterFor('FriendRequest'),
  HostEvent: adapterFor('HostEvent'),
  Transaction: adapterFor('Transaction'),
  Review: adapterFor('Review'),
  TableHistory: { filter: () => [], list: () => [], create: () => ({}), update: () => ({}), delete: () => {} },
  Message: { filter: () => [], list: () => [], create: () => ({}), update: () => ({}), delete: () => {} }
};
