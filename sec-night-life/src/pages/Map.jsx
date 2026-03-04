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
import { motion, AnimatePresence } from 'framer-motion';
import { format, parseISO } from 'date-fns';

// Ensure Google Maps API is loaded
const loadGoogleMapsAPI = () => {
  if (window.__googleMapsApiLoading) return window.__googleMapsApiPromise;
  
  if (window.google?.maps?.Map) {
    return Promise.resolve();
  }

  // Load script if not already loaded
  if (!window.__googleMapsScriptLoaded) {
    window.__googleMapsScriptLoaded = true;
    const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      console.error('VITE_GOOGLE_MAPS_API_KEY environment variable is not set');
      return Promise.resolve();
    }
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
    script.async = true;
    script.defer = true;
    script.onerror = () => console.error('Failed to load Google Maps script');
    document.head.appendChild(script);
  }

  window.__googleMapsApiLoading = true;
  window.__googleMapsApiPromise = new Promise((resolve) => {
    const checkInterval = setInterval(() => {
      if (window.google?.maps?.Map) {
        clearInterval(checkInterval);
        resolve();
      }
    }, 100);
    setTimeout(() => {
      clearInterval(checkInterval);
      resolve();
    }, 10000);
  });

  return window.__googleMapsApiPromise;
};

// Johannesburg coordinates as default
const DEFAULT_CENTER = { lat: -26.2041, lng: 28.0473 };

