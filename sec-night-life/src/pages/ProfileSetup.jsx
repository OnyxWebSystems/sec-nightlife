import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import * as authService from '@/services/authService';
import { dataService } from '@/services/dataService';
import { integrations } from '@/services/integrationService';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, CardNumberElement, CardExpiryElement, CardCvcElement, useStripe, useElements } from '@stripe/react-stripe-js';
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

const CITIES = [
  'Johannesburg', 'Cape Town', 'Durban', 'Pretoria', 'Sandton',
  'Port Elizabeth', 'Bloemfontein', 'East London', 'Nelspruit', 'Polokwane',
];

const DRINKS = [
  'Whiskey', 'Vodka', 'Gin', 'Tequila', 'Rum', 'Champagne',
  'Wine', 'Beer', 'Cocktails', 'Non-alcoholic',
];

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || 'pk_test_placeholder');

const CARD_ELEMENT_OPTIONS = {
  style: {
    base: {
      color: 'var(--sec-text-primary)',
      fontFamily: 'inherit',
      fontSize: '14px',
      '::placeholder': { color: 'var(--sec-text-muted)' },
      backgroundColor: 'var(--sec-bg-elevated)',
    },
    invalid: {
      color: 'var(--sec-accent)',
    },
  },
};

/* ── Inline PaymentMethodForm (SEC colors: Lock in var(--sec-accent-muted), no #00D4AA or gradient) ── */
function PaymentFormInner({ onSuccess, onError, disabled }) {
  const stripe = useStripe();
  const elements = useElements();
  const [isProcessing, setIsProcessing] = useState(false);
  const [cardComplete, setCardComplete] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!stripe || !elements) return;

    const cardNumber = elements.getElement(CardNumberElement);
    if (!cardNumber) return;

    setIsProcessing(true);
    try {
      const { error, paymentMethod } = await stripe.createPaymentMethod({
        type: 'card',
        card: cardNumber,
      });
      if (error) {
        onError?.(error.message);
      } else {
        onSuccess?.(paymentMethod);
      }
    } catch (err) {
      onError?.(err.message || 'Payment failed');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{
        padding: '14px 16px',
        borderRadius: 'var(--radius-md)',
        backgroundColor: 'var(--sec-bg-elevated)',
        border: '1px solid var(--sec-border)',
      }}>
        <div style={{ marginBottom: 12 }}>
          <Label style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.09em', textTransform: 'uppercase', color: 'var(--sec-text-muted)', marginBottom: 8, display: 'block' }}>
            Card number
          </Label>
          <div style={{
            padding: '10px 14px',
            borderRadius: 'var(--radius-md)',
            backgroundColor: 'var(--sec-bg-card)',
            border: '1px solid var(--sec-border)',
          }}>
            <CardNumberElement
              options={CARD_ELEMENT_OPTIONS}
              onChange={(e) => setCardComplete(e.complete)}
            />
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <Label style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.09em', textTransform: 'uppercase', color: 'var(--sec-text-muted)', marginBottom: 8, display: 'block' }}>
              Expiry
            </Label>
            <div style={{
              padding: '10px 14px',
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'var(--sec-bg-card)',
              border: '1px solid var(--sec-border)',
            }}>
              <CardExpiryElement options={CARD_ELEMENT_OPTIONS} />
            </div>
          </div>
          <div>
            <Label style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.09em', textTransform: 'uppercase', color: 'var(--sec-text-muted)', marginBottom: 8, display: 'block' }}>
              CVC
            </Label>
            <div style={{
              padding: '10px 14px',
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'var(--sec-bg-card)',
              border: '1px solid var(--sec-border)',
            }}>
              <CardCvcElement options={CARD_ELEMENT_OPTIONS} />
            </div>
          </div>
        </div>
      </div>

      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '12px 14px',
        borderRadius: 'var(--radius-md)',
        backgroundColor: 'var(--sec-bg-card)',
        border: '1px solid var(--sec-border)',
      }}>
        <Lock size={16} strokeWidth={1.5} style={{ color: 'var(--sec-accent-muted)', flexShrink: 0 }} />
        <p style={{ fontSize: 12, color: 'var(--sec-text-muted)', margin: 0 }}>
          Your card details are encrypted and secure.
        </p>
      </div>

      <button
        type="submit"
        disabled={!stripe || !cardComplete || isProcessing || disabled}
        style={{
          width: '100%',
          height: 48,
          borderRadius: 'var(--radius-lg)',
          backgroundColor: 'var(--sec-accent)',
          color: '#000',
          fontWeight: 600,
          fontSize: 15,
          border: 'none',
          cursor: !stripe || !cardComplete || isProcessing || disabled ? 'not-allowed' : 'pointer',
          opacity: !stripe || !cardComplete || isProcessing || disabled ? 0.5 : 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
        }}
      >
        {isProcessing ? (
          <>Processing…</>
        ) : (
          <>
            <CreditCard size={18} strokeWidth={2} />
            Add Card & Complete
          </>
        )}
      </button>
    </form>
  );
}

