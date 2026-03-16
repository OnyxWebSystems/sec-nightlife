import React, { useState, useEffect } from 'react';
import * as authService from '@/services/authService';
import { dataService } from '@/services/dataService';
import { useQuery } from '@tanstack/react-query';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sparkles, TrendingUp, Copy, Loader2, Megaphone, Tag, Clock, Star } from 'lucide-react';
import { toast } from 'sonner';

const PROMO_TEMPLATES = [
  { type: 'happy_hour', label: 'Happy Hour', icon: Clock, desc: '2-for-1 drinks or discounted prices during off-peak hours' },
  { type: 'ladies_night', label: 'Ladies Night', icon: Star, desc: 'Free entry or drink specials for women' },
  { type: 'vip_package', label: 'VIP Package', icon: Tag, desc: 'Premium table + bottle service bundles' },
  { type: 'event_promo', label: 'Event Promotion', icon: Megaphone, desc: 'Promote upcoming events with early-bird pricing' },
];

function generateDescription(keywords, venueType, atmosphere) {
  const adjectives = ['vibrant', 'exclusive', 'electrifying', 'sophisticated', 'unforgettable'];
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const kw = keywords.split(',').map(k => k.trim()).filter(Boolean);
  const kwText = kw.length > 0 ? kw.join(', ') : 'great music and an amazing atmosphere';

  const templates = [
    `Step into the ${adj} world of ${venueType === 'nightclub' ? 'nightlife' : venueType} at its finest. Known for ${kwText}, this ${atmosphere || 'stunning'} venue delivers an experience like no other. Whether you're looking for a night out with friends or a VIP celebration, every visit promises memories that last.`,
    `Welcome to a ${atmosphere || 'remarkable'} destination where ${kwText} come together to create the ultimate ${venueType} experience. From the moment you walk in, you'll be immersed in an ${adj} atmosphere designed to elevate your night. Premium drinks, world-class entertainment, and impeccable service await.`,
    `Discover the heartbeat of the city's ${venueType} scene. Featuring ${kwText}, this ${adj} venue sets the standard for nightlife excellence. With a ${atmosphere || 'captivating'} ambiance and a commitment to delivering extraordinary experiences, every night here is one for the books.`,
  ];
  return templates[Math.floor(Math.random() * templates.length)];
}

function generatePromotions(eventType, audience, season, budget) {
  const promos = [
    {
      title: `${season.charAt(0).toUpperCase() + season.slice(1)} Launch Party`,
      description: `Kick off the ${season} season with an exclusive launch event. ${budget === 'high' ? 'Premium open bar and VIP lounge access included.' : 'Early bird tickets at 50% off.'}`,
      target: audience, impact: budget === 'high' ? 'High Impact' : 'Medium Impact',
    },
    {
      title: 'Social Media Challenge',
      description: `Run a TikTok/Instagram challenge targeting ${audience}. Best video wins free VIP entry for a group of 6. ${budget === 'low' ? 'Zero cost, maximum reach.' : 'Boost with paid promotion for wider reach.'}`,
      target: audience, impact: 'High Engagement',
    },
    {
      title: `${eventType === 'nightclub' ? 'Friday Frenzy' : eventType === 'concert' ? 'Encore Nights' : 'Weekend Special'}`,
      description: `Create a recurring ${eventType} night brand. Consistent theme, DJ lineup, and pricing. Build loyalty with a stamp card — 5 visits = free entry.`,
      target: audience, impact: 'Long-term Growth',
    },
    {
      title: 'Refer a Friend',
      description: `Each guest gets a unique code. When 3 friends use it, the referrer gets free entry + a complimentary drink. ${budget !== 'low' ? 'Add a monthly leaderboard with prizes for top referrers.' : ''}`,
      target: 'All audiences', impact: 'Viral Potential',
    },
  ];
  return promos;
}

