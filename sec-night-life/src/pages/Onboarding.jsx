import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import * as authService from '@/services/authService';
import { dataService } from '@/services/dataService';
import { integrations } from '@/services/integrationService';
import { 
  Sparkles,
  User,
  MapPin,
  Wine,
  Camera,
  ChevronRight,
  ChevronLeft,
  Calendar,
  Upload,
  Check,
  AlertCircle,
  CreditCard,
  Lock
} from 'lucide-react';
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { motion, AnimatePresence } from 'framer-motion';
import { format, differenceInYears, parseISO } from 'date-fns';
import { Elements, CardNumberElement, CardExpiryElement, CardCvcElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || 'pk_test_51QoFm0ClfpV0OsOjJ18xz1Ac9CZYPrcbHvLekK5yEJr1JBQpTpHMDq6cQPMmqD0OYyqPtqlmX1sWk7BNJv0FMaXa00AkNNqoEU');

const CITIES = [
  'Johannesburg', 'Cape Town', 'Durban', 'Pretoria', 'Sandton', 
  'Port Elizabeth', 'Bloemfontein', 'East London', 'Nelspruit', 'Polokwane'
];

const DRINKS = [
  'Whiskey', 'Vodka', 'Gin', 'Tequila', 'Rum', 'Champagne', 
  'Wine', 'Beer', 'Cocktails', 'Non-alcoholic'
];

function PaymentMethodForm({ onSuccess, isSubmitting, error }) {
  const stripe = useStripe();
  const elements = useElements();
  const [cardError, setCardError] = useState('');
  const [processing, setProcessing] = useState(false);

  const handleSubmitPayment = async (e) => {
    e.preventDefault();
    
    if (!stripe || !elements) return;

    setProcessing(true);
    setCardError('');

    try {
      const cardElement = elements.getElement(CardNumberElement);
      
      const { error: stripeError, paymentMethod } = await stripe.createPaymentMethod({
        type: 'card',
        card: cardElement,
      });

      if (stripeError) {
        setCardError(stripeError.message);
        setProcessing(false);
        return;
      }

      await onSuccess();
    } catch (err) {
      setCardError('Failed to add payment method. Please try again.');
      setProcessing(false);
    }
  };

  return (
    <form onSubmit={handleSubmitPayment} className="space-y-6">
      <div className="glass-card rounded-2xl p-6">
        <div className="flex items-start gap-3 mb-6">
          <div className="w-10 h-10 rounded-full bg-[#00D4AA]/20 flex items-center justify-center flex-shrink-0">
            <Lock className="w-5 h-5 text-[#00D4AA]" />
          </div>
          <div>
            <p className="font-medium">Secure Payment</p>
            <p className="text-sm text-gray-500 mt-1">
              Your card information is encrypted and stored securely by Stripe
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <Label className="text-gray-400 text-sm mb-3 block">Card Number</Label>
            <div className="p-4 rounded-xl bg-[#0A0A0B] border border-[#262629]">
              <CardNumberElement 
                options={{
                  style: {
                    base: {
                      fontSize: '16px',
                      color: '#ffffff',
                      '::placeholder': {
                        color: '#6b7280',
                      },
                    },
                    invalid: {
                      color: '#ef4444',
                    },
                  },
                }}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-gray-400 text-sm mb-3 block">Expiration</Label>
              <div className="p-4 rounded-xl bg-[#0A0A0B] border border-[#262629]">
                <CardExpiryElement 
                  options={{
                    style: {
                      base: {
                        fontSize: '16px',
                        color: '#ffffff',
                        '::placeholder': {
                          color: '#6b7280',
                        },
                      },
                      invalid: {
                        color: '#ef4444',
                      },
                    },
                  }}
                />
              </div>
            </div>

            <div>
              <Label className="text-gray-400 text-sm mb-3 block">CVC</Label>
              <div className="p-4 rounded-xl bg-[#0A0A0B] border border-[#262629]">
                <CardCvcElement 
                  options={{
                    style: {
                      base: {
                        fontSize: '16px',
                        color: '#ffffff',
                        '::placeholder': {
                          color: '#6b7280',
                        },
                      },
                      invalid: {
                        color: '#ef4444',
                      },
                    },
                  }}
                />
              </div>
            </div>
          </div>

          {cardError && (
            <p className="text-sm text-red-500">{cardError}</p>
          )}
        </div>

        <div className="mt-4 p-3 rounded-lg bg-[#0A0A0B] flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-gray-500 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-gray-500">
            You won't be charged now. Your card will only be used for table bookings and event tickets.
          </p>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-sm">
          {error}
        </div>
      )}

      <Button
        type="submit"
        disabled={!stripe || processing || isSubmitting}
        className="w-full h-14 rounded-xl bg-gradient-to-r from-[#FF3366] to-[#7C3AED] font-semibold disabled:opacity-50"
      >
        {processing || isSubmitting ? 'Processing...' : 'Complete Setup'}
        {!processing && !isSubmitting && <Check className="w-5 h-5 ml-2" />}
      </Button>
    </form>
  );
}