export default function Map() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedVenue, setSelectedVenue] = useState(null);
  const [viewMode, setViewMode] = useState('venues'); // 'venues' | 'events' | 'tables'
  const [userLocation, setUserLocation] = useState(null);
  const [showList, setShowList] = useState(false);
  const [map, setMap] = useState(null);
  const mapRef = React.useRef(null);

  const { data: venues = [] } = useQuery({
    queryKey: ['map-venues'],
    queryFn: () => dataService.Venue.filter({ compliance_status: 'approved' }),
  });

  const { data: events = [] } = useQuery({
    queryKey: ['map-events'],
    queryFn: () => dataService.Event.filter({ status: 'published' }),
  });

  const venuesWithCoords = venues.filter(v => v.latitude && v.longitude);

  const filteredItems = venuesWithCoords.filter(venue =>
    venue.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    venue.city?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const modes = [
    { value: 'venues', label: 'Venues' },
    { value: 'events', label: 'Events' },
    { value: 'tables', label: 'Tables' },
  ];

  // Initialize Google Map
  useEffect(() => {
    const initMap = async () => {
      if (!mapRef.current) {
        console.warn('Map container ref not available');
        return;
      }
      if (map) return;

      await loadGoogleMapsAPI();

      if (!window.google?.maps?.Map) {
        console.error('Google Maps API not available');
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
      }
    };

    initMap();
  }, []);

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
  const displayItems = viewMode === 'venues' ? filteredItems : viewMode === 'events' ? events : [];

  return (
    <div style={{ minHeight: '100vh', position: 'relative', backgroundColor: 'var(--sec-bg-base)', display: 'flex', flexDirection: 'column' }}>
      {/* Google Map - background, only visible when loaded */}
      <div ref={mapRef} style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '40vh', minHeight: 200, opacity: mapLoaded ? 1 : 0, backgroundColor: 'var(--sec-bg-elevated)' }} />

      {/* Search Overlay */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 1000, padding: 16 }}>
        <div style={{ position: 'relative' }}>
          <Search size={20} strokeWidth={1.5} style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', color: 'var(--sec-text-muted)' }} />
          <input
            placeholder="Search locations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="sec-input"
            style={{ width: '100%', paddingLeft: 44, height: 48, borderRadius: 12 }}
          />
        </div>

        {/* Mode Tabs */}
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          {modes.map((mode) => (
            <button
              key={mode.value}
              onClick={() => setViewMode(mode.value)}
              style={{
                padding: '8px 16px',
                borderRadius: 999,
                fontSize: 13,
                fontWeight: 500,
                backgroundColor: viewMode === mode.value ? 'var(--sec-accent)' : 'var(--sec-bg-card)',
                color: viewMode === mode.value ? 'var(--sec-bg-base)' : 'var(--sec-text-muted)',
                border: `1px solid ${viewMode === mode.value ? 'var(--sec-accent)' : 'var(--sec-border)'}`,
                transition: 'all 0.15s ease'
              }}
            >
              {mode.label}
            </button>
          ))}
        </div>
      </div>

      {/* Toggle List Button */}
      <button
        onClick={() => setShowList(!showList)}
        className="sec-nav-icon"
        style={{ position: 'absolute', bottom: 112, right: 16, zIndex: 1000, width: 48, height: 48, borderRadius: '50%' }}
      >
        <MapPin size={20} strokeWidth={1.5} />
      </button>

      {/* Current Location Button */}
      <button
        onClick={() => {
          if (userLocation && map) {
            map.panTo(userLocation);
            map.setZoom(15);
          }
        }}
        className="sec-btn sec-btn-primary"
        style={{ position: 'absolute', bottom: 112, left: 16, zIndex: 1000, width: 48, height: 48, borderRadius: '50%', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      >
        <Navigation size={20} strokeWidth={1.5} />
      </button>

      {/* Selected Venue Card */}
      <AnimatePresence>
        {selectedVenue && (
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            style={{ position: 'absolute', bottom: 112, left: 16, right: 16, zIndex: 1000 }}
          >
            <div className="sec-card" style={{ borderRadius: 16, padding: 16, position: 'relative' }}>
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
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main content - always show venues/events list */}
      <div style={{ flex: 1, marginTop: 140, padding: '0 16px 32px 24px', overflowY: 'auto', zIndex: 10, position: 'relative' }}>
        <h3 style={{ fontSize: 17, fontWeight: 600, marginBottom: 16, color: 'var(--sec-text-primary)' }}>
          {viewMode === 'venues' ? 'Venues' : viewMode === 'events' ? 'Events' : 'Tables'}
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
              <p style={{ color: 'var(--sec-text-muted)', padding: 24, textAlign: 'center' }}>No venues match your search</p>
            )}
            {viewMode === 'events' && events.length === 0 && (
              <p style={{ color: 'var(--sec-text-muted)', padding: 24, textAlign: 'center' }}>No upcoming events</p>
            )}
            {viewMode === 'tables' && (
              <p style={{ color: 'var(--sec-text-muted)', padding: 24, textAlign: 'center' }}>Tables will appear here. Switch to Venues or Events to browse.</p>
            )}
          </div>
        </div>

      {/* List Panel (slide-up when map loaded) */}
      <AnimatePresence>
        {showList && mapLoaded && (
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            style={{ position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 1001, backgroundColor: 'var(--sec-bg-base)', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '60vh', overflow: 'hidden', borderTop: '1px solid var(--sec-border)' }}
          >
            <div style={{ padding: 16, borderBottom: '1px solid var(--sec-border)' }}>
              <div style={{ width: 48, height: 4, borderRadius: 999, backgroundColor: 'var(--sec-border)', margin: '0 auto 16px' }} />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <h3 style={{ fontWeight: 600, color: 'var(--sec-text-primary)' }}>Nearby {viewMode}</h3>
                <button onClick={() => setShowList(false)} className="sec-nav-icon" style={{ width: 40, height: 40 }}>
                  <X size={20} strokeWidth={1.5} />
                </button>
              </div>
            </div>

            <div style={{ overflowY: 'auto', maxHeight: 'calc(60vh - 80px)', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
              {viewMode === 'venues' && filteredItems.map((venue) => (
                <button
                  key={venue.id}
                  onClick={() => { setSelectedVenue(venue); setShowList(false); }}
                  className="sec-card"
                  style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: 12, borderRadius: 12, textAlign: 'left' }}
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
                    <p style={{ fontSize: 13, color: 'var(--sec-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{venue.city}</p>
                  </div>
                  <ChevronRight size={20} strokeWidth={1.5} style={{ color: 'var(--sec-text-muted)' }} />
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}