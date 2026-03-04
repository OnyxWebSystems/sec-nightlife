import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import * as authService from '@/services/authService';
import { dataService } from '@/services/dataService';
import { integrations } from '@/services/integrationService';
import { ChevronLeft, Camera, User, MapPin, Wine, FileText, BadgeCheck } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
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

export default function EditProfile() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const [formData, setFormData] = useState({
    username: '',
    bio: '',
    city: '',
    favorite_drink: '',
    avatar_url: '',
  });

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      const currentUser = await authService.getCurrentUser();
      setUser(currentUser);
      const profiles = await dataService.User.filter({ created_by: currentUser.email });
      if (profiles.length > 0) {
        const profile = profiles[0];
        setUserProfile(profile);
        setFormData({
          username: profile.username || '',
          bio: profile.bio || '',
          city: profile.city || '',
          favorite_drink: profile.favorite_drink || '',
          avatar_url: profile.avatar_url || '',
        });
      }
    } catch (e) {
      authService.redirectToLogin();
    } finally {
      setIsLoading(false);
    }
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const { file_url } = await integrations.Core.UploadFile({ file });
      setFormData(prev => ({ ...prev, avatar_url: file_url }));
    } catch {
      toast.error('Failed to upload image');
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await dataService.User.update(userProfile.id, formData);
      toast.success('Profile updated');
      navigate(createPageUrl('Profile'));
    } catch {
      toast.error('Failed to update profile');
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

  /* ── shared field label style ── */
  const labelStyle = {
    display: 'flex', alignItems: 'center', gap: 6,
    fontSize: 11, fontWeight: 600, letterSpacing: '0.09em',
    textTransform: 'uppercase', color: 'var(--sec-text-muted)',
    marginBottom: 8,
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--sec-bg-base)', paddingBottom: 40 }}>

      {/* ── Header ── */}
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
          onClick={handleSave}
          disabled={isSaving}
          className="sec-btn sec-btn-primary"
          style={{ padding: '8px 20px', fontSize: 13 }}
        >
          {isSaving ? 'Saving…' : 'Save'}
        </button>
      </header>

      <div style={{ maxWidth: 480, margin: '0 auto', padding: '32px 20px', display: 'flex', flexDirection: 'column', gap: 24 }}>

        {/* ── Avatar ── */}
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <label style={{ cursor: 'pointer' }}>
            <div style={{ position: 'relative' }}>
              {/* Avatar ring — single silver border, no gradient */}
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

              {/* Camera badge — dark circle with silver border */}
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
            <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleImageUpload} />
          </label>
        </div>

        {/* ── Verified promoter banner ── */}
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

        {/* ── Form fields ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Username */}
          <div>
            <div style={labelStyle}>
              <User size={12} strokeWidth={2} />
              Username
            </div>
            <Input
              value={formData.username}
              onChange={(e) => setFormData(prev => ({ ...prev, username: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') }))}
              placeholder="Choose a unique username"
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
            {formData.username && (
              <p style={{ fontSize: 12, color: 'var(--sec-text-muted)', marginTop: 6 }}>
                @{formData.username}
              </p>
            )}
          </div>

          {/* Bio */}
          <div>
            <div style={labelStyle}>
              <FileText size={12} strokeWidth={2} />
              Bio
            </div>
            <Textarea
              value={formData.bio}
              onChange={(e) => setFormData(prev => ({ ...prev, bio: e.target.value }))}
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

          {/* City */}
          <div>
            <div style={labelStyle}>
              <MapPin size={12} strokeWidth={2} />
              City
            </div>
            <Select value={formData.city} onValueChange={(v) => setFormData(prev => ({ ...prev, city: v }))}>
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
                    key={city} value={city}
                    style={{ color: 'var(--sec-text-primary)', cursor: 'pointer' }}
                  >
                    {city}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Favourite drink */}
          <div>
            <div style={labelStyle}>
              <Wine size={12} strokeWidth={2} />
              Favourite Drink
            </div>
            <Select value={formData.favorite_drink} onValueChange={(v) => setFormData(prev => ({ ...prev, favorite_drink: v }))}>
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
                    key={drink} value={drink}
                    style={{ color: 'var(--sec-text-primary)', cursor: 'pointer' }}
                  >
                    {drink}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* ── Save — full-width bottom CTA ── */}
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="sec-btn sec-btn-primary sec-btn-full"
          style={{ marginTop: 8, fontSize: 15 }}
        >
          {isSaving ? 'Saving…' : 'Save Changes'}
        </button>
      </div>
    </div>
  );
}
