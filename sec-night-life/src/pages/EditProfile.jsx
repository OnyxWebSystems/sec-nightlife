import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import * as authService from '@/services/authService';
import { integrations } from '@/services/integrationService';
import { apiGet, apiPatch } from '@/api/client';
import { ChevronLeft, Camera, User, MapPin, Wine, FileText, BadgeCheck, Loader2, Check, X, Upload, Calendar } from 'lucide-react';
import { Link } from 'react-router-dom';
import AvatarCropDialog from '@/components/profile/AvatarCropDialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';

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

export default function EditProfile() {
  const navigate = useNavigate();
  const [userProfile, setUserProfile] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [usernameCheck, setUsernameCheck] = useState(null);

  const [formData, setFormData] = useState({
    full_name: '',
    username: '',
    bio: '',
    city: '',
    favorite_drink: '',
    gender: '',
    avatar_url: '',
    date_of_birth: '',
    id_document_url: '',
  });
  const [cropOpen, setCropOpen] = useState(false);
  const [cropSrc, setCropSrc] = useState(null);
  const [idUploading, setIdUploading] = useState(false);

  const normalizedUsername = useMemo(
    () => formData.username.trim().toLowerCase().replace(/[^a-z0-9_]/g, ''),
    [formData.username]
  );

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (normalizedUsername.length < 3) {
      setUsernameCheck(normalizedUsername.length === 0 ? null : 'invalid');
      return;
    }
    setUsernameCheck('loading');
    const t = setTimeout(async () => {
      try {
        const res = await apiGet(`/api/users/check-username/${encodeURIComponent(normalizedUsername)}`);
        setUsernameCheck(res.available ? 'ok' : 'taken');
      } catch {
        setUsernameCheck(null);
      }
    }, 500);
    return () => clearTimeout(t);
  }, [normalizedUsername]);

  const usernameBlocking =
    !normalizedUsername || normalizedUsername.length < 3 || usernameCheck !== 'ok';

  const loadData = async () => {
    try {
      const rows = await apiGet('/api/users/profile');
      const profile = Array.isArray(rows) ? rows[0] : rows;
      if (!profile) {
        toast.error('Profile not found');
        authService.redirectToLogin();
        return;
      }
      setUserProfile(profile);
      const u = (profile.username || '').toString().replace(/^@/, '');
      setFormData({
        full_name: profile.full_name || '',
        username: u,
        bio: profile.bio || '',
        city: profile.city || '',
        favorite_drink: profile.favorite_drink || '',
        gender: profile.gender || '',
        avatar_url: profile.avatar_url || '',
        date_of_birth: profile.date_of_birth || '',
        id_document_url: profile.id_document_url || '',
      });
    } catch {
      authService.redirectToLogin();
    } finally {
      setIsLoading(false);
    }
  };

  const onPickAvatarImage = (e) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith('image/')) {
      if (file) toast.error('Please choose an image file');
      return;
    }
    if (cropSrc) URL.revokeObjectURL(cropSrc);
    setCropSrc(URL.createObjectURL(file));
    setCropOpen(true);
    e.target.value = '';
  };

  const handleCroppedAvatar = async (file) => {
    try {
      const { file_url } = await integrations.Core.UploadFile({ file });
      setFormData((prev) => ({ ...prev, avatar_url: file_url }));
      toast.success('Photo ready — save to apply');
    } catch {
      toast.error('Failed to upload image');
    }
  };

  const handleIdUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIdUploading(true);
    try {
      const { file_url } = await integrations.Core.UploadFile({ file });
      setFormData((prev) => ({ ...prev, id_document_url: file_url }));
      toast.success('ID uploaded — save to submit for review');
    } catch {
      toast.error('Failed to upload document');
    } finally {
      setIdUploading(false);
    }
  };

  const handleSave = async () => {
    if (usernameBlocking) {
      toast.error('Choose an available username (3–30 characters, letters, numbers, underscores)');
      return;
    }
    setIsSaving(true);
    try {
      const trimmedId = formData.id_document_url && String(formData.id_document_url).trim();
      const payload = {
        full_name: formData.full_name.trim(),
        username: normalizedUsername,
        bio: formData.bio,
        city: formData.city || null,
        favorite_drink: formData.favorite_drink || null,
        gender: formData.gender || null,
        avatar_url: formData.avatar_url || null,
        date_of_birth: formData.date_of_birth || null,
        id_document_url: formData.id_document_url || null,
      };
      const vs = userProfile?.verification_status;
      const alreadyVerified = vs === 'verified' || vs === 'approved';
      const prevId = (userProfile?.id_document_url || '').trim();
      const idDocumentChanged = Boolean(trimmedId && trimmedId !== prevId);
      if (trimmedId && !alreadyVerified) {
        if (vs === 'rejected' || vs === 'pending' || !vs || vs === 'submitted' || idDocumentChanged) {
          payload.verification_status = 'submitted';
        }
      }
      const updated = await apiPatch('/api/users/profile', payload);
      setUserProfile((prev) => (prev ? { ...prev, ...updated } : prev));
      toast.success('Profile updated');
      navigate(createPageUrl('Profile'));
    } catch (err) {
      const msg = err?.data?.error || err?.message || 'Failed to update profile';
      toast.error(msg);
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--sec-bg-base)' }}>
        <div className="sec-spinner" />
      </div>
    );
  }

  const labelStyle = {
    display: 'flex', alignItems: 'center', gap: 6,
    fontSize: 11, fontWeight: 600, letterSpacing: '0.09em',
    textTransform: 'uppercase', color: 'var(--sec-text-muted)',
    marginBottom: 8,
  };

  const citySelectValue = formData.city && CITIES.includes(formData.city) ? formData.city : '';

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--sec-bg-base)', paddingBottom: 40 }}>

      <header style={{
        position: 'sticky', top: 0, zIndex: 40,
        backgroundColor: 'rgba(0,0,0,0.92)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderBottom: '1px solid var(--sec-border)',
        padding: '0 20px', height: 60,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            type="button"
            onClick={() => navigate(-1)}
            style={{
              width: 36, height: 36, borderRadius: '50%',
              backgroundColor: 'var(--sec-bg-card)',
              border: '1px solid var(--sec-border)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', color: 'var(--sec-text-secondary)',
            }}
          >
            <ChevronLeft size={18} strokeWidth={2} />
          </button>
          <h1 style={{ fontSize: 16, fontWeight: 600, color: 'var(--sec-text-primary)', letterSpacing: '-0.01em' }}>
            Edit Profile
          </h1>
        </div>

        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving || usernameBlocking}
          className="sec-btn sec-btn-primary"
          style={{ padding: '8px 20px', fontSize: 13 }}
        >
          {isSaving ? 'Saving…' : 'Save'}
        </button>
      </header>

      <div style={{ maxWidth: 480, margin: '0 auto', padding: '32px 20px', display: 'flex', flexDirection: 'column', gap: 24 }}>

        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <label style={{ cursor: 'pointer' }}>
            <div style={{ position: 'relative' }}>
              <div style={{
                width: 96, height: 96, borderRadius: '50%',
                border: '1px solid var(--sec-border-strong)',
                backgroundColor: 'var(--sec-bg-elevated)',
                overflow: 'hidden',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {formData.avatar_url ? (
                  <img src={formData.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <User size={36} strokeWidth={1.5} style={{ color: 'var(--sec-text-muted)' }} />
                )}
              </div>

              <div style={{
                position: 'absolute', bottom: 0, right: 0,
                width: 30, height: 30, borderRadius: '50%',
                backgroundColor: 'var(--sec-bg-card)',
                border: '1px solid var(--sec-border-strong)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
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

        {userProfile?.is_verified_promoter && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '12px 16px', borderRadius: 'var(--radius-lg)',
            backgroundColor: 'var(--sec-accent-muted)',
            border: '1px solid var(--sec-accent-border)',
          }}>
            <BadgeCheck size={16} strokeWidth={1.5} style={{ color: 'var(--sec-accent)' }} />
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--sec-accent)' }}>
              Verified Promoter
            </span>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          <div>
            <div style={labelStyle}>
              <User size={12} strokeWidth={2} />
              Full name
            </div>
            <Input
              value={formData.full_name}
              onChange={(e) => setFormData((prev) => ({ ...prev, full_name: e.target.value }))}
              placeholder="Your display name"
              style={{
                height: 46,
                backgroundColor: 'var(--sec-bg-elevated)',
                border: '1px solid var(--sec-border)',
                borderRadius: 'var(--radius-md)',
                color: 'var(--sec-text-primary)',
                fontSize: 14,
                paddingLeft: 14,
              }}
            />
            <p style={{ fontSize: 12, color: 'var(--sec-text-muted)', marginTop: 6 }}>
              Others can search for you by this name. Duplicates are allowed.
            </p>
          </div>

          <div>
            <div style={labelStyle}>
              <User size={12} strokeWidth={2} />
              Username
            </div>
            <Input
              value={formData.username}
              onChange={(e) => setFormData((prev) => ({
                ...prev,
                username: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''),
              }))}
              placeholder="Unique handle"
              autoComplete="username"
              style={{
                height: 46,
                backgroundColor: 'var(--sec-bg-elevated)',
                border: '1px solid var(--sec-border)',
                borderRadius: 'var(--radius-md)',
                color: 'var(--sec-text-primary)',
                fontSize: 14,
                paddingLeft: 14,
              }}
            />
            {formData.username ? (
              <p style={{ fontSize: 12, color: 'var(--sec-text-muted)', marginTop: 6 }}>
                @{formData.username}
              </p>
            ) : null}
            <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 12, minHeight: 22 }}>
              {usernameCheck === 'loading' && (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--sec-text-muted)' }} />
                  <span style={{ color: 'var(--sec-text-muted)' }}>Checking…</span>
                </>
              )}
              {usernameCheck === 'ok' && (
                <>
                  <Check size={16} style={{ color: 'var(--sec-accent, #22c55e)' }} />
                  <span style={{ color: 'var(--sec-accent, #22c55e)' }}>Username available</span>
                </>
              )}
              {usernameCheck === 'taken' && (
                <>
                  <X size={16} style={{ color: '#ef4444' }} />
                  <span style={{ color: '#ef4444' }}>Username already taken</span>
                </>
              )}
              {usernameCheck === 'invalid' && (
                <span style={{ color: '#f59e0b' }}>3–30 characters, letters, numbers, underscores only</span>
              )}
            </div>
          </div>

          <div>
            <div style={labelStyle}>
              <FileText size={12} strokeWidth={2} />
              Bio
            </div>
            <Textarea
              value={formData.bio}
              onChange={(e) => setFormData((prev) => ({ ...prev, bio: e.target.value }))}
              placeholder="Tell people about yourself…"
              rows={4}
              style={{
                backgroundColor: 'var(--sec-bg-elevated)',
                border: '1px solid var(--sec-border)',
                borderRadius: 'var(--radius-md)',
                color: 'var(--sec-text-primary)',
                fontSize: 14,
                padding: '12px 14px',
                resize: 'none',
              }}
            />
          </div>

          <div>
            <div style={labelStyle}>
              <MapPin size={12} strokeWidth={2} />
              City
            </div>
            <Select
              value={citySelectValue}
              onValueChange={(v) => setFormData((prev) => ({ ...prev, city: v }))}
            >
              <SelectTrigger style={{
                height: 46,
                backgroundColor: 'var(--sec-bg-elevated)',
                border: '1px solid var(--sec-border)',
                borderRadius: 'var(--radius-md)',
                color: formData.city ? 'var(--sec-text-primary)' : 'var(--sec-text-muted)',
                fontSize: 14,
              }}>
                <SelectValue placeholder="Select your city" />
              </SelectTrigger>
              <SelectContent style={{
                backgroundColor: 'var(--sec-bg-elevated)',
                border: '1px solid var(--sec-border)',
                borderRadius: 'var(--radius-lg)',
              }}>
                {CITIES.map((city) => (
                  <SelectItem
                    key={city}
                    value={city}
                    style={{ color: 'var(--sec-text-primary)', cursor: 'pointer' }}
                  >
                    {city}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <div style={labelStyle}>
              <User size={12} strokeWidth={2} />
              Gender
            </div>
            <Select value={formData.gender} onValueChange={(v) => setFormData((prev) => ({ ...prev, gender: v }))}>
              <SelectTrigger style={{
                height: 46,
                backgroundColor: 'var(--sec-bg-elevated)',
                border: '1px solid var(--sec-border)',
                borderRadius: 'var(--radius-md)',
                color: formData.gender ? 'var(--sec-text-primary)' : 'var(--sec-text-muted)',
                fontSize: 14,
              }}>
                <SelectValue placeholder="Select your gender" />
              </SelectTrigger>
              <SelectContent style={{
                backgroundColor: 'var(--sec-bg-elevated)',
                border: '1px solid var(--sec-border)',
                borderRadius: 'var(--radius-lg)',
              }}>
                {GENDER_OPTIONS.map((option) => (
                  <SelectItem
                    key={option.value}
                    value={option.value}
                    style={{ color: 'var(--sec-text-primary)', cursor: 'pointer' }}
                  >
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <div style={labelStyle}>
              <Wine size={12} strokeWidth={2} />
              Favourite Drink
            </div>
            <Select value={formData.favorite_drink} onValueChange={(v) => setFormData((prev) => ({ ...prev, favorite_drink: v }))}>
              <SelectTrigger style={{
                height: 46,
                backgroundColor: 'var(--sec-bg-elevated)',
                border: '1px solid var(--sec-border)',
                borderRadius: 'var(--radius-md)',
                color: formData.favorite_drink ? 'var(--sec-text-primary)' : 'var(--sec-text-muted)',
                fontSize: 14,
              }}>
                <SelectValue placeholder="What's your go-to?" />
              </SelectTrigger>
              <SelectContent style={{
                backgroundColor: 'var(--sec-bg-elevated)',
                border: '1px solid var(--sec-border)',
                borderRadius: 'var(--radius-lg)',
              }}>
                {DRINKS.map((drink) => (
                  <SelectItem
                    key={drink}
                    value={drink}
                    style={{ color: 'var(--sec-text-primary)', cursor: 'pointer' }}
                  >
                    {drink}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div
            style={{
              padding: 16,
              borderRadius: 'var(--radius-lg)',
              border: '1px solid var(--sec-border)',
              backgroundColor: 'var(--sec-bg-card)',
            }}
          >
            <div style={{ ...labelStyle, marginBottom: 12 }}>
              <BadgeCheck size={12} strokeWidth={2} />
              Identity verification
            </div>
            <p style={{ fontSize: 13, color: 'var(--sec-text-secondary)', marginBottom: 12 }}>
              Status:{' '}
              <strong style={{ color: 'var(--sec-text-primary)' }}>
                {userProfile?.verification_status === 'verified' || userProfile?.verification_status === 'approved'
                  ? 'Verified'
                  : userProfile?.verification_status === 'submitted'
                    ? 'Pending review'
                    : userProfile?.verification_status === 'rejected'
                      ? 'Rejected'
                      : 'Not verified'}
              </strong>
            </p>
            {userProfile?.verification_rejection_note && userProfile?.verification_status === 'rejected' ? (
              <p style={{ fontSize: 12, color: '#f87171', marginBottom: 12 }}>
                {userProfile.verification_rejection_note}
              </p>
            ) : null}
            {userProfile?.verification_status !== 'verified' && userProfile?.verification_status !== 'approved' ? (
              <>
                <div style={{ marginBottom: 12 }}>
                  <div style={labelStyle}>
                    <Calendar size={12} strokeWidth={2} /> Date of birth
                  </div>
                  <Input
                    type="date"
                    value={formData.date_of_birth}
                    onChange={(e) => setFormData((prev) => ({ ...prev, date_of_birth: e.target.value }))}
                    style={{
                      height: 46,
                      backgroundColor: 'var(--sec-bg-elevated)',
                      border: '1px solid var(--sec-border)',
                      borderRadius: 'var(--radius-md)',
                      color: 'var(--sec-text-primary)',
                      fontSize: 14,
                      paddingLeft: 14,
                    }}
                  />
                </div>
                <div>
                  <div style={labelStyle}>
                    <FileText size={12} strokeWidth={2} /> ID document
                  </div>
                  <label style={{ cursor: idUploading ? 'wait' : 'pointer', display: 'block' }}>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '12px 14px',
                        borderRadius: 'var(--radius-md)',
                        border: '1px solid var(--sec-border)',
                        backgroundColor: 'var(--sec-bg-elevated)',
                      }}
                    >
                      <span style={{ fontSize: 13, color: 'var(--sec-text-secondary)' }}>
                        {idUploading ? 'Uploading…' : formData.id_document_url ? 'Document attached' : 'Upload PDF or image'}
                      </span>
                      <Upload size={18} style={{ color: 'var(--sec-text-muted)' }} />
                    </div>
                    <input
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png"
                      style={{ display: 'none' }}
                      disabled={idUploading}
                      onChange={handleIdUpload}
                    />
                  </label>
                </div>
                <p style={{ fontSize: 12, color: 'var(--sec-text-muted)', marginTop: 6 }}>
                  After you save, your ID is sent for admin review.{' '}
                  <Link to={createPageUrl('Profile')} style={{ color: 'var(--sec-accent)' }}>
                    Open Profile
                  </Link>
                </p>
              </>
            ) : null}
          </div>
        </div>

        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving || usernameBlocking}
          className="sec-btn sec-btn-primary sec-btn-full"
          style={{ marginTop: 8, fontSize: 15 }}
        >
          {isSaving ? 'Saving…' : 'Save Changes'}
        </button>
      </div>
    </div>
  );
}
