import React, { useEffect, useState } from 'react';

// Wait for Google Maps API to be ready (loaded by GoogleAddressInput or another component)
const waitForMapsAPI = () => {
  return new Promise((resolve) => {
    if (window.google?.maps?.Map) {
      resolve();
    } else {
      const checkInterval = setInterval(() => {
        if (window.google?.maps?.Map) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 100);
      setTimeout(() => clearInterval(checkInterval), 10000);
    }
  });
};

export default function GoogleMapDisplay({ latitude = -33.9249, longitude = 18.4241, address = "Cape Town, South Africa" }) {
  const [map, setMap] = useState(null);
  const mapRef = React.useRef(null);

  useEffect(() => {
    const initMap = async () => {
      if (!mapRef.current) return;
      await waitForMapsAPI();
      if (!window.google?.maps) return;

      const newMap = new window.google.maps.Map(mapRef.current, {
        zoom: 15,
        center: { lat: latitude, lng: longitude },
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
            featureType: 'administrative.locality',
            elementType: 'labels.text.fill',
            stylers: [{ color: '#ffffff' }],
          },
          {
            featureType: 'poi',
            elementType: 'labels.text.fill',
            stylers: [{ color: '#757575' }],
          },
          {
            featureType: 'poi.park',
            elementType: 'geometry',
            stylers: [{ color: '#181818' }],
          },
          {
            featureType: 'poi.park',
            elementType: 'labels.text.fill',
            stylers: [{ color: '#9e9e9e' }],
          },
          {
            featureType: 'road',
            elementType: 'geometry.fill',
            stylers: [{ color: '#2c2c2c' }],
          },
          {
            featureType: 'road',
            elementType: 'labels.text.fill',
            stylers: [{ color: '#8c8c8c' }],
          },
          {
            featureType: 'transit',
            elementType: 'geometry',
            stylers: [{ color: '#222222' }],
          },
          {
            featureType: 'water',
            elementType: 'geometry',
            stylers: [{ color: '#0a0a0b' }],
          },
        ],
      });

      // Add marker
      new window.google.maps.Marker({
        position: { lat: latitude, lng: longitude },
        map: newMap,
        title: address,
        icon: {
          path: window.google.maps.SymbolPath.CIRCLE,
          scale: 8,
          fillColor: '#C0C0C0',
          fillOpacity: 1,
          strokeColor: '#ffffff',
          strokeWeight: 2,
        },
      });

      setMap(newMap);
    };

    initMap();
  }, [latitude, longitude, address]);

  return (
    <div 
      ref={mapRef}
      className="w-full h-64 rounded-xl overflow-hidden border border-[#262629]"
    />
  );
}