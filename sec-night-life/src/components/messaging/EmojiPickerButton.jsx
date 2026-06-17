import React from 'react';
import { Smile } from 'lucide-react';
import EmojiPicker from 'emoji-picker-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

export default function EmojiPickerButton({
  onSelect,
  disabled = false,
  side = 'top',
  variant = 'popover',
}) {
  if (variant === 'mobile-trigger') {
    return (
      <button
        type="button"
        disabled={disabled}
        className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg border border-[#262629] shrink-0"
        aria-label="Show emoji picker"
      >
        <Smile className="w-5 h-5" style={{ color: 'var(--sec-text-muted)' }} />
      </button>
    );
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          className="min-h-[44px] min-w-[44px] px-0 border-[#262629]"
          aria-label="Open emoji picker"
        >
          <Smile className="w-5 h-5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0 border-[#262629] bg-[#141416]" side={side} align="end">
        <EmojiPicker
          onEmojiClick={(emojiData) => onSelect?.(emojiData.emoji)}
          autoFocusSearch={false}
          searchDisabled={false}
          skinTonesDisabled
          lazyLoadEmojis
          width={320}
          height={360}
          previewConfig={{ showPreview: false }}
          theme="dark"
        />
      </PopoverContent>
    </Popover>
  );
}
