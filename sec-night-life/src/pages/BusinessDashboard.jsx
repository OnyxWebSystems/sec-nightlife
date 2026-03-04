import React, { useState, useEffect } from 'react';
import * as authService from '@/services/authService';
import { dataService } from '@/services/dataService';
import { invokeFunction } from '@/services/integrationService';
import { useQuery } from '@tanstack/react-query';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sparkles, TrendingUp, Users, Copy, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function BusinessDashboard() {
  const [user, setUser] = useState(null);
  const [selectedVenue, setSelectedVenue] = useState('');
  const [generatedDescription, setGeneratedDescription] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [promotions, setPromotions] = useState([]);
  const [isGeneratingPromo, setIsGeneratingPromo] = useState(false);

  const [descriptionForm, setDescriptionForm] = useState({
    keywords: '',
    venue_type: 'nightclub',
    atmosphere: ''
  });

  const [promoForm, setPromoForm] = useState({
    event_type: 'nightclub',
    target_audience: 'young professionals',
    season: 'summer',
    budget_level: 'medium'
  });

  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    try {
      const currentUser = await authService.getCurrentUser();
      setUser(currentUser);
    } catch (e) {
      authService.redirectToLogin();
    }
  };

  const { data: venues = [] } = useQuery({
    queryKey: ['my-venues'],
    queryFn: () => dataService.Venue.filter({ owner_user_id: user?.id }),
    enabled: !!user
  });

  const handleGenerateDescription = async () => {
    if (!descriptionForm.keywords) {
      toast.error('Please enter some keywords');
      return;
    }

    setIsGenerating(true);
    try {
      const { data } = await invokeFunction('generateVenueDescription', {
        ...descriptionForm,
        amenities: [],
        music_genres: []
      });

      if (data.success) {
        setGeneratedDescription(data.description);
        toast.success('Description generated!');
      }
    } catch (error) {
      toast.error('Failed to generate description');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGeneratePromotions = async () => {
    setIsGeneratingPromo(true);
    try {
      const { data } = await invokeFunction('generatePromotion', promoForm);

      if (data.success) {
        setPromotions(data.promotions);
        toast.success('Promotions generated!');
      }
    } catch (error) {
      toast.error('Failed to generate promotions');
    } finally {
      setIsGeneratingPromo(false);
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard!');
  };

  return (
    <div className="min-h-screen bg-[#0A0A0B] p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold gradient-text">Business AI Tools</h1>
            <p className="text-gray-500 mt-1">AI-powered content and promotion generation</p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#FF3366] to-[#7C3AED] flex items-center justify-center">
            <Sparkles className="w-6 h-6 text-white" />
          </div>
        </div>

        {/* Venue Selector */}
        {venues.length > 0 && (
          <Card className="glass-card border-[#262629]">
            <CardHeader>
              <CardTitle className="text-white">Select Venue</CardTitle>
            </CardHeader>
            <CardContent>
              <Select value={selectedVenue} onValueChange={setSelectedVenue}>
                <SelectTrigger className="bg-[#141416] border-[#262629]">
                  <SelectValue placeholder="Choose a venue" />
                </SelectTrigger>
                <SelectContent className="bg-[#141416] border-[#262629] text-white">
                  {venues.map((venue) => (
                    <SelectItem key={venue.id} value={venue.id}>{venue.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>
        )}

        {/* Description Generator */}
        <Card className="glass-card border-[#262629]">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-[#FF3366]" />
              AI Description Generator
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="text-gray-400">Keywords</Label>
              <Input
                placeholder="e.g., upscale, modern, rooftop, cocktails"
                value={descriptionForm.keywords}
                onChange={(e) => setDescriptionForm(prev => ({ ...prev, keywords: e.target.value }))}
                className="mt-2 bg-[#141416] border-[#262629]"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-gray-400">Venue Type</Label>
                <Select value={descriptionForm.venue_type} onValueChange={(value) => setDescriptionForm(prev => ({ ...prev, venue_type: value }))}>
                  <SelectTrigger className="mt-2 bg-[#141416] border-[#262629]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#141416] border-[#262629] text-white">
                    <SelectItem value="nightclub">Nightclub</SelectItem>
                    <SelectItem value="lounge">Lounge</SelectItem>
                    <SelectItem value="bar">Bar</SelectItem>
                    <SelectItem value="rooftop">Rooftop</SelectItem>
                    <SelectItem value="beach_club">Beach Club</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-gray-400">Atmosphere</Label>
                <Input
                  placeholder="e.g., vibrant, intimate, upscale"
                  value={descriptionForm.atmosphere}
                  onChange={(e) => setDescriptionForm(prev => ({ ...prev, atmosphere: e.target.value }))}
                  className="mt-2 bg-[#141416] border-[#262629]"
                />
              </div>
            </div>

            <Button
              onClick={handleGenerateDescription}
              disabled={isGenerating}
              className="w-full bg-gradient-to-r from-[#FF3366] to-[#7C3AED]"
            >
              {isGenerating ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Sparkles className="w-4 h-4 mr-2" />}
              Generate Description
            </Button>

            {generatedDescription && (
              <div className="mt-4 p-4 rounded-xl bg-[#141416] border border-[#262629]">
                <div className="flex items-start justify-between gap-4">
                  <p className="text-gray-300 text-sm leading-relaxed">{generatedDescription}</p>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => copyToClipboard(generatedDescription)}
                    className="flex-shrink-0"
                  >
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Promotion Generator */}
        <Card className="glass-card border-[#262629]">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-[#00D4AA]" />
              AI Promotion Suggestions
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-gray-400">Event Type</Label>
                <Select value={promoForm.event_type} onValueChange={(value) => setPromoForm(prev => ({ ...prev, event_type: value }))}>
                  <SelectTrigger className="mt-2 bg-[#141416] border-[#262629]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#141416] border-[#262629] text-white">
                    <SelectItem value="nightclub">Nightclub Event</SelectItem>
                    <SelectItem value="concert">Concert</SelectItem>
                    <SelectItem value="festival">Festival</SelectItem>
                    <SelectItem value="special_occasion">Special Occasion</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-gray-400">Target Audience</Label>
                <Select value={promoForm.target_audience} onValueChange={(value) => setPromoForm(prev => ({ ...prev, target_audience: value }))}>
                  <SelectTrigger className="mt-2 bg-[#141416] border-[#262629]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#141416] border-[#262629] text-white">
                    <SelectItem value="young professionals">Young Professionals</SelectItem>
                    <SelectItem value="students">Students</SelectItem>
                    <SelectItem value="couples">Couples</SelectItem>
                    <SelectItem value="groups">Groups</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-gray-400">Season</Label>
                <Select value={promoForm.season} onValueChange={(value) => setPromoForm(prev => ({ ...prev, season: value }))}>
                  <SelectTrigger className="mt-2 bg-[#141416] border-[#262629]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#141416] border-[#262629] text-white">
                    <SelectItem value="summer">Summer</SelectItem>
                    <SelectItem value="winter">Winter</SelectItem>
                    <SelectItem value="spring">Spring</SelectItem>
                    <SelectItem value="fall">Fall</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-gray-400">Budget Level</Label>
                <Select value={promoForm.budget_level} onValueChange={(value) => setPromoForm(prev => ({ ...prev, budget_level: value }))}>
                  <SelectTrigger className="mt-2 bg-[#141416] border-[#262629]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#141416] border-[#262629] text-white">
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
              className="w-full bg-gradient-to-r from-[#00D4AA] to-[#00D4AA]/80"
            >
              {isGeneratingPromo ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <TrendingUp className="w-4 h-4 mr-2" />}
              Generate Promotion Ideas
            </Button>

            {promotions.length > 0 && (
              <div className="mt-4 space-y-3">
                {promotions.map((promo, idx) => (
                  <div key={idx} className="p-4 rounded-xl bg-[#141416] border border-[#262629]">
                    <h4 className="font-semibold text-white mb-2">{promo.title}</h4>
                    <p className="text-sm text-gray-400 mb-2">{promo.description}</p>
                    <div className="flex gap-2 text-xs">
                      <span className="px-2 py-1 rounded-full bg-[#FF3366]/20 text-[#FF3366]">{promo.target}</span>
                      <span className="px-2 py-1 rounded-full bg-[#00D4AA]/20 text-[#00D4AA]">{promo.impact}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}