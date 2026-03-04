import React, { useState, useEffect } from 'react';
import * as authService from '@/services/authService';
import { dataService } from '@/services/dataService';
import { invokeFunction } from '@/services/integrationService';
import { useQuery } from '@tanstack/react-query';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Brain, TrendingUp, TrendingDown, Star, Loader2, Users } from 'lucide-react';
import { toast } from 'sonner';

export default function FeedbackInsights() {
  const [user, setUser] = useState(null);
  const [selectedVenue, setSelectedVenue] = useState('');
  const [insights, setInsights] = useState(null);
  const [stats, setStats] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

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

  const handleAnalyze = async () => {
    if (!selectedVenue) {
      toast.error('Please select a venue');
      return;
    }

    setIsAnalyzing(true);
    try {
      const { data } = await invokeFunction('analyzeFeedback', {
        venue_id: selectedVenue
      });

      if (data.success) {
        setInsights(data.insights);
        setStats(data.stats);
        toast.success('Analysis complete!');
      } else {
        toast.info(data.message || 'No reviews available yet');
      }
    } catch (error) {
      toast.error('Failed to analyze feedback');
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0A0B] p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold gradient-text">Feedback Insights</h1>
            <p className="text-gray-500 mt-1">AI-powered analysis of customer reviews</p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#FF3366] to-[#7C3AED] flex items-center justify-center">
            <Brain className="w-6 h-6 text-white" />
          </div>
        </div>

        {/* Venue Selector */}
        <Card className="glass-card border-[#262629]">
          <CardHeader>
            <CardTitle className="text-white">Select Venue to Analyze</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
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

            <Button
              onClick={handleAnalyze}
              disabled={isAnalyzing || !selectedVenue}
              className="w-full bg-gradient-to-r from-[#FF3366] to-[#7C3AED]"
            >
              {isAnalyzing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Brain className="w-4 h-4 mr-2" />}
              Analyze Feedback
            </Button>
          </CardContent>
        </Card>

        {/* Stats Overview */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="glass-card border-[#262629]">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-gray-500 text-sm">Total Reviews</p>
                    <p className="text-3xl font-bold text-white mt-1">{stats.total_reviews}</p>
                  </div>
                  <Users className="w-8 h-8 text-[#00D4AA]" />
                </div>
              </CardContent>
            </Card>

            <Card className="glass-card border-[#262629]">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-gray-500 text-sm">Average Rating</p>
                    <p className="text-3xl font-bold text-white mt-1">{stats.average_rating.toFixed(1)}</p>
                  </div>
                  <Star className="w-8 h-8 text-[#FFD700]" />
                </div>
              </CardContent>
            </Card>

            <Card className="glass-card border-[#262629]">
              <CardContent className="pt-6">
                <p className="text-gray-500 text-sm mb-2">Rating Distribution</p>
                <div className="space-y-1">
                  {[5, 4, 3, 2, 1].map((rating) => (
                    <div key={rating} className="flex items-center gap-2">
                      <span className="text-xs text-gray-500 w-4">{rating}★</span>
                      <div className="flex-1 h-2 bg-[#141416] rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-gradient-to-r from-[#FF3366] to-[#7C3AED]"
                          style={{ width: `${(stats.rating_breakdown[rating] / stats.total_reviews) * 100}%` }}
                        />
                      </div>
                      <span className="text-xs text-gray-500 w-8">{stats.rating_breakdown[rating]}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* AI Insights */}
        {insights && (
          <>
            {/* Sentiment Summary */}
            <Card className="glass-card border-[#262629]">
              <CardHeader>
                <CardTitle className="text-white">Overall Sentiment</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-300 leading-relaxed">{insights.sentiment_summary}</p>
              </CardContent>
            </Card>

            {/* Positive Themes */}
            <Card className="glass-card border-[#262629]">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-[#00D4AA]" />
                  What Customers Love
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {insights.positive_themes.map((theme, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-[#00D4AA] mt-2" />
                      <span className="text-gray-300">{theme}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            {/* Negative Themes */}
            {insights.negative_themes.length > 0 && (
              <Card className="glass-card border-[#262629]">
                <CardHeader>
                  <CardTitle className="text-white flex items-center gap-2">
                    <TrendingDown className="w-5 h-5 text-[#FF3366]" />
                    Areas for Improvement
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {insights.negative_themes.map((theme, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-[#FF3366] mt-2" />
                        <span className="text-gray-300">{theme}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}

            {/* Recommendations */}
            <Card className="glass-card border-[#262629]">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Brain className="w-5 h-5 text-[#7C3AED]" />
                  AI Recommendations
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3">
                  {insights.recommendations.map((rec, idx) => (
                    <li key={idx} className="p-3 rounded-lg bg-[#141416] border border-[#262629]">
                      <div className="flex items-start gap-3">
                        <div className="w-6 h-6 rounded-full bg-gradient-to-br from-[#FF3366] to-[#7C3AED] flex items-center justify-center flex-shrink-0 text-xs font-bold">
                          {idx + 1}
                        </div>
                        <span className="text-gray-300">{rec}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}