import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { dataService } from '@/services/dataService';

export default function PromoterCodeOfConduct() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: doc, isLoading: loadingDoc } = useQuery({
    queryKey: ['legal', 'promoter-code'],
    queryFn: () => dataService.Legal.promoterCodeOfConduct(),
  });

  const { data: status } = useQuery({
    queryKey: ['legal', 'acceptance-status'],
    queryFn: () => dataService.Legal.acceptanceStatus(),
  });

  const accepted = status?.latest?.PROMOTER_CODE_OF_CONDUCT;

  const acceptMutation = useMutation({
    mutationFn: async () => {
      return dataService.Legal.acceptDocument({
        document_key: 'promoter_code_of_conduct',
        version: doc?.version || '1.0',
      });
    },
    onSuccess: () => {
      toast.success('Code of Conduct accepted');
      queryClient.invalidateQueries({ queryKey: ['legal', 'acceptance-status'] });
      queryClient.invalidateQueries({ queryKey: ['promoters-leaderboard'] });
    },
    onError: (e) => toast.error(e?.message || 'Could not save acceptance'),
  });

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--sec-bg-base)', color: 'var(--sec-text-primary)' }}>
      <header className="sticky top-0 z-40 border-b" style={{ backgroundColor: 'var(--sec-bg-elevated)', borderColor: 'var(--sec-border)' }}>
        <div className="px-4 py-4 flex items-center gap-4">
          <button onClick={() => navigate(-1)} className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: 'var(--sec-bg-card)' }}>
            <ChevronLeft className="w-5 h-5" style={{ color: 'var(--sec-text-primary)' }} />
          </button>
          <div>
            <h1 className="text-xl font-bold">Promoter Code of Conduct</h1>
            {doc?.version && (
              <p className="text-xs" style={{ color: 'var(--sec-text-muted)' }}>
                Version {doc.version} · Effective {doc.effectiveDate}
              </p>
            )}
          </div>
        </div>
      </header>

      <div className="px-4 py-6 max-w-xl mx-auto space-y-4">
        <div className="rounded-2xl p-6 space-y-4" style={{ backgroundColor: 'var(--sec-bg-card)', border: '1px solid var(--sec-border)' }}>
          <p style={{ color: 'var(--sec-text-secondary)', lineHeight: 1.6 }}>
            This policy sets the standards expected of promoters on SEC. Accepting it is required to be eligible for promoter features (including leaderboard visibility).
          </p>

          {loadingDoc ? (
            <p style={{ color: 'var(--sec-text-muted)' }}>Loading...</p>
          ) : (
            (doc?.content || []).map((section) => (
              <div key={section.heading}>
                <h2 className="font-semibold mb-1">{section.heading}</h2>
                <p style={{ color: 'var(--sec-text-secondary)', lineHeight: 1.6 }}>{section.body}</p>
              </div>
            ))
          )}

          <div className="pt-2">
            {accepted ? (
              <p style={{ color: 'var(--sec-accent)', fontSize: 13 }}>
                Accepted version {accepted.version} on {new Date(accepted.acceptedAt).toLocaleDateString()}.
              </p>
            ) : (
              <button
                onClick={() => acceptMutation.mutate()}
                disabled={acceptMutation.isPending || loadingDoc}
                className="sec-btn-accent px-4 py-2 rounded-lg"
              >
                {acceptMutation.isPending ? 'Saving...' : 'Accept Code of Conduct'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

