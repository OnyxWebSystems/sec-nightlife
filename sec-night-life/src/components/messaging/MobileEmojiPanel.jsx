import React from 'react';
import EmojiPicker from 'emoji-picker-react';

export default function MobileEmojiPanel({ open, onSelect, onCloseKeyboard }) {
  if (!open) return null;

  return (
    <div
      className="lg:hidden border-t border-[#262629] bg-[#0A0A0B]"
      style={{
        height: 'min(360px, 42dvh)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      <div className="relative h-full">
        <EmojiPicker
          onEmojiClick={(emojiData) => onSelect?.(emojiData.emoji)}
          autoFocusSearch={false}
          skinTonesDisabled
          lazyLoadEmojis
          width="100%"
          height="100%"
          previewConfig={{ showPreview: false }}
          theme="dark"
          searchPlaceholder="Search Emoji"
        />
        <button
          type="button"
          onClick={onCloseKeyboard}
          className="absolute bottom-2 left-3 z-10 text-sm font-semibold px-2 py-1 rounded-md"
          style={{ color: 'var(--sec-accent)', backgroundColor: 'var(--sec-bg-elevated)' }}
        >
          ABC
        </button>
      </div>
    </div>
  );
}
