/**
 * Create Host Event — informal events (house parties, boat parties, etc.)
 * No venue/compliance required. Sec brand theme.
 */
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import * as authService from '@/services/authService';
import { dataService } from '@/services/dataService';
import {
  Calendar,
  MapPin,
  Users,
  DollarSign,
  ChevronLeft,
  Loader2,
  Check,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';

export default function CreateHostEvent() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    date: '',
    location: '',
    city: '',
    capacity: '',
    entry_cost: '',
    guest_approval_required: true,
  });

  useEffect(() => {
    (async () => {
      try {
        const u = await authService.getCurrentUser();
        setUser(u);
      } catch {
        authService.redirectToLogin(createPageUrl('CreateHostEvent'));
      }
    })();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.title || !formData.date) {
      toast.error('Title and date are required');
      return;
    }
    setIsSubmitting(true);
    try {
      const payload = {
        title: formData.title,
        description: formData.description || undefined,
        date: formData.date,
        location: formData.location || undefined,
        city: formData.city || undefined,
        capacity: formData.capacity ? parseInt(formData.capacity, 10) : undefined,
        entry_cost: formData.entry_cost ? parseFloat(formData.entry_cost) : undefined,
        guest_approval_required: formData.guest_approval_required,
        status: 'published',
      };
      const event = await dataService.HostEvent.create(payload);
      toast.success('Event created!');
      navigate(createPageUrl('HostDashboard'));
    } catch (err) {
      console.error(err);
      toast.error(err?.message || 'Failed to create event. Run the database migration first.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!user) return null;

  return (
    <div style={{ minHeight: '100vh', paddingBottom: 100, backgroundColor: 'var(--sec-bg-base)' }}>
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 40,
          backgroundColor: 'rgba(0,0,0,0.92)',
          backdropFilter: 'blur(16px)',
          borderBottom: '1px solid var(--sec-border)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 20px' }}>
          <button
            onClick={() => navigate(-1)}
            style={{
              width: 40,
              height: 40,
              borderRadius: 12,
              border: '1px solid var(--sec-border)',
              backgroundColor: 'var(--sec-bg-card)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              color: 'var(--sec-text-primary)',
            }}
          >
            <ChevronLeft size={20} />
          </button>
          <h1 style={{ fontSize: 18, fontWeight: 600, color: 'var(--sec-text-primary)' }}>
            Create Host Event
          </h1>
        </div>
      </header>

      <form onSubmit={handleSubmit} style={{ padding: 20 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div>
            <Label style={{ color: 'var(--sec-text-muted)', marginBottom: 8, display: 'block' }}>
              Event Name *
            </Label>
            <Input
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="e.g. House Party, Boat Party"
              required
              className="sec-input-rect"
              style={{ backgroundColor: 'var(--sec-bg-elevated)', borderColor: 'var(--sec-border)' }}
            />
          </div>

          <div>
            <Label style={{ color: 'var(--sec-text-muted)', marginBottom: 8, display: 'block' }}>
              Date *
            </Label>
            <Input
              type="date"
              value={formData.date}
              onChange={(e) => setFormData({ ...formData, date: e.target.value })}
              required
              className="sec-input-rect"
              style={{ backgroundColor: 'var(--sec-bg-elevated)', borderColor: 'var(--sec-border)' }}
            />
          </div>

          <div>
            <Label style={{ color: 'var(--sec-text-muted)', marginBottom: 8, display: 'block' }}>
              Location / Address
            </Label>
            <Input
              value={formData.location}
              onChange={(e) => setFormData({ ...formData, location: e.target.value })}
              placeholder="Full address or general area"
              className="sec-input-rect"
              style={{ backgroundColor: 'var(--sec-bg-elevated)', borderColor: 'var(--sec-border)' }}
            />
          </div>

          <div>
            <Label style={{ color: 'var(--sec-text-muted)', marginBottom: 8, display: 'block' }}>
              City
            </Label>
            <Input
              value={formData.city}
              onChange={(e) => setFormData({ ...formData, city: e.target.value })}
              placeholder="e.g. Johannesburg"
              className="sec-input-rect"
              style={{ backgroundColor: 'var(--sec-bg-elevated)', borderColor: 'var(--sec-border)' }}
            />
          </div>

          <div>
            <Label style={{ color: 'var(--sec-text-muted)', marginBottom: 8, display: 'block' }}>
              Description
            </Label>
            <Textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Tell guests what to expect"
              rows={4}
              className="sec-input-rect"
              style={{ backgroundColor: 'var(--sec-bg-elevated)', borderColor: 'var(--sec-border)' }}
            />
          </div>

          <div>
            <Label style={{ color: 'var(--sec-text-muted)', marginBottom: 8, display: 'block' }}>
              Capacity
            </Label>
            <Input
              type="number"
              min={1}
              value={formData.capacity}
              onChange={(e) => setFormData({ ...formData, capacity: e.target.value })}
              placeholder="Max guests"
              className="sec-input-rect"
              style={{ backgroundColor: 'var(--sec-bg-elevated)', borderColor: 'var(--sec-border)' }}
            />
          </div>

          <div>
            <Label style={{ color: 'var(--sec-text-muted)', marginBottom: 8, display: 'block' }}>
              Entry Cost (R)
            </Label>
            <Input
              type="number"
              min={0}
              step={0.01}
              value={formData.entry_cost}
              onChange={(e) => setFormData({ ...formData, entry_cost: e.target.value })}
              placeholder="0 for free entry"
              className="sec-input-rect"
              style={{ backgroundColor: 'var(--sec-bg-elevated)', borderColor: 'var(--sec-border)' }}
            />
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: 16,
              borderRadius: 12,
              backgroundColor: 'var(--sec-bg-card)',
              border: '1px solid var(--sec-border)',
            }}
          >
            <Label style={{ color: 'var(--sec-text-primary)', fontWeight: 500 }}>
              Require approval for guests
            </Label>
            <Switch
              checked={formData.guest_approval_required}
              onCheckedChange={(v) =>
                setFormData({ ...formData, guest_approval_required: v })
              }
            />
          </div>

          <Button
            type="submit"
            disabled={isSubmitting}
            className="sec-btn sec-btn-accent sec-btn-full sec-btn-lg"
          >
            {isSubmitting ? (
              <Loader2 size={18} className="animate-spin mr-2" />
            ) : (
              <Check size={18} className="mr-2" />
            )}
            Create Event
          </Button>
        </div>
      </form>
    </div>
  );
}
