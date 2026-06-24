import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import * as authService from '@/services/authService';
import { dataService } from '@/services/dataService';
import { apiGet, apiPatch, apiPost } from '@/api/client';
import { uploadToCloudinary } from '@/lib/cloudinaryUpload';
import { 
  Building,
  Upload,
  Check,
  ChevronRight,
  ChevronLeft,
  MapPin,
  Shield,
  CreditCard,
  X,
  UtensilsCrossed,
} from 'lucide-react';
import ImageCropDialog from '@/components/profile/ImageCropDialog';
import { useImageCropUpload } from '@/hooks/useImageCropUpload';
import { COVER_CROP_DIALOG_PROPS } from '@/lib/coverImageAspect';
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { useQuery } from '@tanstack/react-query';
import GoogleAddressInput from '@/components/GoogleAddressInput';
import GoogleMapDisplay from '@/components/GoogleMapDisplay';
import SecLogo from '@/components/ui/SecLogo';
import RefundPolicyNote from '@/components/legal/RefundPolicyNote';
import MenuCatalogBrowser from '@/components/menu/MenuCatalogBrowser';
import PageBackHeader from '@/components/layout/PageBackHeader';
import { useBusinessVenueScope } from '@/hooks/useBusinessVenueScope';
import { staffVenueApiBase } from '@/lib/staffVenueApi';

const VENUE_TYPES = [
  { value: 'nightclub', label: 'Nightclub' },
  { value: 'lounge', label: 'Lounge' },
  { value: 'bar', label: 'Bar' },
  { value: 'restaurant', label: 'Restaurant' },
  { value: 'event_company', label: 'Event Company' },
  { value: 'rooftop', label: 'Rooftop' },
  { value: 'beach_club', label: 'Beach Club' },
];

const CITIES = [
  'Johannesburg', 'Cape Town', 'Durban', 'Pretoria', 'Sandton', 
  'Port Elizabeth', 'Bloemfontein', 'East London', 'Nelspruit', 'Polokwane'
];
const DRAFT_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

function venueOnboardingDraftKey(userId) {
  return `sec-venue-onboarding-draft:${userId}`;
}

function venueOnboardingNewDraftKey(userId) {
  return `sec-venue-onboarding-draft-new:${userId}`;
}

function loadParsedDraftFromKey(key) {
  if (!key) return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.savedAt !== 'number') return null;
    if (Date.now() - parsed.savedAt > DRAFT_MAX_AGE_MS) {
      localStorage.removeItem(key);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

const INITIAL_FORM_DATA = {
  name: '',
  venue_type: '',
  bio: '',
  address: '',
  city: '',
  suburb: '',
  province: '',
  latitude: null,
  longitude: null,
  phone: '',
  email: '',
  website: '',
  instagram: '',
  capacity: '',
  age_limit: 18,
  logo_url: '',
  cover_image_url: '',
  cipc_document_url: '',
  director_id_url: '',
  sars_document_url: '',
  annual_returns_url: '',
  liquor_license_url: '',
  liquor_license_expiry: '',
  payout_account_name: '',
  payout_account_number: '',
  payout_bank_code: ''
};

function loadParsedDraft(userId) {
  return loadParsedDraftFromKey(venueOnboardingDraftKey(userId));
}

function clearVenueOnboardingDraft(userId) {
  if (!userId) return;
  try {
    localStorage.removeItem(venueOnboardingDraftKey(userId));
    localStorage.removeItem(venueOnboardingNewDraftKey(userId));
  } catch {
    /* ignore */
  }
}

/** Maps GET /api/venues/:id response into onboarding form shape. */
function mapVenueDetailToForm(v) {
  if (!v) return { ...INITIAL_FORM_DATA };
  return {
    ...INITIAL_FORM_DATA,
    name: v.name ?? '',
    venue_type: v.venue_type ?? '',
    bio: v.bio ?? '',
    address: v.address ?? '',
    city: v.city ?? '',
    suburb: v.suburb ?? '',
    province: v.province ?? '',
    latitude: v.latitude ?? null,
    longitude: v.longitude ?? null,
    phone: v.phone ?? '',
    email: v.email ?? '',
    website: v.website ?? '',
    instagram: v.instagram ?? '',
    capacity: v.capacity != null ? String(v.capacity) : '',
    age_limit: v.age_limit != null ? v.age_limit : 18,
    logo_url: v.logo_url ?? '',
    cover_image_url: v.cover_image_url ?? ''
  };
}

const BRANDING_FIELDS = new Set(['logo_url', 'cover_image_url']);
const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

const IMAGE_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/svg+xml',
  'image/avif',
  'image/heic',
  'image/heif',
]);

function fileExtension(name) {
  const m = (name || '').toLowerCase().match(/\.([a-z0-9]+)$/);
  return m ? m[1] : '';
}

const BRANDING_EXT = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg', 'heic', 'heif', 'avif']);
const COMPLIANCE_EXT = new Set(['pdf', ...BRANDING_EXT]);

/**
 * Returns Cloudinary resource_type: image for photos, raw for PDFs.
 * @param {string} field
 * @param {File} file
 */
function assertAllowedUpload(field, file) {
  const ext = fileExtension(file.name);
  const isBranding = BRANDING_FIELDS.has(field);

  if (isBranding) {
    if (IMAGE_MIME.has(file.type)) return 'image';
    if (!file.type && BRANDING_EXT.has(ext)) return 'image';
    throw new Error('Please choose an image file (JPG, PNG, WebP, GIF, SVG, HEIC, or AVIF).');
  }

  const isPdf = file.type === 'application/pdf' || ext === 'pdf';
  if (isPdf) return 'raw';
  if (IMAGE_MIME.has(file.type)) return 'image';
  if (!file.type && BRANDING_EXT.has(ext)) return 'image';
  throw new Error('Only PDF, JPG, PNG, WebP, SVG, and other common image formats are allowed.');
}

function uploadFieldLabel(field) {
  if (field === 'logo_url') return 'Logo';
  if (field === 'cover_image_url') return 'Cover image';
  return 'Document';
}

