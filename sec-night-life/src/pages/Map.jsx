import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { dataService } from '@/services/dataService';
import { useQuery } from '@tanstack/react-query';
import { 
  Search,
  MapPin,
  X,
  ChevronRight,
  Star,
  BadgeCheck,
  Calendar,
  Navigation
} from 'lucide-react';
import { motion } from 'framer-motion';
import { format, parseISO } from 'date-fns';
import { useGoogleMaps } from '@/lib/GoogleMapsProvider';

// Johannesburg coordinates as default
const DEFAULT_CENTER = { lat: -26.2041, lng: 28.0473 };

export default function Map() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedVenue, setSelectedVenue] = useState(null);
  const [viewMode, setViewMode] = useState('venues'); // 'venues' | 'events' | 'tables'
  const [userLocation, setUserLocation] = useState(null);
  const [map, setMap] = useState(null);
  const [mapError, setMapError] = useState(null);
  const mapRef = React.useRef(null);
  const { status: mapsStatus, error: mapsError } = useGoogleMaps();

  const { data: venues = [] } = useQuery({
    queryKey: ['map-venues'],
    queryFn: () => dataService.Venue.list(),
  });

  const { data: events = [] } = useQuery({
    queryKey: ['map-events'],
    queryFn: () => dataService.Event.filter({ status: 'published' }),
  });

  const venuesWithCoords = venues.filter(v => v.latitude && v.longitude);

  const filteredItems = venuesWithCoords.filter((venue) => {
    const q = searchQuery.toLowerCase();
    return (
      (venue.name ?? '').toLowerCase().includes(q) ||
      (venue.city ?? '').toLowerCase().includes(q)
    );
  });

  const modes = [
    { value: 'venues', label: 'Venues' },
    { value: 'events', label: 'Events' },
    { value: 'tables', label: 'Tables' },
  ];

  // Initialize Google Map
  useEffect(() => {
    if (mapsStatus === 'error') {
      setMapError('Map unavailable. Please check your deployment Google Maps configuration.');
      return;
    }

    if (mapsStatus !== 'ready') return;

    const initMap = async () => {
      if (!mapRef.current) {
        console.warn('Map container ref not available');
        return;
      }
      if (map) return;
      setMapError(null);

      if (!window.google?.maps?.Map) {
        setMapError('Unable to load map. Please check that VITE_GOOGLE_MAPS_API_KEY is set in your deployment.');
        return;
      }

      try {
        const googleMap = new window.google.maps.Map(mapRef.current, {
          zoom: 12,
          center: DEFAULT_CENTER,
          mapTypeControl: false,
          fullscreenControl: false,
          streetViewControl: false,
          zoomControl: true,
          gestureHandling: 'greedy',
          styles: [
            {
              elementType: 'geometry',
              stylers: [{ color: '#141416' }],
            },
            {
              elementType: 'labels.text.stroke',
              stylers: [{ color: '#141416' }],
            },
            {
              elementType: 'labels.text.fill',
              stylers: [{ color: '#ffffff' }],
            },
            {
              featureType: 'water',
              elementType: 'geometry',
              stylers: [{ color: '#0a0a0b' }],
            },
          ],
        });

        setMap(googleMap);

        // Get user location
        if (navigator.geolocation) {
          navigator.geolocation.getCurrentPosition((position) => {
            const userLoc = {
              lat: position.coords.latitude,
              lng: position.coords.longitude,
            };
            setUserLocation(userLoc);
          });
        }
      } catch (err) {
        console.error('Failed to initialize map:', err);
        setMapError('Unable to load map. Please try again.');
      }
    };

    initMap();
  }, [mapsStatus, map]);

  // Update markers when filtered items change
  useEffect(() => {
    if (!map) return;

    // Clear existing markers
    map.markers?.forEach(marker => marker.setMap(null));
    map.markers = [];

    // Add new markers
    filteredItems.forEach((venue) => {
      const marker = new window.google.maps.Marker({
        position: { lat: venue.latitude, lng: venue.longitude },
        map: map,
        title: venue.name,
        icon: {
          path: window.google.maps.SymbolPath.CIRCLE,
          scale: 8,
          fillColor: '#B8B8B8',
          fillOpacity: 1,
          strokeColor: '#FAFAFA',
          strokeWeight: 2,
        },
      });

      marker.addListener('click', () => setSelectedVenue(venue));
      map.markers.push(marker);
    });
  }, [map, filteredItems]);

  const mapLoaded = !!map;
  const hasNoVenuesWithCoords = venuesWithCoords.length === 0;
  const hasSearchNoResults = viewMode === 'venues' && searchQuery && filteredItems.length === 0;

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--sec-bg-base)', display: 'flex', flexDirection: 'column' }}>
      {/* Map section - fixed height */}
      <div style={{ position: 'relative', height: 280, flexShrink: 0, backgroundColor: 'var(--sec-bg-elevated)' }}>
        <div
          ref={mapRef}
          style={{
            position: 'absolute',
            inset: 0,
            opacity: mapLoaded && !mapError ? 1 : 0,
          }}
        />
        {mapError && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: 'var(--sec-bg-elevated)',
              padding: 24,
              textAlign: 'center',
            }}
          >
            <MapPin size={36} strokeWidth={1.5} style={{ color: 'var(--sec-text-muted)', marginBottom: 12 }} />
            <p style={{ color: 'var(--sec-text-primary)', fontWeight: 500, marginBottom: 6 }}>Map unavailable</p>
            <p style={{ color: 'var(--sec-text-muted)', fontSize: 13 }}>Browse venues in the list below.</p>
          </div>
        )}

        {/* Search bar - compact overlay */}
        <div style={{ position: 'absolute', top: 12, left: 16, right: 56, zIndex: 10 }}>
          <div style={{ position: 'relative' }}>
            <Search size={18} strokeWidth={1.5} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--sec-text-muted)' }} />
            <input
              placeholder="Search venues..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                paddingLeft: 42,
                height: 44,
                borderRadius: 12,
                border: '1px solid var(--sec-border)',
                backgroundColor: 'var(--sec-bg-card)',
                color: 'var(--sec-text-primary)',
                fontSize: 15,
              }}
            />
          </div>
        </div>

        {/* Current Location - top right */}
        <button
          onClick={() => userLocation && map && (map.panTo(userLocation), map.setZoom(15))}
          className="sec-btn sec-btn-ghost"
          style={{
            position: 'absolute',
            top: 12,
            right: 16,
            zIndex: 10,
            width: 44,
            height: 44,
            borderRadius: 12,
            padding: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'var(--sec-bg-card)',
            border: '1px solid var(--sec-border)',
          }}
        >
          <Navigation size={20} strokeWidth={1.5} />
        </button>
      </div>

      {/* Selected Venue Card - show in list area when venue selected (cleaner) */}
      {selectedVenue && (
        <div style={{ padding: '0 16px 16px' }}>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="sec-card"
            style={{ borderRadius: 16, padding: 16, position: 'relative' }}
          >
              <button
                onClick={() => setSelectedVenue(null)}
                className="sec-nav-icon"
                style={{ position: 'absolute', top: 12, right: 12, width: 32, height: 32, borderRadius: '50%', padding: 0 }}
              >
                <X size={16} strokeWidth={1.5} />
              </button>

              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
                <div style={{ width: 64, height: 64, borderRadius: 12, backgroundColor: 'var(--sec-bg-elevated)', flexShrink: 0, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {selectedVenue.cover_image_url ? (
                    <img src={selectedVenue.cover_image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <MapPin size={24} strokeWidth={1.5} style={{ color: 'var(--sec-accent)' }} />
                  )}
                </div>

                <div style={{ flex: 1, minWidth: 0, paddingRight: 40 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <h3 style={{ fontWeight: 600, color: 'var(--sec-text-primary)' }}>{selectedVenue.name}</h3>
                    {selectedVenue.is_verified && <BadgeCheck size={16} strokeWidth={1.5} style={{ color: 'var(--sec-accent)' }} />}
                  </div>
                  <p style={{ fontSize: 13, color: 'var(--sec-text-muted)', marginTop: 4 }}>{selectedVenue.address || selectedVenue.city}</p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8, fontSize: 13 }}>
                    {selectedVenue.rating > 0 && (
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--sec-accent)' }}>
                        <Star size={14} strokeWidth={1.5} fill="currentColor" />
                        {selectedVenue.rating.toFixed(1)}
                      </span>
                    )}
                    {selectedVenue.venue_type && (
                      <span style={{ color: 'var(--sec-text-muted)', textTransform: 'capitalize' }}>{selectedVenue.venue_type.replace('_', ' ')}</span>
                    )}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
                <Link
                  to={createPageUrl(`VenueProfile?id=${selectedVenue.id}`)}
                  className="sec-btn sec-btn-primary"
                  style={{ flex: 1, padding: '10px 16px', textAlign: 'center', textDecoration: 'none' }}
                >
                  View Venue
                </Link>
                <a
                  href={`https://maps.google.com/?q=${selectedVenue.latitude},${selectedVenue.longitude}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="sec-btn sec-btn-secondary"
                  style={{ padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none' }}
                >
                  <Navigation size={16} strokeWidth={1.5} />
                  Directions
                </a>
              </div>
          </motion.div>
        </div>
      )}

      {/* Main content - venues/events list */}
      <div style={{ flex: 1, padding: '20px 16px 100px', overflowY: 'auto' }}>
        {/* Mode tabs - moved here for cleaner layout */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          {modes.map((mode) => (
            <button
              key={mode.value}
              onClick={() => setViewMode(mode.value)}
              style={{
                padding: '10px 18px',
                borderRadius: 12,
                fontSize: 14,
                fontWeight: 500,
                backgroundColor: viewMode === mode.value ? 'var(--sec-accent)' : 'var(--sec-bg-card)',
                color: viewMode === mode.value ? 'var(--sec-bg-base)' : 'var(--sec-text-secondary)',
                border: `1px solid ${viewMode === mode.value ? 'var(--sec-accent)' : 'var(--sec-border)'}`,
                transition: 'all 0.15s ease',
              }}
            >
              {mode.label}
            </button>
          ))}
        </div>

        <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16, color: 'var(--sec-text-primary)' }}>
          {viewMode === 'venues' ? 'Nightlife Venues' : viewMode === 'events' ? 'Upcoming Events' : 'Tables'}
        </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {viewMode === 'venues' && filteredItems.map((venue) => (
              <Link
                key={venue.id}
                to={createPageUrl(`VenueProfile?id=${venue.id}`)}
                className="sec-card"
                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 16, borderRadius: 12, textDecoration: 'none' }}
              >
                <div style={{ width: 48, height: 48, borderRadius: 12, backgroundColor: 'var(--sec-bg-elevated)', flexShrink: 0, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {venue.cover_image_url ? (
                    <img src={venue.cover_image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <MapPin size={20} strokeWidth={1.5} style={{ color: 'var(--sec-accent)' }} />
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h4 style={{ fontWeight: 500, color: 'var(--sec-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{venue.name}</h4>
                  <p style={{ fontSize: 13, color: 'var(--sec-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{venue.city} · {venue.venue_type?.replace('_', ' ')}</p>
                </div>
                <ChevronRight size={20} strokeWidth={1.5} style={{ color: 'var(--sec-text-muted)' }} />
              </Link>
            ))}
            {viewMode === 'events' && events.slice(0, 20).map((ev) => (
              <Link
                key={ev.id}
                to={createPageUrl(`EventDetails?id=${ev.id}`)}
                className="sec-card"
                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 16, borderRadius: 12, textDecoration: 'none' }}
              >
                <div style={{ width: 48, height: 48, borderRadius: 12, backgroundColor: 'var(--sec-bg-elevated)', flexShrink: 0, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {ev.cover_image_url ? (
                    <img src={ev.cover_image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <Calendar size={20} strokeWidth={1.5} style={{ color: 'var(--sec-accent)' }} />
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h4 style={{ fontWeight: 500, color: 'var(--sec-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev.title}</h4>
                  <p style={{ fontSize: 13, color: 'var(--sec-text-muted)' }}>{ev.city} · {ev.date && format(parseISO(ev.date), 'EEE, MMM d')}</p>
                </div>
                <ChevronRight size={20} strokeWidth={1.5} style={{ color: 'var(--sec-text-muted)' }} />
              </Link>
            ))}
            {viewMode === 'venues' && filteredItems.length === 0 && (
              <div style={{ padding: 32, textAlign: 'center', backgroundColor: 'var(--sec-bg-elevated)', borderRadius: 16, border: '1px solid var(--sec-border)' }}>
                <MapPin size={32} strokeWidth={1.5} style={{ color: 'var(--sec-text-muted)', marginBottom: 12 }} />
                <p style={{ color: 'var(--sec-text-primary)', fontWeight: 500, marginBottom: 4 }}>
                  {hasNoVenuesWithCoords ? 'No venues with locations yet' : hasSearchNoResults ? 'No venues match your search' : 'No venues'}
                </p>
                <p style={{ color: 'var(--sec-text-muted)', fontSize: 13 }}>
                  {hasNoVenuesWithCoords ? 'Venues will appear here once added.' : hasSearchNoResults ? 'Try a different search term.' : ''}
                </p>
              </div>
            )}
            {viewMode === 'events' && events.length === 0 && (
              <div style={{ padding: 32, textAlign: 'center', backgroundColor: 'var(--sec-bg-elevated)', borderRadius: 16, border: '1px solid var(--sec-border)' }}>
                <Calendar size={32} strokeWidth={1.5} style={{ color: 'var(--sec-text-muted)', marginBottom: 12 }} />
                <p style={{ color: 'var(--sec-text-primary)', fontWeight: 500 }}>No upcoming events</p>
              </div>
            )}
            {viewMode === 'tables' && (
              <div style={{ padding: 32, textAlign: 'center', backgroundColor: 'var(--sec-bg-elevated)', borderRadius: 16, border: '1px solid var(--sec-border)' }}>
                <p style={{ color: 'var(--sec-text-muted)' }}>Browse Venues or Events to find tables.</p>
              </div>
            )}
          </div>
        </div>

    </div>
  );
}