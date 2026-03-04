import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { dataService } from '@/services/dataService';
import { Button } from "@/components/ui/button";
import { Music, Save, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

const MUSIC_GENRES = [
  'House', 'Techno', 'Hip Hop', 'R&B', 'Afrobeats', 
  'Amapiano', 'Deep House', 'EDM', 'Trap', 'Jazz',
  'Reggae', 'Dancehall', 'Gqom', 'Kwaito', 'Pop'
];

export default function InterestsEditor({ userProfile }) {
  const queryClient = useQueryClient();
  const [selectedGenres, setSelectedGenres] = useState(userProfile?.music_preferences || []);

  const updateMutation = useMutation({
    mutationFn: async () => {
      await dataService.User.update(userProfile.id, {
        music_preferences: selectedGenres
      });
    },
    onSuccess: () => {
      toast.success('Interests updated successfully');
      queryClient.invalidateQueries(['user-profile']);
    },
    onError: () => {
      toast.error('Failed to update interests');
    }
  });

  const toggleGenre = (genre) => {
    setSelectedGenres(prev => 
      prev.includes(genre) 
        ? prev.filter(g => g !== genre)
        : [...prev, genre]
    );
  };

  const hasChanges = JSON.stringify(selectedGenres.sort()) !== 
                     JSON.stringify((userProfile?.music_preferences || []).sort());

  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-semibold mb-3 flex items-center gap-2 text-white">
          <Music className="w-4 h-4 text-[#7C3AED]" />
          Music Preferences
        </h3>
        <p className="text-sm text-gray-500 mb-4">
          Select your favorite music genres to get personalized event recommendations
        </p>
        <div className="flex flex-wrap gap-2">
          {MUSIC_GENRES.map(genre => (
            <button
              key={genre}
              onClick={() => toggleGenre(genre)}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
                selectedGenres.includes(genre)
                  ? 'bg-gradient-to-r from-[#FF3366] to-[#7C3AED] text-white'
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
          onClick={() => updateMutation.mutate()}
          disabled={updateMutation.isPending}
          className="w-full bg-gradient-to-r from-[#FF3366] to-[#7C3AED]"
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