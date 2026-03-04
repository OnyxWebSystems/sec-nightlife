import React from 'react';
import { dataService } from '@/services/dataService';
import { useQuery } from '@tanstack/react-query';
import { Trophy, Star, Users, Briefcase } from 'lucide-react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import SecLogo from '@/components/ui/SecLogo';

export default function Leaderboard() {
  const { data: promoters = [], isLoading } = useQuery({
    queryKey: ['promoters-leaderboard'],
    queryFn: async () => {
      const users = await dataService.User.filter({ is_verified_promoter: true });
      return users
        .filter(u => u.promoter_rating_count > 0)
        .sort((a, b) => (b.promoter_avg_rating || 0) - (a.promoter_avg_rating || 0))
        .slice(0, 50);
    }
  });

  const getRankStyle = (index) => {
    if (index === 0) return { bg: 'var(--sec-accent)', color: 'var(--sec-bg-base)' };
    if (index === 1) return { bg: 'var(--sec-silver)', color: 'var(--sec-bg-base)' };
    if (index === 2) return { bg: 'var(--sec-accent-muted)', color: 'var(--sec-accent)', border: '1px solid var(--sec-accent)' };
    return { bg: 'var(--sec-bg-elevated)', color: 'var(--sec-text-muted)', border: '1px solid var(--sec-border)' };
  };

  if (isLoading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--sec-bg-base)' }}>
        <div className="sec-spinner" />
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--sec-bg-base)', padding: 'var(--space-6)' }}>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <SecLogo size={40} variant="full" />
            <Trophy size={24} strokeWidth={1.5} style={{ color: 'var(--sec-accent)' }} />
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 600, color: 'var(--sec-text-primary)', marginBottom: 8 }}>Promoter Leaderboard</h1>
          <p style={{ fontSize: 14, color: 'var(--sec-text-muted)' }}>Top-rated promoters on SEC</p>
        </div>

        {promoters.length >= 3 && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 32, alignItems: 'end' }}>
            <Link to={createPageUrl(`Profile?id=${promoters[1].id}`)} style={{ textDecoration: 'none' }}>
              <div className="sec-card" style={{ padding: 24, textAlign: 'center' }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--sec-silver)', marginBottom: 12 }}>2</div>
                <div style={{ width: 64, height: 64, borderRadius: '50%', overflow: 'hidden', margin: '0 auto 12px', border: '2px solid var(--sec-border)' }}>
                  {promoters[1].avatar_url ? (
                    <img src={promoters[1].avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <div style={{ width: '100%', height: '100%', backgroundColor: 'var(--sec-bg-elevated)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, fontWeight: 600, color: 'var(--sec-text-muted)' }}>
                      {promoters[1].username?.[0] || 'U'}
                    </div>
                  )}
                </div>
                <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--sec-text-primary)' }}>{promoters[1].username}</h3>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 8 }}>
                  <Star size={16} strokeWidth={1.5} fill="var(--sec-accent)" stroke="var(--sec-accent)" />
                  <span style={{ fontWeight: 600, color: 'var(--sec-text-primary)' }}>{promoters[1].promoter_avg_rating?.toFixed(1)}</span>
                </div>
                <p style={{ fontSize: 12, color: 'var(--sec-text-muted)', marginTop: 4 }}>{promoters[1].promoter_rating_count} ratings</p>
              </div>
            </Link>

            <Link to={createPageUrl(`Profile?id=${promoters[0].id}`)} style={{ textDecoration: 'none' }}>
              <div className="sec-card" style={{ padding: 24, textAlign: 'center', borderColor: 'var(--sec-accent-border)' }}>
                <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--sec-accent)', marginBottom: 12 }}>1</div>
                <div style={{ width: 80, height: 80, borderRadius: '50%', overflow: 'hidden', margin: '0 auto 12px', border: '2px solid var(--sec-accent)' }}>
                  {promoters[0].avatar_url ? (
                    <img src={promoters[0].avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <div style={{ width: '100%', height: '100%', backgroundColor: 'var(--sec-bg-elevated)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, fontWeight: 600, color: 'var(--sec-text-muted)' }}>
                      {promoters[0].username?.[0] || 'U'}
                    </div>
                  )}
                </div>
                <h3 style={{ fontSize: 17, fontWeight: 600, color: 'var(--sec-text-primary)' }}>{promoters[0].username}</h3>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 8 }}>
                  <Star size={18} strokeWidth={1.5} fill="var(--sec-accent)" stroke="var(--sec-accent)" />
                  <span style={{ fontWeight: 700, fontSize: 18, color: 'var(--sec-accent)' }}>{promoters[0].promoter_avg_rating?.toFixed(1)}</span>
                </div>
                <p style={{ fontSize: 12, color: 'var(--sec-text-muted)', marginTop: 4 }}>{promoters[0].promoter_rating_count} ratings</p>
              </div>
            </Link>

            <Link to={createPageUrl(`Profile?id=${promoters[2].id}`)} style={{ textDecoration: 'none' }}>
              <div className="sec-card" style={{ padding: 24, textAlign: 'center' }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--sec-text-muted)', marginBottom: 12 }}>3</div>
                <div style={{ width: 64, height: 64, borderRadius: '50%', overflow: 'hidden', margin: '0 auto 12px', border: '2px solid var(--sec-border)' }}>
                  {promoters[2].avatar_url ? (
                    <img src={promoters[2].avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <div style={{ width: '100%', height: '100%', backgroundColor: 'var(--sec-bg-elevated)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, fontWeight: 600, color: 'var(--sec-text-muted)' }}>
                      {promoters[2].username?.[0] || 'U'}
                    </div>
                  )}
                </div>
                <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--sec-text-primary)' }}>{promoters[2].username}</h3>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 8 }}>
                  <Star size={16} strokeWidth={1.5} fill="var(--sec-accent)" stroke="var(--sec-accent)" />
                  <span style={{ fontWeight: 600, color: 'var(--sec-text-primary)' }}>{promoters[2].promoter_avg_rating?.toFixed(1)}</span>
                </div>
                <p style={{ fontSize: 12, color: 'var(--sec-text-muted)', marginTop: 4 }}>{promoters[2].promoter_rating_count} ratings</p>
              </div>
            </Link>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {promoters.slice(3).map((promoter, index) => {
            const actualIndex = index + 3;
            const rankStyle = getRankStyle(actualIndex);
            return (
              <Link key={promoter.id} to={createPageUrl(`Profile?id=${promoter.id}`)} style={{ textDecoration: 'none' }}>
                <div className="sec-card" style={{ padding: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontWeight: 600, fontSize: 13, backgroundColor: rankStyle.bg, color: rankStyle.color, border: rankStyle.border
                    }}>
                      {actualIndex + 1}
                    </div>
                    <div style={{ width: 48, height: 48, borderRadius: '50%', overflow: 'hidden', border: '1px solid var(--sec-border)' }}>
                      {promoter.avatar_url ? (
                        <img src={promoter.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        <div style={{ width: '100%', height: '100%', backgroundColor: 'var(--sec-bg-elevated)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, color: 'var(--sec-text-muted)' }}>
                          {promoter.username?.[0] || 'U'}
                        </div>
                      )}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--sec-text-primary)' }}>{promoter.username}</h3>
                      <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'var(--sec-text-muted)', marginTop: 4 }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <Briefcase size={12} strokeWidth={1.5} />
                          {promoter.promoter_job_rating_count || 0} jobs
                        </span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <Users size={12} strokeWidth={1.5} />
                          {promoter.promoter_table_rating_count || 0} tables
                        </span>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
                        <Star size={16} strokeWidth={1.5} fill="var(--sec-accent)" stroke="var(--sec-accent)" />
                        <span style={{ fontWeight: 600, color: 'var(--sec-text-primary)' }}>{promoter.promoter_avg_rating?.toFixed(1)}</span>
                      </div>
                      <p style={{ fontSize: 12, color: 'var(--sec-text-muted)', marginTop: 2 }}>{promoter.promoter_rating_count} ratings</p>
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>

        {promoters.length === 0 && (
          <div style={{ textAlign: 'center', padding: '48px 24px' }}>
            <Trophy size={48} strokeWidth={1.5} style={{ color: 'var(--sec-text-muted)', margin: '0 auto 16px' }} />
            <p style={{ color: 'var(--sec-text-muted)' }}>No promoters rated yet</p>
          </div>
        )}
      </div>
    </div>
  );
}
