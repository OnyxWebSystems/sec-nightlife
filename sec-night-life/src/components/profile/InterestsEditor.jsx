import React, { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiPatch } from '@/api/client';
import { Button } from "@/components/ui/button";
import { Music, Save, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

const MUSIC_GENRES = [
  'House', 'Techno', 'Hip Hop', 'R&B', 'Afrobeats',
  'Amapiano', 'Deep House', 'EDM', 'Trap', 'Jazz',
  'Reggae', 'Dancehall', 'Gqom', 'Kwaito', 'Pop'
];

function baselineSelection(profile) {
  const fromInterests = profile?.interests;
  if (Array.isArray(fromInterests) && fromInterests.length > 0) return [...fromInterests];
  const fromMusic = profile?.music_preferences;
  if (Array.isArray(fromMusic) && fromMusic.length > 0) return [...fromMusic];
  return [];
}

export default function InterestsEditor({ userProfile, onProfileUpdated }) {
  const queryClient = useQueryClient();
  const [selectedGenres, setSelectedGenres] = useState(() => baselineSelection(userProfile));

  useEffect(() => {
    setSelectedGenres(baselineSelection(userProfile));
  }, [userProfile?.interests, userProfile?.music_preferences, userProfile?.id]);

  const sortedStr = (arr) => JSON.stringify([...arr].sort());

  const updateMutation = useMutation({
    mutationFn: async () => {
      return apiPatch('/api/users/profile', {
        interests: selectedGenres,
        music_preferences: selectedGenres,
      });
    },
    onSuccess: (data) => {
      toast.success('Interests updated successfully');
      if (data && typeof onProfileUpdated === 'function') {
        onProfileUpdated(data);
      }
      queryClient.invalidateQueries({ queryKey: ['viewed-profile'] });
    },
    onError: () => {
      toast.error('Failed to update interests');
    }
  });

  const toggleGenre = (genre) => {
    setSelectedGenres((prev) => {
      if (prev.includes(genre)) return prev.filter((g) => g !== genre);
      if (prev.length >= 10) {
        toast.error('You can select up to 10 interests');
        return prev;
      }
      return [...prev, genre];
    });
  };

  const baseline = baselineSelection(userProfile);
  const hasChanges = sortedStr(selectedGenres) !== sortedStr(baseline);

  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-semibold mb-3 flex items-center gap-2 text-white">
          <Music className="w-4 h-4" style={{ color: 'var(--sec-accent)' }} />
          Music Preferences
        </h3>
        <p className="text-sm text-gray-500 mb-4">
          Select up to 10 genres — they appear on your profile and when others view you.
        </p>
        <div className="flex flex-wrap gap-2">
          {MUSIC_GENRES.map((genre) => (
            <button
              key={genre}
              type="button"
              onClick={() => toggleGenre(genre)}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
                selectedGenres.includes(genre)
                  ? 'sec-btn-accent'
                  : 'bg-[#141416] text-gray-400 hover:text-white'
              }`}
            >
              {genre}
            </button>
          ))}
        </div>
      </div>

      {hasChanges && (
        <Button
          type="button"
          onClick={() => updateMutation.mutate()}
          disabled={updateMutation.isPending}
          className="w-full sec-btn-accent"
        >
          {updateMutation.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
          ) : (
            <Save className="w-4 h-4 mr-2" />
          )}
          Save Changes
        </Button>
      )}
    </div>
  );
}
