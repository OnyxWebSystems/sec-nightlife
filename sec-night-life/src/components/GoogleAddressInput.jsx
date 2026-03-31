import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MapPin } from 'lucide-react';

import { useGoogleMaps } from '@/lib/GoogleMapsProvider';

function componentByType(addressComponents, typeName) {
  if (!Array.isArray(addressComponents)) return null;
  return addressComponents.find((c) => Array.isArray(c.types) && c.types.includes(typeName)) || null;
}

function parsePlaceToStructured(place) {
  if (!place) return null;

  const formattedAddress = place.formatted_address || '';
  const addressComponents = place.address_components || [];

  const streetNumber = componentByType(addressComponents, 'street_number')?.long_name;
  const route = componentByType(addressComponents, 'route')?.long_name;
  const street = [streetNumber, route].filter(Boolean).join(' ').trim() || route || formattedAddress;

  const suburb =
    componentByType(addressComponents, 'neighborhood')?.long_name ||
    componentByType(addressComponents, 'sublocality')?.long_name ||
    componentByType(addressComponents, 'sublocality_level_1')?.long_name ||
    componentByType(addressComponents, 'postal_town')?.long_name ||
    '';

  const city =
    componentByType(addressComponents, 'locality')?.long_name ||
    componentByType(addressComponents, 'postal_town')?.long_name ||
    componentByType(addressComponents, 'administrative_area_level_2')?.long_name ||
    '';

  const province = componentByType(addressComponents, 'administrative_area_level_1')?.long_name || '';
  const country = componentByType(addressComponents, 'country')?.short_name || '';

  const lat = place.geometry?.location?.lat ? place.geometry.location.lat() : null;
  const lng = place.geometry?.location?.lng ? place.geometry.location.lng() : null;

  // Normalize country to ZA if Google returns ZA/za.
  const normalizedCountry =
    typeof country === 'string' && country.toLowerCase() === 'za' ? 'ZA' : (country || 'ZA');

  return {
    formattedAddress,
    street,
    suburb,
    city,
    province,
    country: normalizedCountry,
    latitude: typeof lat === 'number' ? lat : null,
    longitude: typeof lng === 'number' ? lng : null,
  };
}

function toStructuredValue(value) {
  if (!value) return null;
  if (typeof value === 'string') {
    return {
      formattedAddress: value,
      street: value,
      suburb: '',
      city: '',
      province: '',
      country: 'ZA',
      latitude: null,
      longitude: null,
    };
  }
  // Assume already structured (best effort).
  return value;
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
  const { status: mapsStatus } = useGoogleMaps();

  const structuredValue = useMemo(() => toStructuredValue(value), [value]);
  const [draft, setDraft] = useState(structuredValue?.formattedAddress || '');

  useEffect(() => {
    setDraft(structuredValue?.formattedAddress || '');
  }, [structuredValue?.formattedAddress]);

  useEffect(() => {
    if (mapsStatus !== 'ready') return;
    if (!inputRef.current) return;
    if (!window.google?.maps?.places) return;
    if (autocomplete) return;

    const autocompleteInstance = new window.google.maps.places.Autocomplete(inputRef.current, {
      types: ['address'],
      componentRestrictions: { country: 'za' },
    });

    autocompleteInstance.addListener('place_changed', () => {
      const place = autocompleteInstance.getPlace();
      const structured = parsePlaceToStructured(place);
      if (!structured) return;

      setDraft(structured.formattedAddress || '');
      onChange(structured);

      if (onCoordinatesChange) {
        onCoordinatesChange({
          latitude: structured.latitude,
          longitude: structured.longitude,
          address: structured.formattedAddress,
        });
      }
    });

    setAutocomplete(autocompleteInstance);
  }, [mapsStatus, autocomplete, onChange, onCoordinatesChange]);

  const setStructuredFromDraft = (nextDraft) => {
    const base = structuredValue || toStructuredValue('');
    const next = {
      ...base,
      formattedAddress: nextDraft,
      street: nextDraft,
      latitude: null,
      longitude: null,
    };
    onChange(next);
    if (onCoordinatesChange) {
      onCoordinatesChange({ latitude: null, longitude: null, address: nextDraft });
    }
  };

  return (
    <div>
      <Label className="text-gray-400 text-sm flex items-center gap-2">
        <MapPin className="w-4 h-4" />
        {label}
      </Label>

      {mapsStatus === 'error' ? (
        <div className="mt-2 space-y-4">
          <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-sm">
            Maps failed to load. You can still register; location-based features will improve once Maps works.
          </div>

          <div>
            <Input
              placeholder={placeholder}
              value={draft}
              onChange={(e) => {
                const next = e.target.value;
                setDraft(next);
                setStructuredFromDraft(next);
              }}
              className="mt-0 h-12 bg-[#141416] border-[#262629] rounded-xl"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-gray-400 text-xs">Suburb</Label>
              <Input
                placeholder="e.g. Sandton"
                value={structuredValue?.suburb || ''}
                onChange={(e) => onChange({ ...(structuredValue || toStructuredValue('')), suburb: e.target.value })}
                className="mt-2 h-12 bg-[#141416] border-[#262629] rounded-xl"
              />
            </div>
            <div>
              <Label className="text-gray-400 text-xs">Province</Label>
              <Input
                placeholder="e.g. Gauteng"
                value={structuredValue?.province || ''}
                onChange={(e) => onChange({ ...(structuredValue || toStructuredValue('')), province: e.target.value })}
                className="mt-2 h-12 bg-[#141416] border-[#262629] rounded-xl"
              />
            </div>
          </div>
        </div>
      ) : (
        <>
          <Input
            ref={inputRef}
            placeholder={placeholder}
            value={draft}
            onChange={(e) => {
              const nextDraft = e.target.value;
              setDraft(nextDraft);
              // Update parent so registration isn't blocked even if the user doesn't select a suggestion.
              setStructuredFromDraft(nextDraft);
            }}
            className="mt-2 h-12 bg-[#141416] border-[#262629] rounded-xl"
          />
          <p className="text-xs text-gray-500 mt-1">
            {mapsStatus === 'loading' ? 'Loading maps...' : 'Start typing to see address suggestions'}
          </p>
        </>
      )}
    </div>
  );
}