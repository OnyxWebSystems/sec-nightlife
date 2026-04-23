import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import * as authService from '@/services/authService';
import { dataService } from '@/services/dataService';
import { integrations } from '@/services/integrationService';
import {
  User,
  MapPin,
  Calendar,
  CreditCard,
  ChevronLeft,
  ChevronRight,
  Check,
  Upload,
  Camera,
  Lock,
  FileText,
  Wine,
  X,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { motion, AnimatePresence } from 'framer-motion';
import SecLogo from '@/components/ui/SecLogo';
import AvatarCropDialog from '@/components/profile/AvatarCropDialog';

const CITIES = [
  'Johannesburg', 'Cape Town', 'Durban', 'Pretoria', 'Sandton',
  'Port Elizabeth', 'Bloemfontein', 'East London', 'Nelspruit', 'Polokwane',
];

const DRINKS = [
  'Whiskey', 'Vodka', 'Gin', 'Tequila', 'Rum', 'Champagne',
  'Wine', 'Beer', 'Cocktails', 'Non-alcoholic',
];
const GENDER_OPTIONS = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'other', label: 'Other' },
];

export default function ProfileSetup() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [user, setUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [uploadProgress, setUploadProgress] = useState({});
  const [cropOpen, setCropOpen] = useState(false);
  const [cropSrc, setCropSrc] = useState(null);

  const [formData, setFormData] = useState({
    username: '',
    bio: '',
    avatar_url: '',
    city: '',
    favorite_drink: '',
    gender: '',
    date_of_birth: '',
    id_document_url: '',
  });

  const steps = [
    { number: 1, title: 'Basics', icon: User },
    { number: 2, title: 'Details', icon: MapPin },
    { number: 3, title: 'Verify', icon: Calendar },
    { number: 4, title: 'Payment', icon: CreditCard },
  ];

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const currentUser = await authService.getCurrentUser();
      setUser(currentUser);
      const profiles = await dataService.User.filter({ created_by: currentUser.email });
      if (profiles.length > 0) {
        const profile = profiles[0];
        setUserProfile(profile);
        setFormData((prev) => ({
          ...prev,
          username: profile.username || '',
          bio: profile.bio || '',
          avatar_url: profile.avatar_url || '',
          city: profile.city || '',
          favorite_drink: profile.favorite_drink || '',
          gender: profile.gender || '',
          date_of_birth: profile.date_of_birth || '',
          id_document_url: profile.id_document_url || '',
        }));
      }
    } catch (e) {
      authService.redirectToLogin(createPageUrl('ProfileSetup'));
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (field, e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadProgress((prev) => ({ ...prev, [field]: 'uploading' }));
    setError('');

    try {
      const { file_url } = await integrations.Core.UploadFile({ file });
      setFormData((prev) => ({ ...prev, [field]: file_url }));
      setUploadProgress((prev) => ({ ...prev, [field]: 'done' }));
    } catch (err) {
      setUploadProgress((prev) => ({ ...prev, [field]: 'error' }));
      setError('Failed to upload file');
    }
  };

  const onPickAvatarImage = (e) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    if (cropSrc) URL.revokeObjectURL(cropSrc);
    setCropSrc(URL.createObjectURL(file));
    setCropOpen(true);
    e.target.value = '';
  };

  const handleCroppedAvatar = async (file) => {
    setUploadProgress((prev) => ({ ...prev, avatar_url: 'uploading' }));
    setError('');
    try {
      const { file_url } = await integrations.Core.UploadFile({ file });
      setFormData((prev) => ({ ...prev, avatar_url: file_url }));
      setUploadProgress((prev) => ({ ...prev, avatar_url: 'done' }));
    } catch {
      setUploadProgress((prev) => ({ ...prev, avatar_url: 'error' }));
      setError('Failed to upload image');
    }
  };

  const canProceed = () => {
    if (step === 1) return formData.username && formData.bio.trim().length > 0;
    if (step === 2) return formData.city && formData.favorite_drink;
    if (step === 3) return Boolean(formData.gender);
    if (step === 4) return false;
    return true;
  };

  const completeOnboarding = async (options = {}) => {
    const { paymentCompleted = false } = options;
    setIsSubmitting(true);
    setError('');
    try {
      const hasId = Boolean(formData.id_document_url?.trim());
      const payload = {
        username: formData.username,
        bio: formData.bio,
        city: formData.city,
        favorite_drink: formData.favorite_drink,
        gender: formData.gender,
        age_verified: false,
        verification_status: hasId ? 'submitted' : 'pending',
        payment_setup_complete: paymentCompleted,
        onboarding_complete: true,
      };
      if (formData.avatar_url) payload.avatar_url = formData.avatar_url;
      if (formData.date_of_birth) payload.date_of_birth = formData.date_of_birth;
      if (formData.id_document_url) payload.id_document_url = formData.id_document_url;

      if (userProfile) {
        await dataService.User.update(userProfile.id, payload);
      } else {
        await dataService.User.create(payload);
      }
      navigate(createPageUrl('Home'));
    } catch (err) {
      setError('Failed to complete setup. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePaymentSuccess = async () => {
    await completeOnboarding({ paymentCompleted: true });
  };

  const handleSkipPayment = async () => {
    await completeOnboarding({ paymentCompleted: false });
  };

  const renderFileUpload = (field, label, accept = 'image/*') => (
    <div>
      <Label style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.09em', textTransform: 'uppercase', color: 'var(--sec-text-muted)', marginBottom: 8, display: 'block' }}>
        {label}
      </Label>
      <label style={{ cursor: 'pointer', display: 'block' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 16px',
            borderRadius: 'var(--radius-lg)',
            backgroundColor: formData[field] ? 'var(--sec-accent-muted)' : 'var(--sec-bg-card)',
            border: `1px solid ${formData[field] ? 'var(--sec-accent-border)' : 'var(--sec-border)'}`,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {uploadProgress[field] === 'uploading' ? (
              <div
                className="animate-spin"
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: '50%',
                  border: `2px solid var(--sec-accent)`,
                  borderTopColor: 'transparent',
                }}
              />
            ) : formData[field] ? (
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: '50%',
                  backgroundColor: 'var(--sec-accent)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Check size={16} style={{ color: '#000' }} />
              </div>
            ) : (
              <Upload size={20} style={{ color: 'var(--sec-text-muted)' }} />
            )}
            <span style={{ fontSize: 14, color: 'var(--sec-text-secondary)' }}>
              {formData[field] ? 'Uploaded' : `Upload ${label.toLowerCase()}`}
            </span>
          </div>
          {formData[field] && (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                setFormData((prev) => ({ ...prev, [field]: '' }));
              }}
              style={{
                padding: 4,
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--sec-text-muted)',
              }}
            >
              <X size={16} />
            </button>
          )}
        </div>
        <input
          type="file"
          accept={accept}
          className="hidden"
          onChange={(e) => handleFileUpload(field, e)}
        />
      </label>
    </div>
  );

  const labelStyle = {
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: '0.09em',
    textTransform: 'uppercase',
    color: 'var(--sec-text-muted)',
    marginBottom: 8,
    display: 'block',
  };

  const inputStyle = {
    height: 46,
    backgroundColor: 'var(--sec-bg-elevated)',
    border: '1px solid var(--sec-border)',
    borderRadius: 'var(--radius-md)',
    color: 'var(--sec-text-primary)',
    fontSize: 14,
  };

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--sec-bg-base)' }}>
        <div className="sec-spinner" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: 'var(--sec-bg-base)' }}>
      {/* Header — SecLogo + Sec */}
      <div className="flex items-center justify-center pt-8 pb-6 max-w-md mx-auto w-full px-4">
        <div className="flex items-center gap-3">
          <SecLogo size={30} variant="full" />
          <span className="text-2xl font-bold" style={{ color: 'var(--sec-text-primary)' }}>
            Sec
          </span>
        </div>
      </div>

      {/* Progress steps — active: silver accent, inactive: dark gray — no gradient */}
      <div className="flex items-center justify-center gap-1 sm:gap-2 mb-8 px-4">
        {steps.map((s, index) => (
          <React.Fragment key={s.number}>
            <div
              className="flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1.5 rounded-full"
              style={{
                backgroundColor: step === s.number ? 'var(--sec-accent-muted)' : 'var(--sec-bg-card)',
                border: `1px solid ${step === s.number ? 'var(--sec-accent-border)' : 'var(--sec-border)'}`,
              }}
            >
              <s.icon
                className="w-3.5 sm:w-4 h-3.5 sm:h-4"
                style={{ color: step === s.number ? 'var(--sec-accent)' : 'var(--sec-text-muted)' }}
              />
              <span
                className="text-xs sm:text-sm font-medium"
                style={{ color: step === s.number ? 'var(--sec-text-primary)' : 'var(--sec-text-muted)' }}
              >
                {s.title}
              </span>
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

      {/* Form content */}
      <div className="flex-1 max-w-md mx-auto w-full overflow-y-auto px-4 pb-6">
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
                <h1 className="text-2xl font-bold mb-2" style={{ color: 'var(--sec-text-primary)' }}>
                  Basics
                </h1>
                <p style={{ color: 'var(--sec-text-muted)' }}>Tell us about yourself</p>
              </div>

              {/* Avatar */}
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <label style={{ cursor: 'pointer' }}>
                  <div style={{ position: 'relative' }}>
                    <div
                      style={{
                        width: 96,
                        height: 96,
                        borderRadius: '50%',
                        border: '1px solid var(--sec-border-strong)',
                        backgroundColor: 'var(--sec-bg-elevated)',
                        overflow: 'hidden',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {formData.avatar_url ? (
                        <img
                          src={formData.avatar_url}
                          alt=""
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                      ) : (
                        <User size={36} strokeWidth={1.5} style={{ color: 'var(--sec-text-muted)' }} />
                      )}
                    </div>
                    <div
                      style={{
                        position: 'absolute',
                        bottom: 0,
                        right: 0,
                        width: 30,
                        height: 30,
                        borderRadius: '50%',
                        backgroundColor: 'var(--sec-bg-card)',
                        border: '1px solid var(--sec-border-strong)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Camera size={14} strokeWidth={1.5} style={{ color: 'var(--sec-text-secondary)' }} />
                    </div>
                  </div>
                  <input type="file" accept="image/*" style={{ display: 'none' }} onChange={onPickAvatarImage} />
                </label>
              </div>

              <AvatarCropDialog
                open={cropOpen}
                onOpenChange={(o) => {
                  setCropOpen(o);
                  if (!o && cropSrc) {
                    URL.revokeObjectURL(cropSrc);
                    setCropSrc(null);
                  }
                }}
                imageSrc={cropSrc}
                onCropped={handleCroppedAvatar}
              />

              <div>
                <div style={labelStyle}>
                  <User size={12} strokeWidth={2} /> Username
                </div>
                <Input
                  value={formData.username}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      username: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''),
                    }))
                  }
                  placeholder="Choose a username"
                  style={inputStyle}
                />
              </div>

              <div>
                <div style={labelStyle}>
                  <FileText size={12} strokeWidth={2} /> Bio
                </div>
                <Textarea
                  value={formData.bio}
                  onChange={(e) => setFormData((prev) => ({ ...prev, bio: e.target.value }))}
                  placeholder="Tell people about yourself…"
                  rows={4}
                  style={{
                    ...inputStyle,
                    height: 'auto',
                    padding: '12px 14px',
                    resize: 'none',
                  }}
                />
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
                <h1 className="text-2xl font-bold mb-2" style={{ color: 'var(--sec-text-primary)' }}>
                  Details
                </h1>
                <p style={{ color: 'var(--sec-text-muted)' }}>Where are you? What do you drink?</p>
              </div>

              <div>
                <div style={labelStyle}>
                  <MapPin size={12} strokeWidth={2} /> City
                </div>
                <Select value={formData.city} onValueChange={(v) => setFormData((prev) => ({ ...prev, city: v }))}>
                  <SelectTrigger style={{ ...inputStyle, paddingLeft: 14 }}>
                    <SelectValue placeholder="Select your city" />
                  </SelectTrigger>
                  <SelectContent
                    style={{
                      backgroundColor: 'var(--sec-bg-elevated)',
                      border: '1px solid var(--sec-border)',
                      borderRadius: 'var(--radius-lg)',
                    }}
                  >
                    {CITIES.map((city) => (
                      <SelectItem key={city} value={city} style={{ color: 'var(--sec-text-primary)' }}>
                        {city}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <div style={labelStyle}>
                  <Wine size={12} strokeWidth={2} /> Favorite drink
                </div>
                <Select value={formData.favorite_drink} onValueChange={(v) => setFormData((prev) => ({ ...prev, favorite_drink: v }))}>
                  <SelectTrigger style={{ ...inputStyle, paddingLeft: 14 }}>
                    <SelectValue placeholder="What's your go-to?" />
                  </SelectTrigger>
                  <SelectContent
                    style={{
                      backgroundColor: 'var(--sec-bg-elevated)',
                      border: '1px solid var(--sec-border)',
                      borderRadius: 'var(--radius-lg)',
                    }}
                  >
                    {DRINKS.map((drink) => (
                      <SelectItem key={drink} value={drink} style={{ color: 'var(--sec-text-primary)' }}>
                        {drink}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
              <div className="text-center mb-8">
                <h1 className="text-2xl font-bold mb-2" style={{ color: 'var(--sec-text-primary)' }}>
                  Age verification
                </h1>
                <p style={{ color: 'var(--sec-text-muted)' }}>Add your date of birth and ID for admin review (optional now)</p>
              </div>

              <div>
                <div style={labelStyle}>
                  <User size={12} strokeWidth={2} /> Gender
                </div>
                <Select
                  value={formData.gender}
                  onValueChange={(v) => setFormData((prev) => ({ ...prev, gender: v }))}
                >
                  <SelectTrigger style={{ ...inputStyle, paddingLeft: 14 }}>
                    <SelectValue placeholder="Select your gender" />
                  </SelectTrigger>
                  <SelectContent
                    style={{
                      backgroundColor: 'var(--sec-bg-elevated)',
                      border: '1px solid var(--sec-border)',
                      borderRadius: 'var(--radius-lg)',
                    }}
                  >
                    {GENDER_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value} style={{ color: 'var(--sec-text-primary)' }}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <div style={labelStyle}>
                  <Calendar size={12} strokeWidth={2} /> Date of birth
                </div>
                <Input
                  type="date"
                  value={formData.date_of_birth}
                  onChange={(e) => setFormData((prev) => ({ ...prev, date_of_birth: e.target.value }))}
                  style={inputStyle}
                />
              </div>

              {renderFileUpload('id_document_url', 'ID document', '.pdf,.jpg,.jpeg,.png')}

              <div
                style={{
                  padding: 14,
                  borderRadius: 'var(--radius-lg)',
                  backgroundColor: 'var(--sec-bg-card)',
                  border: '1px solid var(--sec-border)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                }}
              >
                <Calendar size={16} strokeWidth={1.5} style={{ color: 'var(--sec-text-muted)', flexShrink: 0 }} />
                <p style={{ fontSize: 12, color: 'var(--sec-text-muted)', margin: 0 }}>
                  An administrator will review your ID. You can skip for now and upload from your profile later. Some features stay limited until you are verified.
                </p>
              </div>

              {error && (
                <div
                  style={{
                    padding: 12,
                    borderRadius: 'var(--radius-md)',
                    backgroundColor: 'rgba(239,68,68,0.1)',
                    border: '1px solid rgba(239,68,68,0.3)',
                    color: '#ef4444',
                    fontSize: 13,
                  }}
                >
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
                <h1 className="text-2xl font-bold mb-2" style={{ color: 'var(--sec-text-primary)' }}>
                  Payment
                </h1>
                <p style={{ color: 'var(--sec-text-muted)' }}>Payments are handled securely at checkout</p>
              </div>

              <div
                style={{
                  padding: 20,
                  borderRadius: 'var(--radius-xl)',
                  backgroundColor: 'var(--sec-bg-card)',
                  border: '1px solid var(--sec-border)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 16 }}>
                  <Lock size={20} strokeWidth={1.5} style={{ color: 'var(--sec-accent-muted)', flexShrink: 0 }} />
                  <div>
                    <p style={{ fontSize: 14, color: 'var(--sec-text-primary)', margin: '0 0 8px 0' }}>
                      Paystack powers all payments
                    </p>
                    <p style={{ fontSize: 13, color: 'var(--sec-text-muted)', margin: 0, lineHeight: 1.5 }}>
                      When you buy tickets, join tables, or boost promotions, you&apos;ll be redirected to Paystack&apos;s secure checkout. No need to add a card during setup — use the buttons below when you&apos;re ready to finish. See the{' '}
                      <Link to={createPageUrl('RefundPolicy')} style={{ color: 'var(--sec-accent)', textDecoration: 'underline', fontWeight: 600 }}>
                        Refund Policy
                      </Link>
                      {' '}and{' '}
                      <Link to={createPageUrl('TermsOfService')} style={{ color: 'var(--sec-accent)', textDecoration: 'underline', fontWeight: 600 }}>
                        Terms of Service
                      </Link>
                      .
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Navigation — steps 1–3: back + continue; step 4: back + skip / optional complete */}
      <div className="max-w-md mx-auto w-full pt-6 pb-8 px-4">
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() =>
              step === 1 ? navigate(createPageUrl('Onboarding')) : setStep(step - 1)
            }
            style={{
              height: 52,
              width: 52,
              borderRadius: 'var(--radius-lg)',
              backgroundColor: 'var(--sec-bg-card)',
              border: '1px solid var(--sec-border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              color: 'var(--sec-text-secondary)',
            }}
          >
            <ChevronLeft size={20} strokeWidth={2} />
          </button>
          {step < 4 ? (
            <button
              type="button"
              onClick={() => setStep(step + 1)}
              disabled={!canProceed()}
              style={{
                flex: 1,
                height: 52,
                borderRadius: 'var(--radius-lg)',
                backgroundColor: 'var(--sec-accent)',
                color: '#000',
                fontWeight: 600,
                fontSize: 15,
                border: 'none',
                cursor: canProceed() ? 'pointer' : 'not-allowed',
                opacity: canProceed() ? 1 : 0.5,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
              }}
            >
              {step === 3 ? (formData.id_document_url ? 'Continue' : 'Verify later') : 'Continue'}
              <ChevronRight size={20} strokeWidth={2} />
            </button>
          ) : (
            <div className="flex flex-1 flex-col gap-2">
              <button
                type="button"
                onClick={handleSkipPayment}
                disabled={isSubmitting}
                style={{
                  width: '100%',
                  minHeight: 52,
                  borderRadius: 'var(--radius-lg)',
                  backgroundColor: 'var(--sec-accent)',
                  color: '#000',
                  fontWeight: 600,
                  fontSize: 15,
                  border: 'none',
                  cursor: isSubmitting ? 'not-allowed' : 'pointer',
                  opacity: isSubmitting ? 0.5 : 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                }}
              >
                Skip for now
                <ChevronRight size={20} strokeWidth={2} />
              </button>
              <button
                type="button"
                onClick={handlePaymentSuccess}
                disabled={isSubmitting}
                style={{
                  width: '100%',
                  minHeight: 44,
                  borderRadius: 'var(--radius-lg)',
                  backgroundColor: 'transparent',
                  color: 'var(--sec-text-secondary)',
                  fontWeight: 500,
                  fontSize: 14,
                  border: '1px solid var(--sec-border)',
                  cursor: isSubmitting ? 'not-allowed' : 'pointer',
                  opacity: isSubmitting ? 0.5 : 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                }}
              >
                <CreditCard size={16} strokeWidth={2} />
                Mark payment setup complete
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