export default function ProfileSetup() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [user, setUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [uploadProgress, setUploadProgress] = useState({});
  const [idVerifyResult, setIdVerifyResult] = useState(null);
  const [isVerifyingId, setIsVerifyingId] = useState(false);

  const [formData, setFormData] = useState({
    username: '',
    bio: '',
    avatar_url: '',
    city: '',
    favorite_drink: '',
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
      if (field === 'id_document_url') setIdVerifyResult(null);
    } catch (err) {
      setUploadProgress((prev) => ({ ...prev, [field]: 'error' }));
      setError('Failed to upload file');
    }
  };

  const handleVerifyId = async () => {
    if (!formData.id_document_url || !formData.date_of_birth) return;
    setIsVerifyingId(true);
    setError('');
    try {
      const result = await integrations.Core.InvokeLLM();
      setIdVerifyResult(result);
      if (!result.is_valid_document || !result.is_18_plus || !result.dob_matches) {
        setError(result.reason || 'Verification failed');
      }
    } catch (err) {
      setError('Verification failed. Please try again.');
      setIdVerifyResult({ is_valid_document: false, is_18_plus: false, dob_matches: false });
    } finally {
      setIsVerifyingId(false);
    }
  };

  const canProceed = () => {
    if (step === 1) return formData.username && formData.bio.trim().length > 0;
    if (step === 2) return formData.city && formData.favorite_drink;
    if (step === 3) return true;
    if (step === 4) return false;
    return true;
  };

  const isVerificationComplete = () => {
    if (!idVerifyResult) return false;
    return idVerifyResult.is_valid_document && idVerifyResult.is_18_plus && idVerifyResult.dob_matches;
  };

  const completeOnboarding = async (options = {}) => {
    const { paymentCompleted = false } = options;
    setIsSubmitting(true);
    setError('');
    try {
      const verified = isVerificationComplete();
      const payload = {
        username: formData.username,
        bio: formData.bio,
        city: formData.city,
        favorite_drink: formData.favorite_drink,
        age_verified: verified,
        verification_status: verified ? 'verified' : 'pending',
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
                if (field === 'id_document_url') setIdVerifyResult(null);
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
                  <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => handleFileUpload('avatar_url', e)} />
                </label>
              </div>

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
                <p style={{ color: 'var(--sec-text-muted)' }}>DOB & ID required</p>
              </div>

              <div>
                <div style={labelStyle}>
                  <Calendar size={12} strokeWidth={2} /> Date of birth
                </div>
                <Input
                  type="date"
                  value={formData.date_of_birth}
                  onChange={(e) => {
                    setFormData((prev) => ({ ...prev, date_of_birth: e.target.value }));
                    setIdVerifyResult(null);
                  }}
                  style={inputStyle}
                />
              </div>

              {renderFileUpload('id_document_url', 'ID document', '.pdf,.jpg,.jpeg,.png')}

              {formData.date_of_birth && formData.id_document_url && (
                <div>
                  <button
                    type="button"
                    onClick={handleVerifyId}
                    disabled={isVerifyingId}
                    style={{
                      width: '100%',
                      height: 46,
                      borderRadius: 'var(--radius-lg)',
                      backgroundColor: 'var(--sec-accent)',
                      color: '#000',
                      fontWeight: 600,
                      fontSize: 14,
                      border: 'none',
                      cursor: isVerifyingId ? 'not-allowed' : 'pointer',
                      opacity: isVerifyingId ? 0.7 : 1,
                    }}
                  >
                    {isVerifyingId ? 'Verifying…' : 'Verify ID'}
                  </button>
                </div>
              )}

              {idVerifyResult && (
                <div
                  style={{
                    padding: 14,
                    borderRadius: 'var(--radius-lg)',
                    backgroundColor:
                      idVerifyResult.is_valid_document && idVerifyResult.is_18_plus && idVerifyResult.dob_matches
                        ? 'var(--sec-accent-muted)'
                        : 'rgba(239,68,68,0.1)',
                    border: `1px solid ${
                      idVerifyResult.is_valid_document && idVerifyResult.is_18_plus && idVerifyResult.dob_matches
                        ? 'var(--sec-accent-border)'
                        : 'rgba(239,68,68,0.3)'
                    }`,
                  }}
                >
                  {idVerifyResult.is_valid_document && idVerifyResult.is_18_plus && idVerifyResult.dob_matches ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <Check size={20} style={{ color: 'var(--sec-accent)' }} />
                      <span style={{ fontSize: 14, color: 'var(--sec-text-primary)' }}>Verification passed</span>
                    </div>
                  ) : (
                    <p style={{ fontSize: 13, color: 'var(--sec-text-secondary)' }}>
                      {idVerifyResult.reason || 'Verification failed. Please check your DOB and ID.'}
                    </p>
                  )}
                </div>
              )}

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
                  Verification can be completed later from your profile settings. Some features may be limited until verified.
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
                <p style={{ color: 'var(--sec-text-muted)' }}>Add a card to complete setup</p>
              </div>

              <div
                style={{
                  padding: 20,
                  borderRadius: 'var(--radius-xl)',
                  backgroundColor: 'var(--sec-bg-card)',
                  border: '1px solid var(--sec-border)',
                }}
              >
                <Elements stripe={stripePromise}>
                  <PaymentFormInner
                    onSuccess={handlePaymentSuccess}
                    onError={(msg) => setError(msg)}
                    disabled={isSubmitting}
                  />
                </Elements>
              </div>

              <button
                type="button"
                onClick={handleSkipPayment}
                disabled={isSubmitting}
                style={{
                  width: '100%',
                  padding: '12px 20px',
                  marginTop: 8,
                  borderRadius: 'var(--radius-lg)',
                  backgroundColor: 'transparent',
                  border: '1px solid var(--sec-border)',
                  color: 'var(--sec-text-secondary)',
                  fontSize: 14,
                  fontWeight: 500,
                  cursor: isSubmitting ? 'not-allowed' : 'pointer',
                  opacity: isSubmitting ? 0.6 : 1,
                }}
              >
                Skip for now — add payment later
              </button>

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
        </AnimatePresence>
      </div>

      {/* Navigation — only show for steps 1–3 */}
      {step < 4 && (
        <div className="max-w-md mx-auto w-full pt-6 pb-8 px-4">
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => (step === 1 ? navigate(createPageUrl('Onboarding')) : setStep(step - 1))}
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
              {step === 3 ? (isVerificationComplete() ? 'Continue' : 'Verify later') : 'Continue'}
              <ChevronRight size={20} strokeWidth={2} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
