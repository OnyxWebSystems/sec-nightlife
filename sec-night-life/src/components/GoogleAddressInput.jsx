import React, { useEffect, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MapPin } from 'lucide-react';

// Load Google Maps API only once globally
if (typeof window !== 'undefined' && !window.__googleMapsScriptLoaded) {
  window.__googleMapsScriptLoaded = true;
  
  const script = document.createElement('script');
  script.src = `https://maps.googleapis.com/maps/api/js?key=${import.meta.env.VITE_GOOGLE_MAPS_API_KEY}&libraries=places`;
  script.async = true;
  script.defer = true;
  document.head.appendChild(script);
}

export default function GoogleAddressInput({ 
  value, 
  onChange, 
  onCoordinatesChange, 
  placeholder = "Enter address",
  label = "Full Address"
}) {
  const inputRef = useRef(null);
  const [autocomplete, setAutocomplete] = useState(null);
  const [suggestions, setSuggestions] = useState([]);

  useEffect(() => {
    const initAutocomplete = async () => {
      if (!inputRef.current) return;

      // Wait for Google Maps API to be ready
      let attempts = 0;
      while (!window.google?.maps?.places && attempts < 100) {
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
      }

      if (!window.google?.maps?.places || !inputRef.current) return;

      const autocompleteInstance = new window.google.maps.places.Autocomplete(
        inputRef.current,
        {
          types: ['address'],
          componentRestrictions: { country: 'za' },
        }
      );

      autocompleteInstance.addListener('place_changed', () => {
        const place = autocompleteInstance.getPlace();
        
        if (place.geometry) {
          const address = place.formatted_address;
          onChange(address);
          
          if (onCoordinatesChange) {
            onCoordinatesChange({
              latitude: place.geometry.location.lat(),
              longitude: place.geometry.location.lng(),
              address: address
            });
          }
        }
      });

      setAutocomplete(autocompleteInstance);
    };

    initAutocomplete();
  }, [onChange, onCoordinatesChange]);

  return (
    <div>
      <Label className="text-gray-400 text-sm flex items-center gap-2">
        <MapPin className="w-4 h-4" />
        {label}
      </Label>
      <Input
        ref={inputRef}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-2 h-12 bg-[#141416] border-[#262629] rounded-xl"
      />
      <p className="text-xs text-gray-500 mt-1">
        Start typing to see address suggestions
      </p>
    </div>
  );
}