/** @returns {Promise<string|null>} uploaded file URL on success */
async function uploadVenueFile(field, file, setters) {
  const { setUploadProgress, setFormData, setError } = setters;
  setUploadProgress((prev) => ({ ...prev, [field]: 'uploading' }));
  setError('');
  toast.info(`${uploadFieldLabel(field)} upload started...`);
  try {
    if (file.size > MAX_UPLOAD_BYTES) {
      throw new Error(`File is too large. Maximum size is ${MAX_UPLOAD_BYTES / (1024 * 1024)}MB.`);
    }
    const resourceType = assertAllowedUpload(field, file);
    const data = await uploadToCloudinary(file, {
      resourceType,
      publicId: `${Date.now()}-venue`.replace(/[^a-zA-Z0-9/_-]/g, '-'),
    });
    const url = data?.file_url;
    if (!url) throw new Error('Upload returned no URL.');
    setFormData((prev) => ({ ...prev, [field]: url }));
    setUploadProgress((prev) => ({ ...prev, [field]: 'done' }));
    toast.success(`${uploadFieldLabel(field)} uploaded successfully.`);
    return url;
  } catch (error) {
    setUploadProgress((prev) => ({ ...prev, [field]: 'error' }));
    const message = error?.message || 'Failed to upload.';
    setError(message);
    toast.error(message);
    return null;
  }
}

function normalizeOptionalEmail(value) {
  const v = (value || '').trim();
  if (!v) return null;
  const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
  if (!ok) throw new Error('Please enter a valid email address for the venue.');
  return v.toLowerCase();
}

function normalizeOptionalWebsite(value) {
  const raw = (value || '').trim();
  if (!raw) return null;
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const u = new URL(withProtocol);
    if (!u.hostname) throw new Error('missing-host');
    return u.toString();
  } catch {
    throw new Error('Please enter a valid website URL (e.g. https://example.com).');
  }
}

