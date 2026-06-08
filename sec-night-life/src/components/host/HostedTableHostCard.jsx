import React from 'react';
import { Link } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import { MessageCircle, Copy, UserPlus, Camera, Sparkles } from 'lucide-react';
import { createPageUrl } from '@/utils';
import { Input } from '@/components/ui/input';

const TABLE_HOST_STATUS_BADGE = {
  DRAFT: { label: 'Awaiting listing payment', bg: 'var(--sec-warning-muted)', color: 'var(--sec-text-primary)' },
  ACTIVE: { label: 'Live', bg: 'var(--sec-success-muted)', color: 'var(--sec-text-primary)' },
  FULL: { label: 'Full', bg: 'var(--sec-bg-hover)', color: 'var(--sec-text-muted)' },
  CLOSED: { label: 'Closed', bg: 'var(--sec-bg-hover)', color: 'var(--sec-text-muted)' },
};

/**
 * Host-facing hosted table card for My tables tab.
 */
export default function HostedTableHostCard({
  table: t,
  hostStatusBadge,
  loc,
  manageTableId,
  inviteOpenTableId,
  pendingTableId,
  rulesForm,
  setRulesForm,
  savingRules,
  onSaveRules,
  onManageToggle,
  onInviteToggle,
  onCopyLink,
  onOpenGroupChat,
  onBoost,
  onPayListing,
  onReviewToggle,
  onPhotoInputChange,
  photoPreviewUrl,
  childrenPending,
  childrenInvite,
  isPast = false,
}) {
  const badge = isPast
    ? { label: 'Past', bg: 'var(--sec-bg-hover)', color: 'var(--sec-text-muted)' }
    : hostStatusBadge || TABLE_HOST_STATUS_BADGE[t.status] || TABLE_HOST_STATUS_BADGE.DRAFT;
  const isManaging = !isPast && manageTableId === t.id;

  return (
    <article
      className="sec-card overflow-hidden rounded-2xl border border-[var(--sec-border)] bg-[var(--sec-bg-card)] shadow-sm"
      style={t.boosted ? { borderColor: 'rgba(212, 175, 55, 0.45)' } : undefined}
    >
      <div className="relative h-36 bg-[var(--sec-bg-elevated)]">
        {photoPreviewUrl || t.photo ? (
          <img src={photoPreviewUrl || t.photo} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-[var(--sec-text-muted)]">
            <Camera className="w-8 h-8 opacity-40" />
            <span className="text-xs">Add a table photo for group chat & discovery</span>
          </div>
        )}
        <div className="absolute top-2 right-2 flex flex-col items-end gap-1">
          <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: badge.bg, color: badge.color }}>
            {badge.label}
          </span>
          <span className="text-[10px] px-2 py-0.5 rounded-full border border-white/20 bg-black/50 text-white">
            {t.isPublic ? 'Public' : 'Private'}
          </span>
          {(t.pendingInviteCount ?? 0) > 0 && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/90 text-black font-medium">
              {t.pendingInviteCount} invite{t.pendingInviteCount === 1 ? '' : 's'} pending
            </span>
          )}
        </div>
        {t.boosted ? (
          <span className="absolute top-2 left-2 text-[10px] px-2 py-0.5 rounded-full bg-amber-500/90 text-black font-semibold inline-flex items-center gap-1">
            <Sparkles className="w-3 h-3" /> Promoted
          </span>
        ) : null}
      </div>

      <div className="p-4 space-y-3">
        <div>
          <h3 className="font-semibold text-lg leading-tight">{t.tableName || t.venueName}</h3>
          <p className="text-xs text-[var(--sec-text-muted)] mt-1 line-clamp-2">{loc}</p>
        </div>

        <p className="text-xs text-[var(--sec-text-muted)]">
          {format(parseISO(t.eventDate), 'EEE d MMM')} · {t.eventTime} ·{' '}
          {t.tableType === 'IN_APP_EVENT' ? 'SEC event' : 'External meet-up'}
        </p>

        {t.tableDescription ? (
          <p className="text-sm text-[var(--sec-text-secondary)] line-clamp-2">{t.tableDescription}</p>
        ) : null}

        <div className="flex flex-wrap gap-2 text-sm">
          <span className="px-2.5 py-1 rounded-lg bg-[var(--sec-bg-elevated)] border border-[var(--sec-border)]">
            Members {t._count?.members ?? 0}
          </span>
          <span className="px-2.5 py-1 rounded-lg bg-[var(--sec-bg-elevated)] border border-[var(--sec-border)]">
            Spots left {t.spotsRemaining}
          </span>
          {t.hasJoiningFee ? (
            <span className="px-2.5 py-1 rounded-lg text-amber-200 border border-amber-500/30 bg-amber-500/10">
              R{Number(t.joiningFee || 0).toFixed(0)} join
            </span>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2">
          {!isPast && t.status === 'DRAFT' && (
            <button type="button" className="sec-btn sec-btn-primary text-xs py-2 px-3 rounded-xl" onClick={() => onPayListing?.(t.id)}>
              Pay listing & go live
            </button>
          )}
          {t.groupChat?.id && (
            <Link
              to={`${createPageUrl('Messages')}?group=${encodeURIComponent(t.groupChat.id)}&gk=HOSTED_TABLE`}
              className="inline-flex items-center gap-1.5 text-xs sec-btn sec-btn-secondary py-2 px-3 rounded-xl"
              onClick={onOpenGroupChat}
            >
              <MessageCircle className="w-4 h-4" />
              Group chat
            </Link>
          )}
          {!isPast && t.status === 'ACTIVE' && (
            <>
              <button
                type="button"
                className="inline-flex items-center gap-1.5 text-xs sec-btn sec-btn-secondary py-2 px-3 rounded-xl"
                onClick={() => onCopyLink?.(t.id)}
              >
                <Copy className="w-4 h-4" />
                Copy link
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-1.5 text-xs sec-btn sec-btn-ghost py-2 px-3 rounded-xl border border-[var(--sec-border)]"
                onClick={() => onInviteToggle?.(t.id)}
              >
                <UserPlus className="w-4 h-4" />
                {inviteOpenTableId === t.id ? 'Hide invite' : 'Invite'}
              </button>
              <button
                type="button"
                className="text-xs sec-btn sec-btn-secondary py-2 px-3 rounded-xl"
                onClick={() => onManageToggle?.(t)}
              >
                {isManaging ? 'Close settings' : 'Table settings'}
              </button>
              {(t.pendingJoinCount ?? 0) > 0 && (
                <button
                  type="button"
                  className="text-xs sec-btn sec-btn-ghost py-2 px-3 rounded-xl border border-[var(--sec-border)]"
                  onClick={() => onReviewToggle?.(t.id)}
                >
                  {pendingTableId === t.id ? 'Hide requests' : 'Review requests'}
                </button>
              )}
            </>
          )}
        </div>

        {!isPast && t.status === 'DRAFT' && (
          <p className="text-xs text-[var(--sec-text-muted)] leading-relaxed">
            Not visible until listing payment succeeds. Then your group chat opens and you can invite guests.
          </p>
        )}

        {!isPast && t.status === 'ACTIVE' && isManaging && (
          <div className="rounded-xl border border-[var(--sec-accent-border)] bg-[var(--sec-bg-elevated)] p-4 space-y-4">
            <p className="text-sm font-semibold">Table settings</p>
            <div>
              <label className="text-xs text-[var(--sec-text-muted)] block mb-2">
                Table photo — group chat avatar, browse cards, and Home when boosted
              </label>
              <input type="file" accept="image/*" className="sec-input-rect w-full text-xs" onChange={onPhotoInputChange} />
              {photoPreviewUrl || t.photo ? (
                <p className="text-[11px] text-[var(--sec-text-muted)] mt-2">Save settings to apply a new photo.</p>
              ) : null}
            </div>
            {t.tableType === 'IN_APP_EVENT' && (
              <>
                <div>
                  <label className="text-xs text-[var(--sec-text-muted)] block mb-1">Table name (updates group chat)</label>
                  <Input
                    value={rulesForm.tableName}
                    onChange={(e) => setRulesForm((f) => ({ ...f, tableName: e.target.value }))}
                    className="bg-[var(--sec-bg-card)] border-[var(--sec-border)]"
                    maxLength={60}
                  />
                </div>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={rulesForm.isPublic}
                    onChange={(e) => setRulesForm((f) => ({ ...f, isPublic: e.target.checked }))}
                  />
                  Public table (anyone can join without approval)
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={rulesForm.hasJoiningFee}
                    onChange={(e) => setRulesForm((f) => ({ ...f, hasJoiningFee: e.target.checked }))}
                  />
                  Charge a joining fee (85% to you)
                </label>
                {rulesForm.hasJoiningFee ? (
                  <div>
                    <label className="text-xs text-[var(--sec-text-muted)] block mb-1">Joining fee (ZAR, min R10)</label>
                    <Input
                      type="number"
                      min={10}
                      value={rulesForm.joiningFee}
                      onChange={(e) => setRulesForm((f) => ({ ...f, joiningFee: e.target.value }))}
                      className="bg-[var(--sec-bg-card)] border-[var(--sec-border)]"
                    />
                  </div>
                ) : null}
              </>
            )}
            <button
              type="button"
              disabled={savingRules}
              className="sec-btn sec-btn-primary text-sm py-2 px-4 rounded-xl w-full"
              onClick={() => onSaveRules?.(t)}
            >
              {savingRules ? 'Saving…' : 'Save settings'}
            </button>
          </div>
        )}

        {childrenInvite}
        {childrenPending}

        {!isPast && !t.boosted && t.status === 'ACTIVE' ? (
          <button type="button" className="sec-btn sec-btn-secondary text-xs w-full py-2.5 rounded-xl" onClick={() => onBoost?.(t.id)}>
            Boost visibility on Home (R200 / 7 days)
          </button>
        ) : t.boosted ? (
          <p className="text-xs text-amber-400 text-center">Showing on Home feed with your table photo</p>
        ) : null}
      </div>
    </article>
  );
}
