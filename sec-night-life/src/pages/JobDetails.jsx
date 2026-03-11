import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import * as authService from '@/services/authService';
import { dataService } from '@/services/dataService';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  ChevronLeft,
  Share2,
  Briefcase,
  MapPin,
  Calendar,
  Clock,
  DollarSign,
  BadgeCheck,
  Users,
  CheckCircle2,
  ChevronRight,
  Send,
  Camera,
  Music,
  Mic2
} from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { format, parseISO } from 'date-fns';
import { motion } from 'framer-motion';

export default function JobDetails() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [user, setUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [showApplyDialog, setShowApplyDialog] = useState(false);
  const [applicationMessage, setApplicationMessage] = useState('');
  
  const urlParams = new URLSearchParams(window.location.search);
  const jobId = urlParams.get('id');

  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    try {
      const currentUser = await authService.getCurrentUser();
      setUser(currentUser);
      const profiles = await dataService.User.filter({ created_by: currentUser.email });
      if (profiles.length > 0) {
        setUserProfile(profiles[0]);
      }
    } catch (e) {}
  };

  const { data: job, isLoading } = useQuery({
    queryKey: ['job', jobId],
    queryFn: async () => {
      const jobs = await dataService.Job.filter({ id: jobId });
      return jobs[0];
    },
    enabled: !!jobId,
  });

  const { data: venue } = useQuery({
    queryKey: ['job-venue', job?.venue_id],
    queryFn: async () => {
      const venues = await dataService.Venue.filter({ id: job.venue_id });
      return venues[0];
    },
    enabled: !!job?.venue_id,
  });

  const { data: event } = useQuery({
    queryKey: ['job-event', job?.event_id],
    queryFn: async () => {
      if (!job?.event_id) return null;
      const events = await dataService.Event.filter({ id: job.event_id });
      return events[0];
    },
    enabled: !!job?.event_id,
  });

  const applyMutation = useMutation({
    mutationFn: async () => {
      const updatedApplicants = [
        ...(job.applicants || []),
        {
          user_id: userProfile?.id,
          status: 'pending',
          applied_at: new Date().toISOString(),
          message: applicationMessage
        }
      ];
      
      await dataService.Job.update(jobId, {
        applicants: updatedApplicants
      });

      // Create chat for negotiation
      await dataService.Chat.create({
        type: 'job_negotiation',
        name: `${job.title} - ${userProfile?.username}`,
        participants: [userProfile?.id, venue?.owner_user_id].filter(Boolean),
        related_job_id: jobId
      });
    },
    onSuccess: () => {
      setShowApplyDialog(false);
      queryClient.invalidateQueries(['job', jobId]);
    },
  });

  if (isLoading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--sec-bg-base)' }}>
        <div className="sec-spinner" />
      </div>
    );
  }

  if (!job) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--sec-bg-base)' }}>
        <div style={{ textAlign: 'center' }}>
          <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8, color: 'var(--sec-text-primary)' }}>Job not found</h2>
          <Link to={createPageUrl('Jobs')} style={{ color: 'var(--sec-accent)' }}>Browse Jobs</Link>
        </div>
      </div>
    );
  }

  const hasApplied = job.applicants?.some(a => a.user_id === userProfile?.id);
  const spotsRemaining = (job.spots_available || 1) - (job.spots_filled || 0);
  const JOB_ICONS = { promoter: Mic2, table_host: Users, dj: Music, photographer: Camera };
  const JobIcon = JOB_ICONS[job.job_type] || Briefcase;

  return (
    <div style={{ minHeight: '100vh', paddingBottom: 128, backgroundColor: 'var(--sec-bg-base)' }}>
      {/* Header */}
      <header style={{ position: 'sticky', top: 0, zIndex: 40, backgroundColor: 'rgba(0,0,0,0.92)', backdropFilter: 'blur(16px)', borderBottom: '1px solid var(--sec-border)' }}>
        <div style={{ padding: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <button onClick={() => navigate(-1)} className="sec-nav-icon" style={{ width: 40, height: 40, borderRadius: '50%' }}>
            <ChevronLeft size={20} strokeWidth={1.5} />
          </button>
          <button className="sec-nav-icon" style={{ width: 40, height: 40, borderRadius: '50%' }}>
            <Share2 size={20} strokeWidth={1.5} />
          </button>
        </div>
      </header>

      <div style={{ padding: '24px 16px', display: 'flex', flexDirection: 'column', gap: 24 }}>
        {/* Job Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
          <div style={{ width: 64, height: 64, borderRadius: 16, backgroundColor: 'var(--sec-bg-elevated)', border: '1px solid var(--sec-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
            {venue?.logo_url ? (
              <img src={venue.logo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <JobIcon size={28} strokeWidth={1.5} style={{ color: 'var(--sec-accent)' }} />
            )}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{ fontSize: 24, fontWeight: 600, color: 'var(--sec-text-primary)' }}>{job.title}</h1>
            {venue && (
              <Link to={createPageUrl(`VenueProfile?id=${venue.id}`)} style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, color: 'var(--sec-text-muted)', textDecoration: 'none' }}>
                <span>{venue.name}</span>
                {venue.is_verified && <BadgeCheck size={16} strokeWidth={1.5} style={{ color: 'var(--sec-accent)' }} />}
              </Link>
            )}
          </div>
        </div>

        {/* Quick Info */}
        <div className="sec-card" style={{ borderRadius: 16, padding: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {job.date && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: 'var(--sec-accent-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Calendar size={20} strokeWidth={1.5} style={{ color: 'var(--sec-accent)' }} />
                </div>
                <div>
                  <p style={{ fontSize: 11, color: 'var(--sec-text-muted)' }}>Date</p>
                  <p style={{ fontWeight: 500, color: 'var(--sec-text-primary)' }}>{format(parseISO(job.date), 'EEE, MMM d')}</p>
                </div>
              </div>
            )}
            {job.start_time && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: 'var(--sec-accent-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Clock size={20} strokeWidth={1.5} style={{ color: 'var(--sec-accent)' }} />
                </div>
                <div>
                  <p style={{ fontSize: 11, color: 'var(--sec-text-muted)' }}>Time</p>
                  <p style={{ fontWeight: 500, color: 'var(--sec-text-primary)' }}>{job.start_time} - {job.end_time || 'Late'}</p>
                </div>
              </div>
            )}
            {job.city && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: 'var(--sec-accent-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <MapPin size={20} strokeWidth={1.5} style={{ color: 'var(--sec-accent)' }} />
                </div>
                <div>
                  <p style={{ fontSize: 11, color: 'var(--sec-text-muted)' }}>Location</p>
                  <p style={{ fontWeight: 500, color: 'var(--sec-text-primary)' }}>{job.city}</p>
                </div>
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: 'var(--sec-accent-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Users size={20} strokeWidth={1.5} style={{ color: 'var(--sec-accent)' }} />
              </div>
              <div>
                <p style={{ fontSize: 11, color: 'var(--sec-text-muted)' }}>Spots</p>
                <p style={{ fontWeight: 500, color: 'var(--sec-text-primary)' }}>{spotsRemaining} available</p>
              </div>
            </div>
          </div>
        </div>

        {/* Pay */}
        {job.suggested_pay_amount && (
          <div className="glass-card rounded-2xl p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <DollarSign className="w-5 h-5" style={{ color: 'var(--sec-success)' }} />
                <span className="text-gray-400">Suggested Pay</span>
              </div>
              <div className="text-right">
                <p className="text-xl font-bold" style={{ color: 'var(--sec-success)' }}>
                  R{job.suggested_pay_amount}
                  {job.suggested_pay_type === 'hourly' && '/hr'}
                </p>
                {job.commission_percentage && (
                  <p className="text-sm text-gray-500">+ {job.commission_percentage}% commission</p>
                )}
              </div>
            </div>
            <p className="text-xs text-gray-500 mt-3">
              * Final terms negotiated via chat after application
            </p>
          </div>
        )}

        {/* Description */}
        {job.description && (
          <div>
            <h2 style={{ fontWeight: 600, marginBottom: 8, color: 'var(--sec-text-primary)' }}>About this role</h2>
            <p style={{ color: 'var(--sec-text-muted)', lineHeight: 1.6 }}>{job.description}</p>
          </div>
        )}

        {/* Responsibilities */}
        {job.responsibilities?.length > 0 && (
          <div>
            <h2 style={{ fontWeight: 600, marginBottom: 12, color: 'var(--sec-text-primary)' }}>Responsibilities</h2>
            <ul style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {job.responsibilities.map((item, index) => (
                <li key={index} style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  <CheckCircle2 size={20} strokeWidth={1.5} style={{ color: 'var(--sec-accent)', flexShrink: 0, marginTop: 2 }} />
                  <span style={{ color: 'var(--sec-text-muted)' }}>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Requirements */}
        {job.requirements?.length > 0 && (
          <div>
            <h2 style={{ fontWeight: 600, marginBottom: 12, color: 'var(--sec-text-primary)' }}>Requirements</h2>
            <ul style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {job.requirements.map((item, index) => (
                <li key={index} style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: 'var(--sec-accent)', flexShrink: 0, marginTop: 6 }} />
                  <span style={{ color: 'var(--sec-text-muted)' }}>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Related Event */}
        {event && (
          <div>
            <h2 style={{ fontWeight: 600, marginBottom: 12, color: 'var(--sec-text-primary)' }}>Related Event</h2>
            <Link to={createPageUrl(`EventDetails?id=${event.id}`)} className="sec-card" style={{ display: 'flex', alignItems: 'center', gap: 16, padding: 16, borderRadius: 12, textDecoration: 'none' }}>
              <div style={{ width: 56, height: 56, borderRadius: 12, backgroundColor: 'var(--sec-bg-elevated)', flexShrink: 0, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {event.cover_image_url ? (
                  <img src={event.cover_image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <Calendar size={24} strokeWidth={1.5} style={{ color: 'var(--sec-accent)' }} />
                )}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <h3 style={{ fontWeight: 500, color: 'var(--sec-text-primary)' }}>{event.title}</h3>
                <p style={{ fontSize: 13, color: 'var(--sec-text-muted)' }}>{format(parseISO(event.date), 'EEE, MMM d')}</p>
              </div>
              <ChevronRight size={20} strokeWidth={1.5} style={{ color: 'var(--sec-text-muted)' }} />
            </Link>
          </div>
        )}
      </div>

      {/* Fixed Bottom Bar */}
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, padding: 16, backgroundColor: 'rgba(0,0,0,0.95)', backdropFilter: 'blur(16px)', borderTop: '1px solid var(--sec-border)' }}>
        <div style={{ maxWidth: 448, margin: '0 auto' }}>
          {hasApplied ? (
            <button disabled className="sec-btn sec-btn-secondary w-full" style={{ height: 56, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: 0.7 }}>
              <CheckCircle2 size={20} strokeWidth={1.5} style={{ color: 'var(--sec-accent)' }} />
              Application Sent
            </button>
          ) : spotsRemaining > 0 ? (
            <button
              onClick={() => setShowApplyDialog(true)}
              className="sec-btn sec-btn-primary w-full"
              style={{ height: 56, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
            >
              <Send size={20} strokeWidth={1.5} />
              Apply Now
            </button>
          ) : (
            <button disabled className="sec-btn sec-btn-secondary w-full" style={{ height: 56, borderRadius: 12 }}>
              Position Filled
            </button>
          )}
        </div>
      </div>

      {/* Apply Dialog */}
      <Dialog open={showApplyDialog} onOpenChange={setShowApplyDialog}>
        <DialogContent className="max-w-md" style={{ backgroundColor: 'var(--sec-bg-card)', borderColor: 'var(--sec-border)' }}>
          <DialogHeader>
            <DialogTitle>Apply for {job.title}</DialogTitle>
            <DialogDescription>
              Introduce yourself and why you're a great fit
            </DialogDescription>
          </DialogHeader>
          <div style={{ padding: '16px 0', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Textarea
              placeholder="Hi! I have experience in... I'd love to work with you because..."
              value={applicationMessage}
              onChange={(e) => setApplicationMessage(e.target.value)}
              className="sec-input min-h-[120px]"
            />
            <p style={{ fontSize: 13, color: 'var(--sec-text-muted)' }}>
              After applying, you'll be connected via chat to negotiate final terms.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <Button variant="outline" onClick={() => setShowApplyDialog(false)} className="sec-btn sec-btn-secondary flex-1">
              Cancel
            </Button>
            <button
              onClick={() => applyMutation.mutate()}
              disabled={applyMutation.isPending}
              className="sec-btn sec-btn-primary flex-1"
            >
              {applyMutation.isPending ? 'Sending...' : 'Submit Application'}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}