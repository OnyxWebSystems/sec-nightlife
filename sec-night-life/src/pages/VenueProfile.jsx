import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { dataService } from '@/services/dataService';
import { useQuery } from '@tanstack/react-query';
import { 
  ChevronLeft,
  Share2,
  Heart,
  MapPin,
  Phone,
  Globe,
  Instagram,
  Star,
  BadgeCheck,
  Calendar,
  Users,
  Briefcase,
  Clock,
  Navigation,
  ChevronRight,
  Shield
} from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format, parseISO, isToday, isTomorrow } from 'date-fns';
import { motion } from 'framer-motion';

import FeaturedEventCard from '@/components/home/FeaturedEventCard';

export default function VenueProfile() {
  const navigate = useNavigate();
  const [isFollowing, setIsFollowing] = useState(false);
  
  const urlParams = new URLSearchParams(window.location.search);
  const venueId = urlParams.get('id');

  const { data: venue, isLoading } = useQuery({
    queryKey: ['venue', venueId],
    queryFn: async () => {
      const venues = await dataService.Venue.filter({ id: venueId });
      return venues[0];
    },
    enabled: !!venueId,
  });

  const { data: events = [] } = useQuery({
    queryKey: ['venue-events', venueId],
    queryFn: () => dataService.Event.filter({ venue_id: venueId, status: 'published' }, 'date'),
    enabled: !!venueId,
  });

  const { data: jobs = [] } = useQuery({
    queryKey: ['venue-jobs', venueId],
    queryFn: () => dataService.Job.filter({ venue_id: venueId, status: 'open' }),
    enabled: !!venueId,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-12 h-12 rounded-full border-2 border-[#FF3366] border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!venue) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-bold mb-2">Venue not found</h2>
          <Link to={createPageUrl('Explore')} className="text-[#FF3366]">
            Browse Venues
          </Link>
        </div>
      </div>
    );
  }

  const getDateLabel = (date) => {
    if (!date) return '';
    const d = parseISO(date);
    if (isToday(d)) return 'Tonight';
    if (isTomorrow(d)) return 'Tomorrow';
    return format(d, 'EEE, MMM d');
  };

  return (
    <div className="min-h-screen pb-8">
      {/* Hero */}
      <div className="relative h-72">
        {venue.cover_image_url ? (
          <img 
            src={venue.cover_image_url} 
            alt={venue.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-[#FF3366] to-[#7C3AED]" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-[#0A0A0B] via-transparent to-transparent" />
        
        {/* Header */}
        <div className="absolute top-0 left-0 right-0 flex items-center justify-between p-4">
          <button
            onClick={() => navigate(-1)}
            className="w-10 h-10 rounded-full bg-black/30 backdrop-blur-md flex items-center justify-center"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="flex gap-2">
            <button className="w-10 h-10 rounded-full bg-black/30 backdrop-blur-md flex items-center justify-center">
              <Share2 className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Logo */}
        {venue.logo_url && (
          <div className="absolute bottom-4 left-4 w-20 h-20 rounded-2xl overflow-hidden border-4 border-[#0A0A0B]">
            <img src={venue.logo_url} alt="" className="w-full h-full object-cover" />
          </div>
        )}
      </div>

      <div className="px-4 lg:px-8 space-y-6">
        {/* Title & Verification */}
        <div className="flex items-start justify-between pt-2">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold">{venue.name}</h1>
              {venue.is_verified && (
                <div className="w-6 h-6 rounded-full bg-[#FFD700] flex items-center justify-center">
                  <BadgeCheck className="w-4 h-4 text-black" />
                </div>
              )}
            </div>
            <div className="flex items-center gap-3 mt-1 text-sm text-gray-400">
              <span className="capitalize">{venue.venue_type?.replace('_', ' ')}</span>
              {venue.rating > 0 && (
                <>
                  <span>•</span>
                  <span className="flex items-center gap-1">
                    <Star className="w-4 h-4 fill-[#FFD700] text-[#FFD700]" />
                    {venue.rating.toFixed(1)}
                  </span>
                </>
              )}
              {venue.age_limit && (
                <>
                  <span>•</span>
                  <span>{venue.age_limit}+</span>
                </>
              )}
            </div>
          </div>
          <Button
            onClick={() => setIsFollowing(!isFollowing)}
            variant={isFollowing ? 'outline' : 'default'}
            className={isFollowing ? 'border-[#262629]' : 'bg-[#FF3366]'}
          >
            {isFollowing ? 'Following' : 'Follow'}
          </Button>
        </div>

        {/* Verification Badge */}
        {venue.is_verified && (
          <div className="flex items-center gap-3 p-3 rounded-xl bg-[#FFD700]/10 border border-[#FFD700]/20">
            <Shield className="w-5 h-5 text-[#FFD700]" />
            <div>
              <p className="font-medium text-sm text-[#FFD700]">Verified Venue</p>
              <p className="text-xs text-gray-400">License and compliance verified</p>
            </div>
          </div>
        )}

        {/* Bio */}
        {venue.bio && (
          <p className="text-gray-400">{venue.bio}</p>
        )}

        {/* Contact & Info */}
        <div className="glass-card rounded-2xl overflow-hidden">
          {venue.address && (
            <a 
              href={`https://maps.google.com/?q=${encodeURIComponent(venue.address)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 p-4 hover:bg-white/5 transition-colors"
            >
              <MapPin className="w-5 h-5 text-[#00D4AA]" />
              <span className="flex-1">{venue.address}</span>
              <Navigation className="w-4 h-4 text-gray-600" />
            </a>
          )}
          {venue.phone && (
            <a 
              href={`tel:${venue.phone}`}
              className="flex items-center gap-3 p-4 border-t border-[#262629] hover:bg-white/5 transition-colors"
            >
              <Phone className="w-5 h-5 text-[#7C3AED]" />
              <span>{venue.phone}</span>
            </a>
          )}
          {venue.website && (
            <a 
              href={venue.website}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 p-4 border-t border-[#262629] hover:bg-white/5 transition-colors"
            >
              <Globe className="w-5 h-5 text-[#FF3366]" />
              <span>{venue.website}</span>
            </a>
          )}
          {venue.instagram && (
            <a 
              href={`https://instagram.com/${venue.instagram.replace('@', '')}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 p-4 border-t border-[#262629] hover:bg-white/5 transition-colors"
            >
              <Instagram className="w-5 h-5 text-pink-500" />
              <span>{venue.instagram}</span>
            </a>
          )}
        </div>

        {/* Music & Amenities */}
        {(venue.music_genres?.length > 0 || venue.amenities?.length > 0) && (
          <div className="space-y-4">
            {venue.music_genres?.length > 0 && (
              <div>
                <h3 className="font-semibold mb-2">Music</h3>
                <div className="flex flex-wrap gap-2">
                  {venue.music_genres.map((genre, index) => (
                    <span key={index} className="px-3 py-1 rounded-full bg-[#7C3AED]/20 text-[#7C3AED] text-sm">
                      {genre}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {venue.amenities?.length > 0 && (
              <div>
                <h3 className="font-semibold mb-2">Amenities</h3>
                <div className="flex flex-wrap gap-2">
                  {venue.amenities.map((amenity, index) => (
                    <span key={index} className="px-3 py-1 rounded-full bg-[#141416] text-gray-400 text-sm">
                      {amenity}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tabs */}
        <Tabs defaultValue="events" className="w-full">
          <TabsList className="w-full bg-[#141416] p-1 rounded-xl">
            <TabsTrigger value="events" className="flex-1 rounded-lg data-[state=active]:bg-[#262629]">
              Events ({events.length})
            </TabsTrigger>
            <TabsTrigger value="jobs" className="flex-1 rounded-lg data-[state=active]:bg-[#262629]">
              Jobs ({jobs.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="events" className="mt-4">
            {events.length > 0 ? (
              <div className="space-y-4">
                {events.map((event, index) => (
                  <motion.div
                    key={event.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                  >
                    <Link 
                      to={createPageUrl(`EventDetails?id=${event.id}`)}
                      className="flex items-center gap-4 p-3 glass-card rounded-xl hover:bg-white/5 transition-colors"
                    >
                      <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-[#FF3366]/20 to-[#7C3AED]/20 flex-shrink-0 overflow-hidden">
                        {event.cover_image_url ? (
                          <img src={event.cover_image_url} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Calendar className="w-6 h-6 text-[#FF3366]" />
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-semibold">{event.title}</h4>
                        <div className="flex items-center gap-3 mt-1 text-sm text-gray-400">
                          <span>{getDateLabel(event.date)}</span>
                          {event.start_time && <span>• {event.start_time}</span>}
                        </div>
                      </div>
                      <ChevronRight className="w-5 h-5 text-gray-600" />
                    </Link>
                  </motion.div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <Calendar className="w-10 h-10 text-gray-600 mx-auto mb-2" />
                <p className="text-gray-500">No upcoming events</p>
              </div>
            )}
          </TabsContent>

          <TabsContent value="jobs" className="mt-4">
            {jobs.length > 0 ? (
              <div className="space-y-3">
                {jobs.map((job, index) => (
                  <motion.div
                    key={job.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                  >
                    <Link 
                      to={createPageUrl(`JobDetails?id=${job.id}`)}
                      className="flex items-center gap-4 p-3 glass-card rounded-xl hover:bg-white/5 transition-colors"
                    >
                      <div className="w-12 h-12 rounded-xl bg-[#FFD700]/20 flex items-center justify-center">
                        <Briefcase className="w-5 h-5 text-[#FFD700]" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-semibold">{job.title}</h4>
                        <div className="flex items-center gap-2 mt-1 text-sm">
                          <span className="text-gray-500 capitalize">{job.job_type?.replace('_', ' ')}</span>
                          {job.suggested_pay_amount && (
                            <span className="text-[#00D4AA]">R{job.suggested_pay_amount}</span>
                          )}
                        </div>
                      </div>
                      <ChevronRight className="w-5 h-5 text-gray-600" />
                    </Link>
                  </motion.div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <Briefcase className="w-10 h-10 text-gray-600 mx-auto mb-2" />
                <p className="text-gray-500">No open positions</p>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}