function OnboardingContent() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [user, setUser] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [isVerified, setIsVerified] = useState(false);
  const [verificationError, setVerificationError] = useState('');
  const [accountType, setAccountType] = useState('');
  
  const [formData, setFormData] = useState({
    username: '',
    bio: '',
    city: '',
    favorite_drink: '',
    date_of_birth: '',
    avatar_url: '',
    account_type: '',
    id_document_url: ''
  });

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const currentUser = await authService.getCurrentUser();
      setUser(currentUser);
      
      const profiles = await dataService.User.filter({ created_by: currentUser.email });
      if (profiles.length > 0 && profiles[0].onboarding_complete) {
        navigate(createPageUrl('Home'));
      }
    } catch (e) {
      authService.redirectToLogin(createPageUrl('Onboarding'));
    }
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const { file_url } = await integrations.Core.UploadFile({ file });
      setFormData(prev => ({ ...prev, avatar_url: file_url }));
    } catch (error) {
      setError('Failed to upload image');
    }
  };

  const handleIdUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const { file_url } = await integrations.Core.UploadFile({ file });
      setFormData(prev => ({ ...prev, id_document_url: file_url }));
      setIsVerified(false);
      setVerificationError('');
    } catch (error) {
      setError('Failed to upload ID document');
    }
  };

  const verifyIdDocument = async () => {
    if (!formData.id_document_url || !formData.date_of_birth) return;

    setIsVerifying(true);
    setVerificationError('');

    try {
      const result = await integrations.Core.InvokeLLM({
        prompt: `Analyze this ID document or passport image and verify:
1. Is this a valid government-issued ID or passport?
2. Extract the date of birth from the document
3. Confirm the person is at least 18 years old
4. Check if the extracted date of birth matches: ${formData.date_of_birth}

Return a JSON response with the verification results.`,
        file_urls: [formData.id_document_url],
        response_json_schema: {
          type: "object",
          properties: {
            is_valid_document: { type: "boolean" },
            extracted_dob: { type: "string" },
            is_18_plus: { type: "boolean" },
            dob_matches: { type: "boolean" },
            reason: { type: "string" }
          }
        }
      });

      if (!result.is_valid_document) {
        setVerificationError('Invalid ID document. Please upload a clear photo of your ID or passport.');
        setIsVerified(false);
      } else if (!result.is_18_plus) {
        setVerificationError('You must be at least 18 years old to use Sec.');
        setIsVerified(false);
      } else if (!result.dob_matches) {
        setVerificationError('The date of birth on your ID does not match the one you entered. Please check and try again.');
        setIsVerified(false);
      } else {
        setIsVerified(true);
        setVerificationError('');
      }
    } catch (error) {
      setVerificationError('Failed to verify document. Please try again.');
      setIsVerified(false);
    } finally {
      setIsVerifying(false);
    }
  };

  const calculateAge = (dob) => {
    if (!dob) return 0;
    return differenceInYears(new Date(), parseISO(dob));
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setError('');

    try {
      const age = calculateAge(formData.date_of_birth);
      
      if (age < 18) {
        setError('You must be at least 18 years old to use Sec');
        setIsSubmitting(false);
        return;
      }

      // Check if profile exists
      const profiles = await dataService.User.filter({ created_by: user.email });
      
      const profileData = {
        ...formData,
        age_verified: age >= 18,
        onboarding_complete: true
      };

      const targetId = profiles.length > 0 ? profiles[0].id : user.id;
      await dataService.User.update(targetId, profileData);

      navigate(createPageUrl('Home'));
    } catch (error) {
      setError('Failed to create profile. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAccountTypeSelection = (type) => {
    setAccountType(type);
    setFormData(prev => ({ ...prev, account_type: type }));
    
    if (type === 'business') {
      // Redirect to venue onboarding for businesses
      navigate(createPageUrl('VenueOnboarding'));
    } else {
      // Continue with party-goer onboarding
      setStep(1);
    }
  };

  const steps = [
    { number: 1, title: 'Basics', icon: User },
    { number: 2, title: 'Details', icon: MapPin },
    { number: 3, title: 'Verify', icon: Calendar },
    { number: 4, title: 'Payment', icon: CreditCard },
  ];

  const canProceed = () => {
    if (step === 0) return accountType !== '';
    if (step === 1) return formData.username.length >= 3;
    if (step === 2) return formData.city;
    if (step === 3) return formData.date_of_birth && calculateAge(formData.date_of_birth) >= 18 && formData.id_document_url && isVerified;
    if (step === 4) return false; // Payment handled separately
    return true;
  };

  return (
    <div className="min-h-screen bg-[#0A0A0B] p-4 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-center pt-8 pb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#FF3366] to-[#7C3AED] flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <span className="text-2xl font-bold gradient-text">Sec</span>
        </div>
      </div>

      {/* Progress Steps - Only show for party-goer flow */}
      {step > 0 && (
        <div className="flex items-center justify-center gap-1 sm:gap-2 mb-6 px-2">
          {steps.map((s, index) => (
            <React.Fragment key={s.number}>
              <div className={`flex items-center gap-1 sm:gap-2 px-2 sm:px-3 py-1.5 rounded-full ${
                step >= s.number 
                  ? 'bg-gradient-to-r from-[#FF3366] to-[#7C3AED]' 
                  : 'bg-[#141416]'
              }`}>
                <s.icon className="w-3 h-3 sm:w-4 sm:h-4 flex-shrink-0" />
                <span className="text-[10px] sm:text-sm font-medium whitespace-nowrap">{s.title}</span>
              </div>
              {index < steps.length - 1 && (
                <div className={`w-2 sm:w-8 h-0.5 flex-shrink-0 ${step > s.number ? 'bg-[#FF3366]' : 'bg-[#262629]'}`} />
              )}
            </React.Fragment>
          ))}
        </div>
      )}

      {/* Form Content */}
      <div className="flex-1 max-w-md mx-auto w-full overflow-y-auto">
        <AnimatePresence mode="wait">
          {step === 0 && (
            <motion.div
              key="step0"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              <div className="text-center mb-8">
                <h1 className="text-3xl font-bold mb-3">Welcome to Sec</h1>
                <p className="text-gray-500">Choose your account type to get started</p>
              </div>

              <div className="grid grid-cols-1 gap-4">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => handleAccountTypeSelection('user')}
                  className={`p-6 rounded-2xl text-left transition-all ${
                    accountType === 'user'
                      ? 'bg-gradient-to-br from-[#FF3366]/20 to-[#7C3AED]/20 border-2 border-[#FF3366]'
                      : 'bg-[#141416] border-2 border-[#262629] hover:border-[#FF3366]/50'
                  }`}
                >
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#FF3366] to-[#7C3AED] flex items-center justify-center flex-shrink-0">
                      <User className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold mb-2">Party-Goer</h3>
                      <p className="text-sm text-gray-400">
                        Join events, book tables, connect with friends, and experience the nightlife
                      </p>
                    </div>
                  </div>
                </motion.button>

                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => handleAccountTypeSelection('business')}
                  className={`p-6 rounded-2xl text-left transition-all ${
                    accountType === 'business'
                      ? 'bg-gradient-to-br from-[#FF3366]/20 to-[#7C3AED]/20 border-2 border-[#FF3366]'
                      : 'bg-[#141416] border-2 border-[#262629] hover:border-[#FF3366]/50'
                  }`}
                >
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#FFD700] to-[#FF3366] flex items-center justify-center flex-shrink-0">
                      <Sparkles className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold mb-2">Business Owner</h3>
                      <p className="text-sm text-gray-400">
                        List your venue, create events, manage bookings, and grow your business
                      </p>
                    </div>
                  </div>
                </motion.button>
              </div>
            </motion.div>
          )}

          {step === 1 && (
            <motion.div
              key="step1"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <div className="text-center mb-8">
                <h1 className="text-2xl font-bold mb-2">Let's set up your profile</h1>
                <p className="text-gray-500">Tell us a bit about yourself</p>
              </div>

              {/* Avatar Upload */}
              <div className="flex justify-center">
                <label className="cursor-pointer">
                  <div className="w-24 h-24 rounded-full bg-gradient-to-br from-[#FF3366] to-[#7C3AED] p-0.5 relative">
                    <div className="w-full h-full rounded-full bg-[#141416] overflow-hidden flex items-center justify-center">
                      {formData.avatar_url ? (
                        <img src={formData.avatar_url} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <Camera className="w-8 h-8 text-gray-600" />
                      )}
                    </div>
                    <div className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-[#FF3366] flex items-center justify-center">
                      <Upload className="w-4 h-4" />
                    </div>
                  </div>
                  <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                </label>
              </div>

              <div className="space-y-4">
                <div>
                  <Label className="text-gray-400 text-sm">Username</Label>
                  <Input
                    placeholder="Choose a unique username"
                    value={formData.username}
                    onChange={(e) => setFormData(prev => ({ ...prev, username: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') }))}
                    className="mt-2 h-12 bg-[#141416] border-[#262629] rounded-xl"
                  />
                  {formData.username && (
                    <p className="text-xs text-gray-500 mt-1">@{formData.username}</p>
                  )}
                </div>

                <div>
                  <Label className="text-gray-400 text-sm">Bio</Label>
                  <Textarea
                    placeholder="Tell people about yourself..."
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
              className="space-y-6 pb-20"
            >
              <div className="text-center mb-8">
                <h1 className="text-2xl font-bold mb-2">Where do you party?</h1>
                <p className="text-gray-500">Help us find events near you</p>
              </div>

              <div className="space-y-4">
                <div>
                  <Label className="text-gray-400 text-sm">City</Label>
                  <Select value={formData.city} onValueChange={(value) => setFormData(prev => ({ ...prev, city: value }))}>
                    <SelectTrigger className="mt-2 h-12 bg-[#141416] border-[#262629] rounded-xl">
                      <SelectValue placeholder="Select your city" />
                    </SelectTrigger>
                    <SelectContent className="bg-[#141416] border-[#FF3366]/30 backdrop-blur-xl text-white max-h-[300px] overflow-y-auto">
                      {CITIES.map((city) => (
                        <SelectItem key={city} value={city} className="text-white focus:bg-gradient-to-r focus:from-[#FF3366]/20 focus:to-[#7C3AED]/20 focus:text-white cursor-pointer">{city}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-gray-400 text-sm">Favorite Drink</Label>
                  <Select value={formData.favorite_drink} onValueChange={(value) => setFormData(prev => ({ ...prev, favorite_drink: value }))}>
                    <SelectTrigger className="mt-2 h-12 bg-[#141416] border-[#262629] rounded-xl">
                      <SelectValue placeholder="What's your go-to?" />
                    </SelectTrigger>
                    <SelectContent className="bg-[#141416] border-[#FF3366]/30 backdrop-blur-xl text-white max-h-[50vh]">
                      {DRINKS.map((drink) => (
                        <SelectItem key={drink} value={drink} className="text-white focus:bg-gradient-to-r focus:from-[#FF3366]/20 focus:to-[#7C3AED]/20 focus:text-white cursor-pointer">{drink}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
              <div className="text-center mb-8">
                <h1 className="text-2xl font-bold mb-2">Verify your age</h1>
                <p className="text-gray-500">Required for legal compliance</p>
              </div>

              <div className="glass-card rounded-2xl p-6">
                <div className="flex items-start gap-3 mb-6">
                  <div className="w-10 h-10 rounded-full bg-[#FFD700]/20 flex items-center justify-center flex-shrink-0">
                    <AlertCircle className="w-5 h-5 text-[#FFD700]" />
                  </div>
                  <div>
                    <p className="font-medium">Age Verification Required</p>
                    <p className="text-sm text-gray-500 mt-1">
                      You must be at least 18 years old to use Sec. This helps us comply with liquor licensing laws.
                    </p>
                  </div>
                </div>

                <div>
                  <Label className="text-gray-400 text-sm">Date of Birth</Label>
                  <Input
                    type="date"
                    value={formData.date_of_birth}
                    onChange={(e) => setFormData(prev => ({ ...prev, date_of_birth: e.target.value }))}
                    className="mt-2 h-12 bg-[#0A0A0B] border-[#262629] rounded-xl"
                  />
                  {formData.date_of_birth && (
                    <p className={`text-sm mt-2 ${
                      calculateAge(formData.date_of_birth) >= 18 ? 'text-[#00D4AA]' : 'text-red-500'
                    }`}>
                      {calculateAge(formData.date_of_birth) >= 18 
                        ? `✓ You are ${calculateAge(formData.date_of_birth)} years old`
                        : 'You must be at least 18 years old'
                      }
                    </p>
                  )}
                </div>

                <div className="mt-6">
                  <Label className="text-gray-400 text-sm">ID/Passport Document *</Label>
                  <label className="cursor-pointer block mt-2">
                    <div className={`p-6 rounded-xl border-2 border-dashed transition-all ${
                      formData.id_document_url 
                        ? 'border-[#00D4AA] bg-[#00D4AA]/10' 
                        : 'border-[#262629] bg-[#141416] hover:border-[#FF3366]/50'
                    }`}>
                      <div className="flex flex-col items-center gap-3">
                        {formData.id_document_url ? (
                          <>
                            <div className="w-12 h-12 rounded-full bg-[#00D4AA]/20 flex items-center justify-center">
                              <Check className="w-6 h-6 text-[#00D4AA]" />
                            </div>
                            <div className="text-center">
                              <p className="font-medium text-[#00D4AA]">Document Uploaded</p>
                              <p className="text-xs text-gray-500 mt-1">Click to replace</p>
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="w-12 h-12 rounded-full bg-[#FF3366]/20 flex items-center justify-center">
                              <Upload className="w-6 h-6 text-[#FF3366]" />
                            </div>
                            <div className="text-center">
                              <p className="font-medium">Upload ID or Passport</p>
                              <p className="text-xs text-gray-500 mt-1">Required for age verification</p>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                    <input 
                      type="file" 
                      accept="image/*,.pdf" 
                      className="hidden" 
                      onChange={handleIdUpload} 
                    />
                  </label>
                  <p className="text-xs text-gray-500 mt-2">
                    Your document is encrypted and stored securely
                  </p>
                </div>

                {formData.id_document_url && formData.date_of_birth && calculateAge(formData.date_of_birth) >= 18 && !isVerified && (
                  <Button
                    onClick={verifyIdDocument}
                    disabled={isVerifying}
                    className="w-full h-12 rounded-xl bg-gradient-to-r from-[#FF3366] to-[#7C3AED] font-semibold mt-4"
                  >
                    {isVerifying ? 'Verifying...' : 'Verify Document'}
                  </Button>
                )}

                {isVerified && (
                  <div className="mt-4 p-4 rounded-xl bg-[#00D4AA]/10 border border-[#00D4AA]/20 text-[#00D4AA] text-sm flex items-center gap-2">
                    <Check className="w-5 h-5" />
                    <span>Document verified successfully</span>
                  </div>
                )}

                {verificationError && (
                  <div className="mt-4 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-sm">
                    {verificationError}
                  </div>
                )}
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
                <h1 className="text-2xl font-bold mb-2">Add Payment Method</h1>
                <p className="text-gray-500">Secure your account and enable payments</p>
              </div>

              <PaymentMethodForm 
                onSuccess={handleSubmit}
                isSubmitting={isSubmitting}
                error={error}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Navigation Buttons */}
      <div className="max-w-md mx-auto w-full pt-6">
        <div className="flex gap-3">
          {step === 0 ? (
            <Button
              onClick={() => navigate(createPageUrl('Home'))}
              variant="outline"
              className="h-14 px-6 rounded-xl bg-[#141416] border-[#262629]"
            >
              <ChevronLeft className="w-5 h-5" />
            </Button>
          ) : step < 4 && (
            <Button
              onClick={() => setStep(step - 1)}
              variant="outline"
              className="h-14 px-6 rounded-xl bg-[#141416] border-[#262629]"
            >
              <ChevronLeft className="w-5 h-5" />
            </Button>
          )}
          
          {step > 0 && step < 4 && (
            <Button
              onClick={() => setStep(step + 1)}
              disabled={!canProceed()}
              className="flex-1 h-14 rounded-xl bg-gradient-to-r from-[#FF3366] to-[#7C3AED] font-semibold disabled:opacity-50"
            >
              Continue
              <ChevronRight className="w-5 h-5 ml-2" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Onboarding() {
  return (
    <Elements stripe={stripePromise}>
      <OnboardingContent />
    </Elements>
  );
}