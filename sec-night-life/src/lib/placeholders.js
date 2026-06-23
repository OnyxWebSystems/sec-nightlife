/**
 * High-quality nightlife placeholder images.
 * Cinematic, VIP, moody — no generic stock.
 * Using source.unsplash.com for reliability.
 */
import { cloudinaryCardUrl, cloudinaryDetailUrl } from '@/lib/cloudinaryUrl';

export const NIGHTLIFE_PLACEHOLDERS = {
  event: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=800&q=80',
  venue: 'https://images.unsplash.com/photo-1566737236500-c8ac43014a67?w=800&q=80',
  table: 'https://images.unsplash.com/photo-1571266028243-d220e8d62e92?w=800&q=80',
  beach: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800&q=80',
  sunset: 'https://images.unsplash.com/photo-1519046904884-53103b34b206?w=800&q=80',
};

export function getEventImage(url, size = 'card') {
  if (!url) return NIGHTLIFE_PLACEHOLDERS.event;
  return size === 'detail' ? cloudinaryDetailUrl(url) : cloudinaryCardUrl(url);
}

export function getVenueImage(url, venueType, size = 'card') {
  if (url) return size === 'detail' ? cloudinaryDetailUrl(url) : cloudinaryCardUrl(url);
  if (venueType === 'beach_club') return NIGHTLIFE_PLACEHOLDERS.beach;
  return NIGHTLIFE_PLACEHOLDERS.venue;
}
