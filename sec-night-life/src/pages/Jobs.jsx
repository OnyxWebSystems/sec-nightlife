import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { dataService } from '@/services/dataService';
import { useQuery } from '@tanstack/react-query';
import { 
  Briefcase,
  Search,
  MapPin,
  Calendar,
  DollarSign,
  Clock,
  Users,
  Camera,
  Music,
  ChevronRight,
  BadgeCheck,
  Mic2
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { motion } from 'framer-motion';

const JOB_TYPES = [
  { value: 'all', label: 'All', icon: Briefcase },
  { value: 'promoter', label: 'Promoter', icon: Mic2 },
  { value: 'table_host', label: 'Table Host', icon: Users },
  { value: 'dj', label: 'DJ', icon: Music },
  { value: 'photographer', label: 'Photo', icon: Camera },
];

function getJobIcon(jobType) {
  const found = JOB_TYPES.find(t => t.value === jobType);
  return found ? found.icon : Briefcase;
}

export default function Jobs() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState('all');

  const { data: jobs = [], isLoading } = useQuery({
    queryKey: ['jobs', selectedType],
    queryFn: async () => {
      const filter = { status: 'open' };
      if (selectedType !== 'all') filter.job_type = selectedType;
      return dataService.Job.filter(filter, '-created_date', 100);
    },
  });

  const { data: venues = [] } = useQuery({
    queryKey: ['job-venues'],
    queryFn: () => dataService.Venue.list(),
  });

  const venuesMap = venues.reduce((acc, venue) => {
    acc[venue.id] = venue;
    return acc;
  }, {});

  const filteredJobs = jobs.filter(job =>
    job.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    job.city?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--sec-bg-base)' }}>
      <header style={{ position: 'sticky', top: 0, zIndex: 40, backgroundColor: 'rgba(0,0,0,0.92)', backdropFilter: 'blur(16px)', borderBottom: '1px solid var(--sec-border)' }}>
        <div style={{ padding: 'var(--space-4) var(--space-6)' }}>
          <h1 style={{ fontSize: 24, fontWeight: 600, marginBottom: 16, color: 'var(--sec-text-primary)' }}>Nightlife Jobs</h1>
          <div style={{ position: 'relative' }}>
            <Search size={18} strokeWidth={1.5} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--sec-text-muted)' }} />
            <input className="sec-input" placeholder="Search jobs..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} style={{ paddingLeft: 44, height: 48 }} />
          </div>
        </div>
        <div style={{ padding: '0 var(--space-6) var(--space-4)' }}>
          <div style={{ display: 'flex', gap: 8, overflowX: 'auto' }} className="scrollbar-hide">
            {JOB_TYPES.map((type) => {
              const Icon = type.icon;
              const isSelected = selectedType === type.value;
              return (
                <button
                  key={type.value}
                  onClick={() => setSelectedType(type.value)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderRadius: 999, whiteSpace: 'nowrap',
                    backgroundColor: isSelected ? 'var(--sec-accent)' : 'var(--sec-bg-card)',
                    color: isSelected ? 'var(--sec-bg-base)' : 'var(--sec-text-secondary)',
                    border: `1px solid ${isSelected ? 'var(--sec-accent)' : 'var(--sec-border)'}`
                  }}
                >
                  <Icon size={16} strokeWidth={1.5} />
                  <span style={{ fontSize: 13, fontWeight: 500 }}>{type.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </header>

      <div style={{ padding: '24px 16px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Jobs List */}
        {filteredJobs.map((job, index) => {
          const venue = venuesMap[job.venue_id];
          
          return (
            <motion.div
              key={job.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
            >
              <Link
                to={createPageUrl(`JobDetails?id=${job.id}`)}
                className="sec-card block rounded-xl p-4 transition-colors group"
              >
                <div className="flex items-start gap-4">
                  {/* Job type icon or venue logo */}
                  <div style={{ width: 56, height: 56, borderRadius: 12, backgroundColor: 'var(--sec-bg-elevated)', border: '1px solid var(--sec-border)', flexShrink: 0, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {venue?.logo_url ? (
                      <img src={venue.logo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      (() => {
                        const JobIcon = getJobIcon(job.job_type);
                        return <JobIcon size={24} strokeWidth={1.5} style={{ color: 'var(--sec-accent)' }} />;
                      })()
                    )}
                  </div>

                  {/* Job Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="font-semibold">{job.title}</h3>
                        <div className="flex items-center gap-2 mt-1">
                          {venue && (
                            <span style={{ fontSize: 13, color: 'var(--sec-text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                              {venue.name}
                              {venue.is_verified && (
                                <BadgeCheck size={14} strokeWidth={1.5} style={{ color: 'var(--sec-accent)' }} />
                              )}
                            </span>
                          )}
                        </div>
                      </div>
                      <ChevronRight size={20} strokeWidth={1.5} style={{ color: 'var(--sec-text-muted)' }} className="group-hover:opacity-80 transition-opacity" />
                    </div>

                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 12, fontSize: 13, color: 'var(--sec-text-muted)' }}>
                      {job.date && (
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5" />
                          {format(parseISO(job.date), 'EEE, MMM d')}
                        </span>
                      )}
                      {job.city && (
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5" />
                          {job.city}
                        </span>
                      )}
                      {job.start_time && (
                        <span className="flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5" />
                          {job.start_time}
                        </span>
                      )}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--sec-border)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span className="sec-badge sec-badge-gold" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          {(() => {
                            const JobBadgeIcon = getJobIcon(job.job_type);
                            return <><JobBadgeIcon size={12} strokeWidth={1.5} />{job.job_type?.replace('_', ' ')}</>;
                          })()}
                        </span>
                        <span style={{ fontSize: 11, color: 'var(--sec-text-muted)' }}>
                          {job.spots_available - (job.spots_filled || 0)} spots
                        </span>
                      </div>

                      {job.suggested_pay_amount && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, fontWeight: 600, color: 'var(--sec-accent)' }}>
                          <DollarSign size={16} strokeWidth={1.5} />
                          R{job.suggested_pay_amount}
                          {job.suggested_pay_type === 'hourly' && '/hr'}
                          {job.suggested_pay_type === 'commission' && ` + ${job.commission_percentage}%`}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </Link>
            </motion.div>
          );
        })}

        {filteredJobs.length === 0 && !isLoading && (
          <div style={{ textAlign: 'center', padding: '48px 24px' }}>
            <div style={{ width: 72, height: 72, borderRadius: '50%', backgroundColor: 'var(--sec-bg-card)', border: '1px solid var(--sec-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <Briefcase size={32} strokeWidth={1.5} style={{ color: 'var(--sec-text-muted)' }} />
            </div>
            <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8, color: 'var(--sec-text-primary)' }}>No jobs available</h3>
            <p style={{ color: 'var(--sec-text-muted)' }}>Check back soon for new opportunities</p>
          </div>
        )}

        {isLoading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {[...Array(5)].map((_, i) => (
              <div key={i} className="sec-card" style={{ padding: 16 }}>
                <div style={{ display: 'flex', gap: 16 }}>
                  <div style={{ width: 56, height: 56, borderRadius: 12, backgroundColor: 'var(--sec-border)' }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ height: 18, width: 120, borderRadius: 4, backgroundColor: 'var(--sec-border)', marginBottom: 8 }} />
                    <div style={{ height: 14, width: 80, borderRadius: 4, backgroundColor: 'var(--sec-border)', marginBottom: 12 }} />
                    <div style={{ height: 12, width: 180, borderRadius: 4, backgroundColor: 'var(--sec-border)' }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}