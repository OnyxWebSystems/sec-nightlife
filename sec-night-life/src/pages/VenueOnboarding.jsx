import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import * as authService from '@/services/authService';
import { dataService } from '@/services/dataService';
import { apiPatch, apiPost } from '@/api/client';
import { 
  Building,
  Upload,
  Check,
  ChevronRight,
  ChevronLeft,
  MapPin,
  Shield,
  CreditCard,
  X
} from 'lucide-react';
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { motion, AnimatePresence } from 'framer-motion';
import GoogleAddressInput from '@/components/GoogleAddressInput';
import GoogleMapDisplay from '@/components/GoogleMapDisplay';
import SecLogo from '@/components/ui/SecLogo';

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

const PLAN_PRICES = {
  basic: 299,
  premium: 799,
};

const VENUE_PAYMENT_CONTEXT_KEY = 'sec-venue-onboarding-payment';

export default function VenueOnboarding() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [user, setUser] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [uploadProgress, setUploadProgress] = useState({});
  const [selectedPlan, setSelectedPlan] = useState('basic');

  const cloudinaryConfig = {
    cloudName: import.meta.env.VITE_CLOUDINARY_CLOUD_NAME || '',
    uploadPreset: import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET || '',
  };
  
  const [formData, setFormData] = useState({
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
    // Compliance Documents
    cipc_document_url: '',
    director_id_url: '',
    sars_document_url: '',
    annual_returns_url: '',
    liquor_license_url: '',
    liquor_license_expiry: ''
  });

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const currentUser = await authService.getCurrentUser();
      setUser(currentUser);
    } catch (e) {
      authService.redirectToLogin(createPageUrl('VenueOnboarding'));
    }
  };

  const handleFileUpload = async (field, e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadProgress(prev => ({ ...prev, [field]: 'uploading' }));
    setError('');

    try {
      if (!cloudinaryConfig.cloudName || !cloudinaryConfig.uploadPreset) {
        throw new Error('Cloudinary is not configured for uploads.');
      }

      const allowed = ['application/pdf', 'image/jpeg', 'image/png'];
      if (!allowed.includes(file.type)) {
        throw new Error('Only PDF, JPG, and PNG documents are allowed.');
      }

      const form = new FormData();
      form.append('file', file);
      form.append('upload_preset', cloudinaryConfig.uploadPreset);
      form.append('public_id', `${Date.now()}-${file.name.replace(/\.[^.]+$/, '')}`.replace(/[^a-zA-Z0-9/_-]/g, '-'));
      form.append('filename_override', file.name);

      const uploadRes = await fetch(`https://api.cloudinary.com/v1_1/${cloudinaryConfig.cloudName}/auto/upload`, {
        method: 'POST',
        body: form,
      });
      const uploadData = await uploadRes.json();

      if (!uploadRes.ok || !uploadData?.secure_url) {
        throw new Error(uploadData?.error?.message || 'Failed to upload document.');
      }

      setFormData(prev => ({ ...prev, [field]: uploadData.secure_url }));
      setUploadProgress(prev => ({ ...prev, [field]: 'done' }));
    } catch (error) {
      setUploadProgress(prev => ({ ...prev, [field]: 'error' }));
      setError(error?.message || 'Failed to upload document.');
    }
  };

  const upsertVenue = async (venueData) => {
    const existingVenues = user?.id
      ? await dataService.Venue.filter({ owner_user_id: user.id }, undefined, 1)
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

  const handleVenueCompletion = async ({ paymentCompleted, startPayment }) => {
    setIsSubmitting(true);
    setError('');

    try {
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
      if (formData.email) venueData.email = formData.email;
      if (formData.website) venueData.website = formData.website;
      if (formData.instagram) venueData.instagram = formData.instagram;
      if (formData.logo_url) venueData.logo_url = formData.logo_url;
      if (formData.cover_image_url) venueData.cover_image_url = formData.cover_image_url;

      const createdVenue = await upsertVenue(venueData);

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

      if (startPayment) {
        if (window.self !== window.top) {
          throw new Error('Payment checkout only works in the published app. Please open the app in a new tab.');
        }

        const planName = selectedPlan === 'premium' ? 'Premium' : 'Basic';
        const payment = await apiPost('/api/payments/initialize', {
          amount: PLAN_PRICES[selectedPlan],
          email: user?.email,
          description: `Venue subscription: ${planName} plan`,
          venue_id: createdVenue.id,
          metadata: {
            type: 'other',
            context: 'venue_onboarding',
            venue_id: createdVenue.id,
            plan: selectedPlan,
            plan_name: planName,
          },
        });

        if (!payment?.authorization_url) {
          throw new Error('No Paystack checkout URL was returned.');
        }

        localStorage.setItem(VENUE_PAYMENT_CONTEXT_KEY, JSON.stringify({
          nextPath: createPageUrl('BusinessDashboard'),
          venueId: createdVenue.id,
          plan: selectedPlan,
          planName,
        }));

        window.location.href = payment.authorization_url;
        return;
      }

      navigate(createPageUrl('BusinessDashboard'));
    } catch (error) {
      setError(error?.message || 'Failed to create venue. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSkipPayment = async () => {
    await handleVenueCompletion({ paymentCompleted: false, startPayment: false });
  };

  const handleContinueWithPlan = async () => {
    await handleVenueCompletion({ paymentCompleted: false, startPayment: true });
  };

  const steps = [
    { number: 1, title: 'Info', icon: Building },
    { number: 2, title: 'Details', icon: MapPin },
    { number: 3, title: 'Compliance', icon: Shield },
    { number: 4, title: 'Payment', icon: CreditCard },
  ];

  const canProceed = () => {
    if (step === 1) return formData.name && formData.venue_type && formData.city;
    if (step === 2) return true;
    if (step === 3) return true;
    if (step === 4) return true;
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

  return (
    <div className="min-h-screen p-4 flex flex-col" style={{ backgroundColor: 'var(--sec-bg-base)' }}>
      {/* Header — SEC logo + Sec for Business */}
      <div className="flex items-center justify-center pt-8 pb-6 max-w-md mx-auto w-full">
        <div className="flex items-center gap-3">
          <SecLogo size={40} variant="full" />
          <span className="text-xl sm:text-2xl font-bold" style={{ color: 'var(--sec-text-primary)' }}>Sec for Business</span>
        </div>
      </div>

      {/* Progress Steps — SEC theme: black + silver, no gradients */}
      <div className="flex items-center justify-center gap-1 sm:gap-2 mb-8 px-2">
        {steps.map((s, index) => (
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
            {index < steps.length - 1 && (
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
                <h1 className="text-2xl font-bold mb-2">Register your venue</h1>
                <p className="text-gray-500">Join the Sec marketplace</p>
              </div>

              {/* Logo & Cover Upload */}
              <div className="flex gap-4">
                <div className="flex-1">
                  <Label className="text-gray-400 text-sm">Logo</Label>
                  <label className="cursor-pointer mt-2 block">
                    <div className="h-24 rounded-xl bg-[#141416] border border-[#262629] flex items-center justify-center overflow-hidden">
                      {formData.logo_url ? (
                        <img src={formData.logo_url} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <Upload className="w-6 h-6 text-gray-600" />
                      )}
                    </div>
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => handleFileUpload('logo_url', e)} />
                  </label>
                </div>
                <div className="flex-[2]">
                  <Label className="text-gray-400 text-sm">Cover Image</Label>
                  <label className="cursor-pointer mt-2 block">
                    <div className="h-24 rounded-xl bg-[#141416] border border-[#262629] flex items-center justify-center overflow-hidden">
                      {formData.cover_image_url ? (
                        <img src={formData.cover_image_url} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <Upload className="w-6 h-6 text-gray-600" />
                      )}
                    </div>
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => handleFileUpload('cover_image_url', e)} />
                  </label>
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
            <motion.div
              key="step3"
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
                      To ensure safety and legal compliance, all venues must submit valid business and liquor licensing documentation before going live.
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

          {step === 4 && (
           <motion.div
             key="step4"
             initial={{ opacity: 0, x: 20 }}
             animate={{ opacity: 1, x: 0 }}
             exit={{ opacity: 0, x: -20 }}
             className="space-y-6"
           >
             <div className="text-center mb-8">
               <h1 className="text-2xl font-bold mb-2" style={{ color: 'var(--sec-text-primary)' }}>Choose Your Plan</h1>
               <p style={{ color: 'var(--sec-text-muted)' }}>Continue to Paystack to securely complete your subscription payment</p>
             </div>

             <div className="rounded-2xl p-6" style={{ backgroundColor: 'var(--sec-bg-card)', border: '1px solid var(--sec-border)' }}>
               <div className="flex items-start gap-3 mb-6">
                 <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'var(--sec-accent-muted)' }}>
                   <CreditCard className="w-5 h-5" style={{ color: 'var(--sec-accent)' }} />
                 </div>
                 <div>
                   <p className="font-medium text-sm" style={{ color: 'var(--sec-text-primary)' }}>Payment Integration</p>
                   <p className="text-xs mt-1" style={{ color: 'var(--sec-text-muted)' }}>
                     After you choose a plan, you will be redirected to Paystack to sign in or complete payment securely on their hosted checkout page.
                   </p>
                 </div>
               </div>

               <div className="space-y-3">
                 <button
                   type="button"
                   onClick={() => setSelectedPlan('basic')}
                   className="w-full p-4 rounded-xl text-left transition-all"
                   style={{
                     border: selectedPlan === 'basic' ? '2px solid var(--sec-accent-border)' : '2px solid var(--sec-border)',
                     backgroundColor: selectedPlan === 'basic' ? 'var(--sec-accent-muted)' : 'var(--sec-bg-card)'
                   }}
                 >
                   <h3 className="font-semibold mb-2" style={{ color: 'var(--sec-text-primary)' }}>Basic Plan</h3>
                   <p className="text-2xl font-bold mb-1" style={{ color: 'var(--sec-text-primary)' }}>R 299<span className="text-sm" style={{ color: 'var(--sec-text-muted)' }}>/month</span></p>
                   <ul className="text-xs space-y-1 mt-3" style={{ color: 'var(--sec-text-secondary)' }}>
                     <li>✓ List up to 5 events</li>
                     <li>✓ Basic analytics</li>
                     <li>✓ Customer support</li>
                   </ul>
                 </button>

                 <button
                   type="button"
                   onClick={() => setSelectedPlan('premium')}
                   className="w-full p-4 rounded-xl text-left transition-all"
                   style={{
                     border: selectedPlan === 'premium' ? '2px solid var(--sec-accent-border)' : '2px solid var(--sec-border)',
                     backgroundColor: selectedPlan === 'premium' ? 'var(--sec-accent-muted)' : 'var(--sec-bg-card)'
                   }}
                 >
                   <h3 className="font-semibold mb-2" style={{ color: 'var(--sec-text-primary)' }}>Premium Plan</h3>
                   <p className="text-2xl font-bold mb-1" style={{ color: 'var(--sec-text-primary)' }}>R 799<span className="text-sm" style={{ color: 'var(--sec-text-muted)' }}>/month</span></p>
                   <ul className="text-xs space-y-1 mt-3" style={{ color: 'var(--sec-text-secondary)' }}>
                     <li>✓ Unlimited events</li>
                     <li>✓ Advanced analytics</li>
                     <li>✓ Priority support</li>
                     <li>✓ Featured listings</li>
                   </ul>
                 </button>
               </div>

               <div className="rounded-xl p-3 mt-6" style={{ backgroundColor: 'rgba(234, 179, 8, 0.08)', border: '1px solid rgba(234, 179, 8, 0.2)' }}>
                 <p className="text-xs text-center" style={{ color: 'rgb(234, 179, 8)' }}>
                  You can still skip this step and finish venue registration now. Payment can be completed later from your business flow.
                 </p>
               </div>

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
            onClick={() => step === 1 ? navigate(createPageUrl('Onboarding')) : setStep(step - 1)}
            variant="outline"
            className="h-14 px-6 rounded-xl bg-[#141416] border-[#262629]"
          >
            <ChevronLeft className="w-5 h-5" />
          </Button>
          {step < 4 ? (
            <Button
              onClick={() => setStep(step + 1)}
              disabled={!canProceed()}
              className="flex-1 h-14 rounded-xl font-semibold transition-all disabled:opacity-50"
              style={{ backgroundColor: 'var(--sec-accent)', color: '#000' }}
            >
              {step === 3 && !hasComplianceDocs() ? 'Skip for now' : 'Continue'}
              <ChevronRight className="w-5 h-5 ml-2" />
            </Button>
          ) : (
            <>
              <Button
                onClick={handleSkipPayment}
                disabled={isSubmitting}
                variant="outline"
                className="h-14 px-4 rounded-xl bg-[#141416] border-[#262629]"
              >
                {isSubmitting ? 'Saving...' : 'Skip Payment'}
              </Button>
              <Button
                onClick={handleContinueWithPlan}
                disabled={isSubmitting}
                className="flex-1 h-14 rounded-xl font-semibold transition-all disabled:opacity-50"
                style={{ backgroundColor: 'var(--sec-accent)', color: '#000' }}
              >
                {isSubmitting ? 'Redirecting...' : `Continue with ${selectedPlan === 'premium' ? 'Premium' : 'Basic'}`}
                {!isSubmitting && <Check className="w-5 h-5 ml-2" />}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}