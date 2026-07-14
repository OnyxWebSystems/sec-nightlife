import { buildPageUrl } from '@/utils';

/** True when a hosted listing should use Event details / Event settings copy. */
export function isHostedEventListing(listing) {
  if (!listing) return false;
  if (listing.is_community_event || listing.isCommunityHosted) return true;
  return listing.listingSurface === 'EVENT' || listing.listing_surface === 'EVENT';
}

/** Public details path for a hosted own-place table or event. */
export function hostedListingDetailsPath(listing) {
  const id = listing?.hostedTableId || listing?.id;
  if (!id) return buildPageUrl('Home');
  return buildPageUrl(isHostedEventListing(listing) ? 'EventDetails' : 'TableDetails', {
    id,
    source: 'hosted',
  });
}

export function hostedListingSettingsLabel(listing) {
  return isHostedEventListing(listing) ? 'Event settings' : 'Table settings';
}