export default function BusinessPromotions() {
  const [user, setUser] = useState(null);
  const [selectedVenue, setSelectedVenue] = useState('');
  const [generatedDescription, setGeneratedDescription] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [promotions, setPromotions] = useState([]);
  const [isGeneratingPromo, setIsGeneratingPromo] = useState(false);
  const [activePromoType, setActivePromoType] = useState(null);

  const [descForm, setDescForm] = useState({ keywords: '', venue_type: 'nightclub', atmosphere: '' });
  const [promoForm, setPromoForm] = useState({ event_type: 'nightclub', target_audience: 'young professionals', season: 'summer', budget_level: 'medium' });

  const sty = {
    input: { backgroundColor: 'var(--sec-bg-elevated)', borderColor: 'var(--sec-border)' },
    select: { backgroundColor: 'var(--sec-bg-elevated)', borderColor: 'var(--sec-border)' },
    dropdown: { backgroundColor: 'var(--sec-bg-card)', borderColor: 'var(--sec-border)' },
  };

  useEffect(() => {
    (async () => {
      try { setUser(await authService.getCurrentUser()); }
      catch { authService.redirectToLogin(); }
    })();
  }, []);

  const { data: venues = [] } = useQuery({
    queryKey: ['biz-venues', user?.id],
    queryFn: () => dataService.Venue.filter({ owner_user_id: user.id }),
    enabled: !!user,
  });

  const handleGenerateDescription = async () => {
    if (!descForm.keywords) { toast.error('Enter some keywords'); return; }
    setIsGenerating(true);
    await new Promise(r => setTimeout(r, 1200));
    setGeneratedDescription(generateDescription(descForm.keywords, descForm.venue_type, descForm.atmosphere));
    setIsGenerating(false);
    toast.success('Description generated!');
  };

  const handleGeneratePromotions = async () => {
    setIsGeneratingPromo(true);
    await new Promise(r => setTimeout(r, 1000));
    setPromotions(generatePromotions(promoForm.event_type, promoForm.target_audience, promoForm.season, promoForm.budget_level));
    setIsGeneratingPromo(false);
    toast.success('Promotions generated!');
  };

  const copy = (text) => { navigator.clipboard.writeText(text); toast.success('Copied!'); };

  if (!user) return null;

  return (
    <div style={{ padding: '24px 20px', maxWidth: 800, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700 }}>Promotions & AI Tools</h1>
        <p style={{ fontSize: 13, color: 'var(--sec-text-muted)' }}>Generate content and manage your venue promotions</p>
      </div>

      {/* Venue Selector */}
      {venues.length > 0 && (
        <div style={{
          padding: 16, borderRadius: 14, marginBottom: 20,
          backgroundColor: 'var(--sec-bg-card)', border: '1px solid var(--sec-border)',
        }}>
          <Label className="text-gray-400 text-sm">Select Venue</Label>
          <Select value={selectedVenue} onValueChange={setSelectedVenue}>
            <SelectTrigger className="mt-1.5 h-10 rounded-xl" style={sty.select}>
              <SelectValue placeholder="Choose a venue" />
            </SelectTrigger>
            <SelectContent style={sty.dropdown} className="text-white">
              {venues.map(v => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Promotion Templates */}
      <div style={{ marginBottom: 24 }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>Promotion Templates</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
          {PROMO_TEMPLATES.map(t => (
            <button
              key={t.type}
              onClick={() => setActivePromoType(activePromoType === t.type ? null : t.type)}
              style={{
                padding: 14, borderRadius: 12, textAlign: 'left', cursor: 'pointer',
                backgroundColor: activePromoType === t.type ? 'var(--sec-accent-muted)' : 'var(--sec-bg-card)',
                border: `1px solid ${activePromoType === t.type ? 'var(--sec-accent-border)' : 'var(--sec-border)'}`,
                transition: 'all 0.15s',
              }}
            >
              <t.icon size={18} style={{ color: 'var(--sec-accent)', marginBottom: 6 }} />
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--sec-text-primary)' }}>{t.label}</div>
              <div style={{ fontSize: 11, color: 'var(--sec-text-muted)', marginTop: 2, lineHeight: 1.4 }}>{t.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* AI Description Generator */}
      <div style={{
        padding: 20, borderRadius: 14, marginBottom: 16,
        backgroundColor: 'var(--sec-bg-card)', border: '1px solid var(--sec-border)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <Sparkles size={18} style={{ color: 'var(--sec-accent)' }} />
          <h3 style={{ fontSize: 15, fontWeight: 600 }}>AI Description Generator</h3>
        </div>
        <div className="space-y-3">
          <div>
            <Label className="text-gray-400 text-sm">Keywords</Label>
            <Input
              placeholder="upscale, modern, rooftop, cocktails"
              value={descForm.keywords}
              onChange={e => setDescForm(p => ({ ...p, keywords: e.target.value }))}
              className="mt-1.5 h-10 rounded-xl" style={sty.input}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-gray-400 text-sm">Venue Type</Label>
              <Select value={descForm.venue_type} onValueChange={v => setDescForm(p => ({ ...p, venue_type: v }))}>
                <SelectTrigger className="mt-1.5 h-10 rounded-xl" style={sty.select}><SelectValue /></SelectTrigger>
                <SelectContent style={sty.dropdown} className="text-white">
                  <SelectItem value="nightclub">Nightclub</SelectItem>
                  <SelectItem value="lounge">Lounge</SelectItem>
                  <SelectItem value="bar">Bar</SelectItem>
                  <SelectItem value="rooftop">Rooftop</SelectItem>
                  <SelectItem value="beach_club">Beach Club</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-gray-400 text-sm">Atmosphere</Label>
              <Input
                placeholder="vibrant, intimate, upscale"
                value={descForm.atmosphere}
                onChange={e => setDescForm(p => ({ ...p, atmosphere: e.target.value }))}
                className="mt-1.5 h-10 rounded-xl" style={sty.input}
              />
            </div>
          </div>
          <Button
            onClick={handleGenerateDescription}
            disabled={isGenerating}
            className="w-full h-10 rounded-xl font-semibold"
            style={{ backgroundColor: 'var(--sec-accent)', color: '#000' }}
          >
            {isGenerating ? <Loader2 size={15} className="animate-spin mr-1.5" /> : <Sparkles size={15} className="mr-1.5" />}
            Generate Description
          </Button>
          {generatedDescription && (
            <div style={{ padding: 14, borderRadius: 10, backgroundColor: 'var(--sec-bg-base)', border: '1px solid var(--sec-border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <p style={{ fontSize: 13, color: 'var(--sec-text-secondary)', lineHeight: 1.6 }}>{generatedDescription}</p>
                <button onClick={() => copy(generatedDescription)} style={{ padding: 6, border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--sec-text-muted)', flexShrink: 0 }}>
                  <Copy size={15} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* AI Promotion Suggestions */}
      <div style={{
        padding: 20, borderRadius: 14,
        backgroundColor: 'var(--sec-bg-card)', border: '1px solid var(--sec-border)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <TrendingUp size={18} style={{ color: 'var(--sec-accent)' }} />
          <h3 style={{ fontSize: 15, fontWeight: 600 }}>AI Promotion Ideas</h3>
        </div>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-gray-400 text-sm">Event Type</Label>
              <Select value={promoForm.event_type} onValueChange={v => setPromoForm(p => ({ ...p, event_type: v }))}>
                <SelectTrigger className="mt-1.5 h-10 rounded-xl" style={sty.select}><SelectValue /></SelectTrigger>
                <SelectContent style={sty.dropdown} className="text-white">
                  <SelectItem value="nightclub">Nightclub Event</SelectItem>
                  <SelectItem value="concert">Concert</SelectItem>
                  <SelectItem value="festival">Festival</SelectItem>
                  <SelectItem value="special_occasion">Special Occasion</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-gray-400 text-sm">Target Audience</Label>
              <Select value={promoForm.target_audience} onValueChange={v => setPromoForm(p => ({ ...p, target_audience: v }))}>
                <SelectTrigger className="mt-1.5 h-10 rounded-xl" style={sty.select}><SelectValue /></SelectTrigger>
                <SelectContent style={sty.dropdown} className="text-white">
                  <SelectItem value="young professionals">Young Professionals</SelectItem>
                  <SelectItem value="students">Students</SelectItem>
                  <SelectItem value="couples">Couples</SelectItem>
                  <SelectItem value="groups">Groups</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-gray-400 text-sm">Season</Label>
              <Select value={promoForm.season} onValueChange={v => setPromoForm(p => ({ ...p, season: v }))}>
                <SelectTrigger className="mt-1.5 h-10 rounded-xl" style={sty.select}><SelectValue /></SelectTrigger>
                <SelectContent style={sty.dropdown} className="text-white">
                  <SelectItem value="summer">Summer</SelectItem>
                  <SelectItem value="winter">Winter</SelectItem>
                  <SelectItem value="spring">Spring</SelectItem>
                  <SelectItem value="fall">Fall</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-gray-400 text-sm">Budget Level</Label>
              <Select value={promoForm.budget_level} onValueChange={v => setPromoForm(p => ({ ...p, budget_level: v }))}>
                <SelectTrigger className="mt-1.5 h-10 rounded-xl" style={sty.select}><SelectValue /></SelectTrigger>
                <SelectContent style={sty.dropdown} className="text-white">
                  <SelectItem value="low">Low Budget</SelectItem>
                  <SelectItem value="medium">Medium Budget</SelectItem>
                  <SelectItem value="high">High Budget</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button
            onClick={handleGeneratePromotions}
            disabled={isGeneratingPromo}
            className="w-full h-10 rounded-xl font-semibold"
            style={{ backgroundColor: 'var(--sec-accent)', color: '#000' }}
          >
            {isGeneratingPromo ? <Loader2 size={15} className="animate-spin mr-1.5" /> : <TrendingUp size={15} className="mr-1.5" />}
            Generate Promotion Ideas
          </Button>
          {promotions.length > 0 && (
            <div className="space-y-2 mt-3">
              {promotions.map((p, i) => (
                <div key={i} style={{ padding: 14, borderRadius: 10, backgroundColor: 'var(--sec-bg-elevated)', border: '1px solid var(--sec-border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 8 }}>
                    <div>
                      <h4 style={{ fontSize: 14, fontWeight: 600, color: 'var(--sec-text-primary)', marginBottom: 4 }}>{p.title}</h4>
                      <p style={{ fontSize: 12, color: 'var(--sec-text-muted)', lineHeight: 1.5 }}>{p.description}</p>
                    </div>
                    <button onClick={() => copy(`${p.title}\n${p.description}`)} style={{ padding: 6, border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--sec-text-muted)', flexShrink: 0 }}>
                      <Copy size={14} />
                    </button>
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                    <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, backgroundColor: 'var(--sec-accent-muted)', color: 'var(--sec-accent)' }}>{p.target}</span>
                    <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, backgroundColor: 'var(--sec-silver-muted)', color: 'var(--sec-silver-bright)' }}>{p.impact}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