export default function VenueOnboarding() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isEditMode = searchParams.get('edit') === '1';
  const isNewVenue = searchParams.get('new') === '1';
  const venueScope = useBusinessVenueScope();
  const staffCtxToken = searchParams.get('staff_ctx')?.trim() || venueScope.staffContextToken || null;
  const isStaffEdit = Boolean(staffCtxToken) && isEditMode && !isNewVenue;
  const staffVenueBase = staffVenueApiBase(staffCtxToken);
  const maxStep = isStaffEdit ? 3 : 5;
  const [step, setStep] = useState(1);
  const [user, setUser] = useState(null);
  const [bootstrapped, setBootstrapped] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [uploadProgress, setUploadProgress] = useState({});
  const [selectedPlan, setSelectedPlan] = useState('basic');
  const [venueId, setVenueId] = useState(null);
  const [menuDraftItems, setMenuDraftItems] = useState([]);
  const [ensuringVenueForMenu, setEnsuringVenueForMenu] = useState(false);
  const [brandingPreviewKey, setBrandingPreviewKey] = useState(0);

  const persistBrandingField = useCallback(
    async (field, url) => {
      if (!url) return;
      if (isNewVenue && !venueId) return;
      let id = venueId;
      if (!id) {
        if (isNewVenue) return;
        try {
          const mines = await dataService.Venue.mine();
          id = mines?.find((v) => v.is_owner === true || v.isOwner === true)?.id ?? null;
          if (id) setVenueId(id);
        } catch {
          return;
        }
      }
      if (!id) return;
      try {
        if (isStaffEdit && staffVenueBase) {
          await apiPatch(staffVenueBase, { [field]: url });
        } else {
          await dataService.Venue.update(id, { [field]: url });
        }
      } catch (e) {
        toast.error(e?.message || 'Saved locally — will sync when you finish onboarding.');
      }
    },
    [venueId, isNewVenue, isStaffEdit, staffVenueBase]
  );

  const logoCrop = useImageCropUpload({
    onCropped: async (file) => {
      const url = await uploadVenueFile('logo_url', file, { setUploadProgress, setFormData, setError });
      if (url) {
        setBrandingPreviewKey((k) => k + 1);
        await persistBrandingField('logo_url', url);
      }
    },
  });
  const coverCrop = useImageCropUpload({
    onCropped: async (file) => {
      const url = await uploadVenueFile('cover_image_url', file, { setUploadProgress, setFormData, setError });
      if (url) {
        setBrandingPreviewKey((k) => k + 1);
        await persistBrandingField('cover_image_url', url);
      }
    },
  });
  const draftSaveTimerRef = useRef(null);

  const addedCatalogIds = useMemo(
    () => new Set(menuDraftItems.map((i) => i.catalog_item_id).filter(Boolean)),
    [menuDraftItems]
  );

  const handleAddMenuDraft = (item) => {
    if (item.catalog_item_id && addedCatalogIds.has(item.catalog_item_id)) {
      toast.info('Already in your menu');
      return;
    }
    setMenuDraftItems((items) => [...items, item]);
  };

  const { data: liveMenuItems = [] } = useQuery({
    queryKey: ['venue-menu-onboarding', venueId],
    queryFn: () => apiGet(`/api/business/venues/${venueId}/menu-items`),
    enabled: !!venueId && step === 3,
  });

  const liveMenuCatalogIds = useMemo(
    () => new Set(liveMenuItems.map((i) => i.catalog_item_id).filter(Boolean)),
    [liveMenuItems]
  );

  const menuItemCount = venueId ? liveMenuItems.length : menuDraftItems.length;

  const [formData, setFormData] = useState(() => ({ ...INITIAL_FORM_DATA }));

  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    if (step !== 3 || venueId || !bootstrapped) return;
    if (!formData.name?.trim() || !formData.venue_type || !formData.city?.trim()) return;

    let cancelled = false;
    (async () => {
      setEnsuringVenueForMenu(true);
      try {
        const payload = {
          name: formData.name.trim(),
          venue_type: formData.venue_type,
          city: formData.city.trim(),
          capacity: parseInt(formData.capacity, 10) || 0,
          age_limit: parseInt(formData.age_limit, 10) || 18,
        };
        if (formData.logo_url) payload.logo_url = formData.logo_url;
        if (formData.cover_image_url) payload.cover_image_url = formData.cover_image_url;
        const v = await upsertVenue(payload);
        if (!cancelled && v?.id) setVenueId(v.id);
      } catch (e) {
        if (!cancelled) toast.error(e?.message || 'Complete venue info before adding menu items.');
      } finally {
        if (!cancelled) setEnsuringVenueForMenu(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [step, venueId, bootstrapped, formData.name, formData.venue_type, formData.city]);

  useEffect(() => {
    if (!bootstrapped || !user?.id) return;
    if (draftSaveTimerRef.current) clearTimeout(draftSaveTimerRef.current);
    const draftKey = isNewVenue
      ? venueOnboardingNewDraftKey(user.id)
      : venueOnboardingDraftKey(user.id);
    draftSaveTimerRef.current = setTimeout(() => {
      try {
        localStorage.setItem(
          draftKey,
          JSON.stringify({
            savedAt: Date.now(),
            step,
            selectedPlan,
            formData
          })
        );
      } catch {
        /* storage full or private mode */
      }
    }, 500);
    return () => {
      if (draftSaveTimerRef.current) clearTimeout(draftSaveTimerRef.current);
    };
  }, [bootstrapped, user?.id, step, selectedPlan, formData, isNewVenue]);

  const checkAuth = async () => {
    try {
      const currentUser = await authService.getCurrentUser();
      setUser(currentUser);
      const uid = currentUser?.id;
      if (!uid) {
        setBootstrapped(true);
        return;
      }

      const draft = loadParsedDraft(uid);
      const editVenueId = searchParams.get('venueId');
      let mines = [];
      try {
        mines = await dataService.Venue.mine();
      } catch {
        mines = [];
      }
      const ownedVenues = mines.filter((v) => v.is_owner === true || v.isOwner === true);

      if (isNewVenue) {
        setVenueId(null);
        setFormData({ ...INITIAL_FORM_DATA });
        setStep(1);
        setSelectedPlan('basic');
        try {
          localStorage.removeItem(venueOnboardingDraftKey(uid));
        } catch {
          /* ignore */
        }
        const newDraft = loadParsedDraftFromKey(venueOnboardingNewDraftKey(uid));
        if (newDraft?.formData && typeof newDraft.formData === 'object') {
          setFormData({ ...INITIAL_FORM_DATA, ...newDraft.formData });
          if (typeof newDraft.step === 'number' && newDraft.step >= 1 && newDraft.step <= 5) {
            setStep(newDraft.step);
          }
          if (newDraft.selectedPlan === 'basic' || newDraft.selectedPlan === 'premium') {
            setSelectedPlan(newDraft.selectedPlan);
          }
          toast.info('Continue your new venue registration where you left off.');
        }
      } else if (isStaffEdit && staffCtxToken) {
        const base = staffVenueApiBase(staffCtxToken);
        const detail = await apiGet(base);
        setVenueId(detail.id);
        setFormData(mapVenueDetailToForm(detail));
      } else if (editVenueId || ownedVenues.length > 0) {
        const targetId = editVenueId || ownedVenues[0].id;
        setVenueId(targetId);
        let detail = ownedVenues.find((v) => v.id === targetId) || ownedVenues[0];
        try {
          detail = await apiGet(`/api/venues/${targetId}`);
        } catch {
          /* use list row only */
        }
        setFormData(mapVenueDetailToForm(detail));
        if (draft && typeof draft.step === 'number' && draft.step >= 1 && draft.step <= 5) {
          setStep(draft.step);
        }
        if (draft?.selectedPlan === 'basic' || draft?.selectedPlan === 'premium') {
          setSelectedPlan(draft.selectedPlan);
        }
      } else if (draft?.formData && typeof draft.formData === 'object') {
        setFormData({ ...INITIAL_FORM_DATA, ...draft.formData });
        if (typeof draft.step === 'number' && draft.step >= 1 && draft.step <= 5) {
          setStep(draft.step);
        }
        if (draft.selectedPlan === 'basic' || draft.selectedPlan === 'premium') {
          setSelectedPlan(draft.selectedPlan);
        }
        toast.info('Continue where you left off — your draft was restored.');
      }
    } catch (e) {
      authService.redirectToLogin(createPageUrl('VenueOnboarding'));
    } finally {
      setBootstrapped(true);
    }
  };

  const handleFileUpload = async (field, e) => {
    const input = e.target;
    const file = input.files?.[0];
    if (!file) return;

    setUploadProgress(prev => ({ ...prev, [field]: 'uploading' }));
    setError('');
    toast.info(`${uploadFieldLabel(field)} upload started...`);

    try {
      if (file.size > MAX_UPLOAD_BYTES) {
        throw new Error(`File is too large. Maximum size is ${MAX_UPLOAD_BYTES / (1024 * 1024)}MB.`);
      }

      const resourceType = assertAllowedUpload(field, file);

      const data = await uploadToCloudinary(file, {
        resourceType,
        publicId: `${Date.now()}-${file.name.replace(/\.[^.]+$/, '')}`.replace(/[^a-zA-Z0-9/_-]/g, '-'),
        filenameOverride: file.name,
      });
      const url = data?.file_url;
      if (!url) throw new Error('Upload returned no URL.');

      setFormData(prev => ({ ...prev, [field]: url }));
      setUploadProgress(prev => ({ ...prev, [field]: 'done' }));
      toast.success(`${uploadFieldLabel(field)} uploaded successfully.`);
    } catch (error) {
      setUploadProgress(prev => ({ ...prev, [field]: 'error' }));
      const message = error?.message || 'Failed to upload document.';
      setError(message);
      toast.error(message);
    } finally {
      input.value = '';
    }
  };

  const upsertVenue = async (venueData) => {
    if (isStaffEdit && staffVenueBase) {
      return apiPatch(staffVenueBase, venueData);
    }

    const editId = searchParams.get('venueId') || venueId;

    if (isNewVenue) {
      const created = await dataService.Venue.create(venueData);
      if (created?.id) setVenueId(created.id);
      return created;
    }

    if (editId) {
      return dataService.Venue.update(editId, venueData);
    }

    const existingVenues = user?.id
      ? (await dataService.Venue.mine()).filter((v) => v.is_owner === true || v.isOwner === true)
      : [];
    if (existingVenues.length > 0) {
      return dataService.Venue.update(existingVenues[0].id, venueData);
    }

    return dataService.Venue.create(venueData);
  };

  const syncPaymentStatus = async (paymentCompleted) => {
    await apiPatch('/api/users/profile', {
      payment_setup_complete: paymentCompleted,
      onboarding_complete: true,
    });
  };

  const handleVenueCompletion = async ({ paymentCompleted }) => {
    setIsSubmitting(true);
    setError('');

    try {
      const normalizedVenueEmail = normalizeOptionalEmail(formData.email);
      const normalizedWebsite = normalizeOptionalWebsite(formData.website);
      const venueData = {
        name: formData.name,
        venue_type: formData.venue_type,
        city: formData.city,
        capacity: parseInt(formData.capacity) || 0,
        age_limit: parseInt(formData.age_limit) || 18,
      };

      if (formData.bio) venueData.bio = formData.bio;
      if (formData.address) venueData.address = formData.address;
      if (formData.suburb) venueData.suburb = formData.suburb;
      if (formData.province) venueData.province = formData.province;
      if (formData.latitude != null) venueData.latitude = formData.latitude;
      if (formData.longitude != null) venueData.longitude = formData.longitude;
      if (formData.phone) venueData.phone = formData.phone;
      if (normalizedVenueEmail) venueData.email = normalizedVenueEmail;
      if (normalizedWebsite) venueData.website = normalizedWebsite;
      if (formData.instagram) venueData.instagram = formData.instagram;
      if (formData.logo_url) venueData.logo_url = formData.logo_url;
      if (formData.cover_image_url) venueData.cover_image_url = formData.cover_image_url;

      const createdVenue = await upsertVenue(venueData);
      const resolvedVenueId = createdVenue?.id || venueId;

      if (resolvedVenueId && menuDraftItems.length > 0) {
        try {
          const catalogRows = menuDraftItems.filter((i) => i.catalog_item_id);
          const customRows = menuDraftItems.filter((i) => !i.catalog_item_id);
          const withPhoto = (rows) => rows.filter((i) => i.image_url && String(i.image_url).startsWith('http'));
          const catalogWithPhoto = withPhoto(catalogRows);
          const customWithPhoto = withPhoto(customRows);
          if (catalogWithPhoto.length > 0) {
            await apiPost(`/api/business/venues/${resolvedVenueId}/menu-items/from-catalog`, {
              items: catalogWithPhoto.map((item) => ({
                catalog_item_id: item.catalog_item_id,
                price: Number(item.price),
                image_url: item.image_url,
              })),
            });
          }
          if (customWithPhoto.length > 0) {
            await apiPost(`/api/business/venues/${resolvedVenueId}/menu-items`, {
              items: customWithPhoto.map((item, idx) => ({
                name: item.name,
                price: Number(item.price),
                category: item.category || 'Other',
                sub_category: item.sub_category || null,
                image_url: item.image_url,
                sort_order: idx,
              })),
            });
          }
        } catch (menuErr) {
          toast.error(menuErr?.data?.error || menuErr.message || 'Venue saved but menu items could not be saved.');
          throw menuErr;
        }
      }

      const complianceUploads = [
        { documentType: 'BUSINESS_REGISTRATION', fileUrl: formData.cipc_document_url, fileName: 'cipc-registration.pdf' },
        { documentType: 'TAX_CLEARANCE', fileUrl: formData.sars_document_url, fileName: 'sars-documents.pdf' },
        { documentType: 'LIQUOR_LICENCE', fileUrl: formData.liquor_license_url, fileName: 'liquor-license.pdf' },
        { documentType: 'OTHER', fileUrl: formData.director_id_url, fileName: 'director-id.pdf' },
        { documentType: 'OTHER', fileUrl: formData.annual_returns_url, fileName: 'annual-returns.pdf' },
      ].filter((doc) => !!doc.fileUrl);

      if (createdVenue?.id && complianceUploads.length > 0) {
        await Promise.all(
          complianceUploads.map((doc) =>
            apiPost('/api/compliance-documents', {
              venueId: createdVenue.id,
              documentType: doc.documentType,
              fileUrl: doc.fileUrl,
              fileName: doc.fileName,
            })
          )
        );
      }

      await syncPaymentStatus(paymentCompleted);

      clearVenueOnboardingDraft(user?.id);

      if (formData.payout_account_name && formData.payout_account_number && formData.payout_bank_code) {
        await apiPost('/api/payments/payout-recipient', {
          holder_type: 'VENUE',
          venue_id: createdVenue.id,
          account_name: formData.payout_account_name,
          account_number: formData.payout_account_number,
          bank_code: formData.payout_bank_code,
          currency: 'ZAR',
        });
      }

      navigate(createPageUrl('BusinessDashboard'));
    } catch (error) {
      setError(error?.message || 'Failed to create venue. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSkipPayment = async () => {
    await handleVenueCompletion({ paymentCompleted: false });
  };

  const handleContinueWithPlan = async () => {
    await handleVenueCompletion({
      paymentCompleted: Boolean(formData.payout_account_name && formData.payout_account_number && formData.payout_bank_code),
    });
  };

  const handleStaffSaveAndExit = async () => {
    setIsSubmitting(true);
    setError('');
    try {
      const normalizedVenueEmail = normalizeOptionalEmail(formData.email);
      const normalizedWebsite = normalizeOptionalWebsite(formData.website);
      const venueData = {
        name: formData.name,
        venue_type: formData.venue_type,
        city: formData.city,
        capacity: parseInt(formData.capacity) || 0,
        age_limit: parseInt(formData.age_limit) || 18,
      };
      if (formData.bio) venueData.bio = formData.bio;
      if (formData.address) venueData.address = formData.address;
      if (formData.suburb) venueData.suburb = formData.suburb;
      if (formData.province) venueData.province = formData.province;
      if (formData.latitude != null) venueData.latitude = formData.latitude;
      if (formData.longitude != null) venueData.longitude = formData.longitude;
      if (formData.phone) venueData.phone = formData.phone;
      if (normalizedVenueEmail) venueData.email = normalizedVenueEmail;
      if (normalizedWebsite) venueData.website = normalizedWebsite;
      if (formData.instagram) venueData.instagram = formData.instagram;
      if (formData.logo_url) venueData.logo_url = formData.logo_url;
      if (formData.cover_image_url) venueData.cover_image_url = formData.cover_image_url;
      await upsertVenue(venueData);
      toast.success('Venue updated');
      navigate(createPageUrl('StaffDashboard'));
    } catch (e) {
      setError(e?.message || 'Failed to save venue');
      toast.error(e?.message || 'Failed to save venue');
    } finally {
      setIsSubmitting(false);
    }
  };

  const steps = [
    { number: 1, title: 'Info', icon: Building },
    { number: 2, title: 'Details', icon: MapPin },
    { number: 3, title: 'Menu Maker', icon: UtensilsCrossed },
    { number: 4, title: 'Compliance', icon: Shield },
    { number: 5, title: 'Payout', icon: CreditCard },
  ];

  const visibleSteps = isStaffEdit ? steps.filter((s) => s.number <= 3) : steps;

  const canProceed = () => {
    if (step === 1) return formData.name && formData.venue_type && formData.city;
    if (step === 2) return true;
    if (step === 3) return formData.name?.trim() && formData.venue_type && formData.city?.trim();
    if (step === 4) return true;
    if (step === 5) return true;
    return true;
  };

  const hasComplianceDocs = () => {
    return formData.cipc_document_url && formData.director_id_url && formData.sars_document_url && formData.annual_returns_url && formData.liquor_license_url && formData.liquor_license_expiry;
  };

  const renderFileUpload = (field, label, required = false) => (
    <div>
      <Label className="text-gray-400 text-sm">
        {label} {required && <span className="text-red-500">*</span>}
      </Label>
      <div className="mt-2">
        <label className="cursor-pointer">
          <div
            className="flex items-center justify-between p-4 rounded-xl border border-dashed transition-colors"
            style={{
              backgroundColor: formData[field] ? 'var(--sec-accent-muted)' : 'var(--sec-bg-card)',
              borderColor: formData[field] ? 'var(--sec-accent-border)' : 'var(--sec-border)',
            }}
          >
            <div className="flex items-center gap-3">
              {uploadProgress[field] === 'uploading' ? (
                <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: 'var(--sec-accent)', borderTopColor: 'transparent' }} />
              ) : formData[field] ? (
                <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: 'var(--sec-accent)' }}>
                  <Check className="w-4 h-4" style={{ color: '#000' }} />
                </div>
              ) : (
                <Upload className="w-5 h-5" style={{ color: 'var(--sec-text-muted)' }} />
              )}
              <span className="text-sm" style={{ color: 'var(--sec-text-secondary)' }}>
                {formData[field] ? 'Document uploaded' : 'Upload document'}
              </span>
            </div>
            {formData[field] && (
              <button
                onClick={(e) => {
                  e.preventDefault();
                  setFormData(prev => ({ ...prev, [field]: '' }));
                }}
                className="p-1 hover:bg-white/10 rounded"
              >
                <X className="w-4 h-4 text-gray-500" />
              </button>
            )}
          </div>
          <input
            type="file"
            accept=".pdf,.jpg,.jpeg,.png"
            className="hidden"
            onChange={(e) => handleFileUpload(field, e)}
          />
        </label>
      </div>
    </div>
  );

  if (!bootstrapped) {
    return (
      <div
        className="min-h-screen flex items-center justify-center p-4"
        style={{ backgroundColor: 'var(--sec-bg-base)' }}
      >
        <p className="text-sm" style={{ color: 'var(--sec-text-muted)' }}>
          Loading…
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 flex flex-col" style={{ backgroundColor: 'var(--sec-bg-base)' }}>
      {isStaffEdit ? (
        <PageBackHeader
          title="Edit venue setup"
          subtitle={venueScope.venueName ? `Managing ${venueScope.venueName}` : 'Staff access'}
          pageName="VenueOnboarding"
        />
      ) : null}
      {/* Header — SEC logo + Sec for Business */}
      {!isStaffEdit ? (
      <div className="flex items-center justify-center pt-8 pb-6 max-w-md mx-auto w-full">
        <div className="flex items-center gap-3">
          <SecLogo size={40} variant="full" />
          <span className="text-xl sm:text-2xl font-bold" style={{ color: 'var(--sec-text-primary)' }}>Sec for Business</span>
        </div>
      </div>
      ) : null}

      {/* Progress Steps — SEC theme: black + silver, no gradients */}
      <div className="flex items-center justify-center gap-1 sm:gap-2 mb-8 px-2">
        {visibleSteps.map((s, index) => (
          <React.Fragment key={s.number}>
            <div
              className="flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1.5 rounded-full"
              style={{
                backgroundColor: step >= s.number ? 'var(--sec-accent-muted)' : 'var(--sec-bg-card)',
                border: `1px solid ${step >= s.number ? 'var(--sec-accent-border)' : 'var(--sec-border)'}`,
              }}
            >
              <s.icon className="w-3.5 sm:w-4 h-3.5 sm:h-4" style={{ color: step >= s.number ? 'var(--sec-accent)' : 'var(--sec-text-muted)' }} />
              <span className="text-xs sm:text-sm font-medium" style={{ color: step >= s.number ? 'var(--sec-text-primary)' : 'var(--sec-text-muted)' }}>{s.title}</span>
            </div>
            {index < visibleSteps.length - 1 && (
              <div
                className="w-4 sm:w-8 h-0.5"
                style={{ backgroundColor: step > s.number ? 'var(--sec-accent)' : 'var(--sec-border)' }}
              />
            )}
          </React.Fragment>
        ))}
      </div>

      {/* Form Content */}
      <div className="flex-1 max-w-md mx-auto w-full overflow-y-auto">
        <AnimatePresence mode="wait">
          {step === 1 && (
            <motion.div
              key="step1"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <div className="text-center mb-8">
                <h1 className="text-2xl font-bold mb-2">
                  {isStaffEdit ? 'Edit venue setup' : isNewVenue ? 'Register another venue' : isEditMode ? 'Edit your venue' : 'Register your venue'}
                </h1>
                <p className="text-gray-500">
                  {isStaffEdit
                    ? 'Update venue profile, details, and menu for this venue'
                    : isNewVenue ? 'Start fresh — this will not change your existing venue' : 'Join the Sec marketplace'}
                </p>
              </div>

              {/* Logo & Cover Upload */}
              <div className="flex gap-4">
                <div className="flex-1">
                  <Label className="text-gray-400 text-sm">Logo</Label>
                  <label className="cursor-pointer mt-2 block">
                    <div className="h-24 rounded-xl bg-[#141416] border border-[#262629] flex items-center justify-center overflow-hidden">
                      {formData.logo_url ? (
                        <img key={`logo-${brandingPreviewKey}-${formData.logo_url}`} src={formData.logo_url} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <Upload className="w-6 h-6 text-gray-600" />
                      )}
                    </div>
                    <input type="file" accept="image/*" className="hidden" onChange={logoCrop.handleInputChange} />
                  </label>
                  <p className="text-xs mt-1" style={{ color: uploadProgress.logo_url === 'error' ? '#ef4444' : 'var(--sec-text-muted)' }}>
                    {uploadProgress.logo_url === 'uploading'
                      ? 'Uploading logo...'
                      : uploadProgress.logo_url === 'done'
                        ? 'Logo uploaded.'
                        : uploadProgress.logo_url === 'error'
                          ? 'Logo upload failed. Try again.'
                          : formData.logo_url
                            ? 'Logo selected.'
                            : 'Select a logo image.'}
                  </p>
                </div>
                <div className="flex-[2]">
                  <Label className="text-gray-400 text-sm">Cover Image</Label>
                  <label className="cursor-pointer mt-2 block">
                    <div className="w-full aspect-video rounded-xl bg-[#141416] border border-[#262629] flex items-center justify-center overflow-hidden">
                      {formData.cover_image_url ? (
                        <img key={`cover-${brandingPreviewKey}-${formData.cover_image_url}`} src={formData.cover_image_url} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <Upload className="w-6 h-6 text-gray-600" />
                      )}
                    </div>
                    <input type="file" accept="image/*" className="hidden" onChange={coverCrop.handleInputChange} />
                  </label>
                  <p className="text-xs mt-1" style={{ color: uploadProgress.cover_image_url === 'error' ? '#ef4444' : 'var(--sec-text-muted)' }}>
                    {uploadProgress.cover_image_url === 'uploading'
                      ? 'Uploading cover image...'
                      : uploadProgress.cover_image_url === 'done'
                        ? 'Cover image uploaded.'
                        : uploadProgress.cover_image_url === 'error'
                          ? 'Cover image upload failed. Try again.'
                          : formData.cover_image_url
                            ? 'Cover image selected.'
                            : 'Select a cover image.'}
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <Label className="text-gray-400 text-sm">Venue Name *</Label>
                  <Input
                    placeholder="Enter venue name"
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    className="mt-2 h-12 bg-[#141416] border-[#262629] rounded-xl"
                  />
                </div>

                <div>
                  <Label className="text-gray-400 text-sm">Venue Type *</Label>
                  <Select value={formData.venue_type} onValueChange={(value) => setFormData(prev => ({ ...prev, venue_type: value }))}>
                    <SelectTrigger className="mt-2 h-12 bg-[#141416] border-[#262629] rounded-xl">
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent className="bg-[#141416] border-[#262629] text-white">
                      {VENUE_TYPES.map((type) => (
                        <SelectItem key={type.value} value={type.value} className="text-white">{type.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-gray-400 text-sm">City *</Label>
                  <Select value={formData.city} onValueChange={(value) => setFormData(prev => ({ ...prev, city: value }))}>
                    <SelectTrigger className="mt-2 h-12 bg-[#141416] border-[#262629] rounded-xl">
                      <SelectValue placeholder="Select city" />
                    </SelectTrigger>
                    <SelectContent className="bg-[#141416] border-[#262629] text-white">
                      {CITIES.map((city) => (
                        <SelectItem key={city} value={city} className="text-white">{city}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-gray-400 text-sm">Bio</Label>
                  <Textarea
                    placeholder="Describe your venue..."
                    value={formData.bio}
                    onChange={(e) => setFormData(prev => ({ ...prev, bio: e.target.value }))}
                    className="mt-2 bg-[#141416] border-[#262629] rounded-xl resize-none"
                    rows={3}
                  />
                </div>
              </div>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div
              key="step2"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <div className="text-center mb-8">
                <h1 className="text-2xl font-bold mb-2">Contact & Details</h1>
                <p className="text-gray-500">How can people reach you?</p>
              </div>

              <div className="space-y-4">
                <div>
                   <GoogleAddressInput
                     value={{
                       formattedAddress: formData.address,
                       street: formData.address,
                       suburb: formData.suburb,
                       city: formData.city,
                       province: formData.province,
                       country: 'ZA',
                       latitude: formData.latitude,
                       longitude: formData.longitude,
                     }}
                     onChange={(addr) => setFormData((prev) => {
                       const normalizedCity = typeof addr?.city === 'string' ? addr.city.trim() : '';
                       const mappedCity = CITIES.some((c) => c.toLowerCase() === normalizedCity.toLowerCase())
                         ? normalizedCity
                         : prev.city;

                       return {
                         ...prev,
                         address: addr?.street || addr?.formattedAddress || '',
                         suburb: addr?.suburb || '',
                         province: addr?.province || '',
                         latitude: addr?.latitude ?? null,
                         longitude: addr?.longitude ?? null,
                         city: mappedCity,
                       };
                     })}
                     placeholder="123 Main Street, Sandton"
                   />
                 </div>

                 {formData.address && formData.latitude != null && formData.longitude != null && (
                   <GoogleMapDisplay 
                     latitude={formData.latitude}
                     longitude={formData.longitude}
                     address={formData.address}
                   />
                 )}

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-gray-400 text-sm">Phone</Label>
                    <Input
                      placeholder="+27..."
                      value={formData.phone}
                      onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                      className="mt-2 h-12 bg-[#141416] border-[#262629] rounded-xl"
                    />
                  </div>
                  <div>
                    <Label className="text-gray-400 text-sm">Email</Label>
                    <Input
                      type="email"
                      placeholder="info@venue.com"
                      value={formData.email}
                      onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                      className="mt-2 h-12 bg-[#141416] border-[#262629] rounded-xl"
                    />
                  </div>
                </div>

                <div>
                  <Label className="text-gray-400 text-sm">Website</Label>
                  <Input
                    placeholder="https://..."
                    value={formData.website}
                    onChange={(e) => setFormData(prev => ({ ...prev, website: e.target.value }))}
                    className="mt-2 h-12 bg-[#141416] border-[#262629] rounded-xl"
                  />
                </div>

                <div>
                  <Label className="text-gray-400 text-sm">Instagram</Label>
                  <Input
                    placeholder="@yourhandle"
                    value={formData.instagram}
                    onChange={(e) => setFormData(prev => ({ ...prev, instagram: e.target.value }))}
                    className="mt-2 h-12 bg-[#141416] border-[#262629] rounded-xl"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-gray-400 text-sm">Capacity</Label>
                    <Input
                      type="number"
                      placeholder="500"
                      value={formData.capacity}
                      onChange={(e) => setFormData(prev => ({ ...prev, capacity: e.target.value }))}
                      className="mt-2 h-12 bg-[#141416] border-[#262629] rounded-xl"
                    />
                  </div>
                  <div>
                    <Label className="text-gray-400 text-sm">Age Limit</Label>
                    <Select value={formData.age_limit.toString()} onValueChange={(value) => setFormData(prev => ({ ...prev, age_limit: parseInt(value) }))}>
                      <SelectTrigger className="mt-2 h-12 bg-[#141416] border-[#262629] rounded-xl">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-[#141416] border-[#262629] text-white">
                        <SelectItem value="18" className="text-white">18+</SelectItem>
                        <SelectItem value="21" className="text-white">21+</SelectItem>
                        <SelectItem value="23" className="text-white">23+</SelectItem>
                        <SelectItem value="25" className="text-white">25+</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
</div>
            </motion.div>
          )}

          {step === 3 && (
            <motion.div key="step-menu" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">
              <div className="text-center mb-2">
                <div
                  className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center"
                  style={{ backgroundColor: 'var(--sec-accent-muted)', border: '1px solid var(--sec-accent-border)' }}
                >
                  <UtensilsCrossed className="w-8 h-8" style={{ color: 'var(--sec-accent)' }} />
                </div>
                <h1 className="text-2xl font-bold mb-2" style={{ color: 'var(--sec-text-primary)' }}>Menu Maker</h1>
                <p className="text-sm max-w-sm mx-auto" style={{ color: 'var(--sec-text-muted)' }}>
                  Add items with your own photos and prices now, or skip and update your menu later from the dashboard.
                </p>
              </div>
              {ensuringVenueForMenu && !venueId ? (
                <p className="text-sm text-center" style={{ color: 'var(--sec-text-muted)' }}>Preparing your venue menu…</p>
              ) : null}
              {!formData.name?.trim() || !formData.venue_type || !formData.city?.trim() ? (
                <p className="text-sm rounded-xl p-4" style={{ color: 'var(--sec-text-muted)', backgroundColor: 'var(--sec-bg-card)', border: '1px solid var(--sec-border)' }}>
                  Complete the Info step (venue name, type, and city) before adding menu items.
                </p>
              ) : (
                <MenuCatalogBrowser
                  mode={venueId ? 'live' : 'draft'}
                  venueId={venueId || undefined}
                  addedCatalogIds={venueId ? liveMenuCatalogIds : addedCatalogIds}
                  onAddToDraft={venueId ? undefined : handleAddMenuDraft}
                  onVenueMenuUpdated={() => toast.success('Menu updated')}
                />
              )}
              {!venueId && menuDraftItems.length > 0 && (
                <div className="space-y-2">
                  <h2 className="text-sm font-semibold" style={{ color: 'var(--sec-text-primary)' }}>
                    Your menu ({menuDraftItems.length}) — saved when you finish onboarding
                  </h2>
                  {menuDraftItems.map((item, idx) => (
                    <div
                      key={item.catalog_item_id ? item.catalog_item_id : `custom-${idx}`}
                      className="flex items-center gap-3 p-3 rounded-xl"
                      style={{ backgroundColor: 'var(--sec-bg-card)', border: '1px solid var(--sec-border)' }}
                    >
                      {item.image_url ? (
                        <img src={item.image_url} alt="" className="w-12 h-12 rounded object-cover shrink-0" />
                      ) : null}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{item.name}</div>
                        <p className="text-xs" style={{ color: 'var(--sec-text-muted)' }}>
                          {item.category}
                          {item.sub_category ? ` · ${item.sub_category}` : ''} · R{Number(item.price).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {step === 4 && !isStaffEdit && (
            <motion.div
              key="step4-compliance"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <div className="text-center mb-6">
                <h1 className="text-2xl font-bold mb-2" style={{ color: 'var(--sec-text-primary)' }}>Compliance Documents</h1>
                <p style={{ color: 'var(--sec-text-muted)' }}>Required for verification</p>
              </div>

              <div className="rounded-2xl p-4 mb-4" style={{ backgroundColor: 'var(--sec-bg-card)', border: '1px solid var(--sec-border)' }}>
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'var(--sec-accent-muted)' }}>
                    <Shield className="w-5 h-5" style={{ color: 'var(--sec-accent)' }} />
                  </div>
                  <div>
                    <p className="font-medium text-sm">Why we need these documents</p>
                    <p className="text-xs text-gray-500 mt-1">
                      To ensure safety and legal compliance, all venues must submit valid business and liquor licensing documentation before going live. Read the{' '}
                      <Link to={createPageUrl('VenueComplianceCharter')} className="underline font-medium" style={{ color: 'var(--sec-accent)' }}>
                        Venue Compliance Charter
                      </Link>
                      .
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl p-4 mb-6" style={{ backgroundColor: 'rgba(234, 179, 8, 0.08)', border: '1px solid rgba(234, 179, 8, 0.2)' }}>
                <p className="text-xs" style={{ color: 'rgb(234, 179, 8)' }}>
                  You can skip this step for now and upload compliance documents later from your dashboard. Your venue will remain in "pending" status until documents are submitted.
                </p>
              </div>

              <div className="space-y-4">
                {renderFileUpload('cipc_document_url', 'CIPC Registration Document', true)}
                {renderFileUpload('director_id_url', 'Director ID Document', true)}
                {renderFileUpload('sars_document_url', 'South African Revenue Service (SARS) Documents', true)}
                {renderFileUpload('annual_returns_url', 'Annual Returns', true)}
                {renderFileUpload('liquor_license_url', 'Valid Liquor License', true)}
                
                <div>
                  <Label className="text-gray-400 text-sm">
                    Liquor License Expiry Date <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    type="date"
                    value={formData.liquor_license_expiry}
                    onChange={(e) => setFormData(prev => ({ ...prev, liquor_license_expiry: e.target.value }))}
                    className="mt-2 h-12 bg-[#141416] border-[#262629] rounded-xl"
                  />
                </div>
              </div>

              {error && (
                <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-sm">
                  {error}
                </div>
              )}
            </motion.div>
          )}

          {step === 5 && !isStaffEdit && (
           <motion.div
             key="step5-payout"
             initial={{ opacity: 0, x: 20 }}
             animate={{ opacity: 1, x: 0 }}
             exit={{ opacity: 0, x: -20 }}
             className="space-y-6"
           >
             <div className="text-center mb-8">
               <h1 className="text-2xl font-bold mb-2" style={{ color: 'var(--sec-text-primary)' }}>Set up payouts</h1>
               <p style={{ color: 'var(--sec-text-muted)' }}>Optional now. You can also add this later in your Sec Wallet on the Business Dashboard.</p>
               <div className="mt-3 max-w-md mx-auto text-left">
                 <RefundPolicyNote />
                 <p className="text-xs mt-2" style={{ color: 'var(--sec-text-muted)' }}>
                   Venue obligations:{' '}
                   <Link to={createPageUrl('VenueComplianceCharter')} className="underline font-medium" style={{ color: 'var(--sec-accent)' }}>
                     Venue Compliance Charter
                   </Link>
                 </p>
               </div>
             </div>

             <div className="rounded-2xl p-6 space-y-3" style={{ backgroundColor: 'var(--sec-bg-card)', border: '1px solid var(--sec-border)' }}>
               <Input
                 placeholder="Account holder name"
                 value={formData.payout_account_name}
                 onChange={(e) => setFormData((prev) => ({ ...prev, payout_account_name: e.target.value }))}
                 className="h-12 bg-[#141416] border-[#262629] rounded-xl"
               />
               <Input
                 placeholder="Account number"
                 value={formData.payout_account_number}
                 onChange={(e) => setFormData((prev) => ({ ...prev, payout_account_number: e.target.value }))}
                 className="h-12 bg-[#141416] border-[#262629] rounded-xl"
               />
               <Input
                 placeholder="Bank code"
                 value={formData.payout_bank_code}
                 onChange={(e) => setFormData((prev) => ({ ...prev, payout_bank_code: e.target.value }))}
                 className="h-12 bg-[#141416] border-[#262629] rounded-xl"
               />
               <p className="text-xs" style={{ color: 'var(--sec-text-muted)' }}>
                 Missing payout details means your venue payouts stay pending until setup is completed.
               </p>

              {error && (
                <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-sm mt-4">
                  {error}
                </div>
              )}
             </div>
           </motion.div>
          )}
          </AnimatePresence>
          </div>

          {/* Navigation */}
      <div className="max-w-md mx-auto w-full pt-6">
        <div className="flex gap-3">
          <Button
            onClick={() => {
              if (step === 1) {
                if (isStaffEdit) {
                  navigate(createPageUrl('StaffDashboard'));
                } else {
                  navigate(createPageUrl(isEditMode ? 'BusinessDashboard' : 'Onboarding'));
                }
              } else {
                setStep(step - 1);
              }
            }}
            variant="outline"
            className="h-14 px-6 rounded-xl bg-[#141416] border-[#262629]"
          >
            <ChevronLeft className="w-5 h-5" />
          </Button>
          {step < maxStep ? (
            <Button
              onClick={() => setStep(step + 1)}
              disabled={!canProceed()}
              className="flex-1 h-14 rounded-xl font-semibold transition-all disabled:opacity-50"
              style={{ backgroundColor: 'var(--sec-accent)', color: '#000' }}
            >
              {step === 4 && !hasComplianceDocs() ? 'Skip for now' : 'Continue'}
              <ChevronRight className="w-5 h-5 ml-2" />
            </Button>
          ) : isStaffEdit ? (
            <Button
              onClick={handleStaffSaveAndExit}
              disabled={isSubmitting || !canProceed()}
              className="flex-1 h-14 rounded-xl font-semibold transition-all disabled:opacity-50"
              style={{ backgroundColor: 'var(--sec-accent)', color: '#000' }}
            >
              {isSubmitting ? 'Saving...' : 'Save & return'}
              {!isSubmitting && <Check className="w-5 h-5 ml-2" />}
            </Button>
          ) : (
            <>
              <Button
                onClick={handleSkipPayment}
                disabled={isSubmitting}
                variant="outline"
                className="h-14 px-4 rounded-xl bg-[#141416] border-[#262629]"
              >
                {isSubmitting ? 'Saving...' : 'Skip for now'}
              </Button>
              <Button
                onClick={handleContinueWithPlan}
                disabled={isSubmitting}
                className="flex-1 h-14 rounded-xl font-semibold transition-all disabled:opacity-50"
                style={{ backgroundColor: 'var(--sec-accent)', color: '#000' }}
              >
                {isSubmitting ? 'Saving...' : 'Save payout details'}
                {!isSubmitting && <Check className="w-5 h-5 ml-2" />}
              </Button>
            </>
          )}
        </div>
      </div>
      <ImageCropDialog
        open={logoCrop.cropOpen}
        onOpenChange={logoCrop.onCropOpenChange}
        imageSrc={logoCrop.cropSrc}
        aspect={1}
        cropShape="round"
        title="Crop logo"
        onCropped={logoCrop.handleCropped}
        outputFileName="venue-logo.jpg"
      />
      <ImageCropDialog
        open={coverCrop.cropOpen}
        onOpenChange={coverCrop.onCropOpenChange}
        imageSrc={coverCrop.cropSrc}
        {...COVER_CROP_DIALOG_PROPS}
        title="Crop cover image"
        onCropped={coverCrop.handleCropped}
        outputFileName="venue-cover.jpg"
      />
    </div>
  );
}