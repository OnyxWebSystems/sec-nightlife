import React, { useEffect, useRef, useState } from 'react';
import { Send, Smile } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import EmojiPickerButton from '@/components/messaging/EmojiPickerButton';
import MobileEmojiPanel from '@/components/messaging/MobileEmojiPanel';
import { useIsDesktop } from '@/hooks/useIsDesktop';

export default function ChatComposer({
  value,
  onChange,
  onSend,
  disabled = false,
  placeholder = 'Type a message...',
  replyPreview = null,
  inputRef: externalInputRef,
  onEmojiOpenChange,
}) {
  const isDesktop = useIsDesktop();
  const [emojiOpen, setEmojiOpen] = useState(false);
  const internalInputRef = useRef(null);
  const inputRef = externalInputRef || internalInputRef;

  useEffect(() => {
    onEmojiOpenChange?.(emojiOpen);
  }, [emojiOpen, onEmojiOpenChange]);

  function handleEmojiSelect(emoji) {
    const inputEl = inputRef.current;
    if (!inputEl) {
      onChange(`${value}${emoji}`);
      return;
    }
    const start = inputEl.selectionStart ?? value.length;
    const end = inputEl.selectionEnd ?? value.length;
    const next = `${value.slice(0, start)}${emoji}${value.slice(end)}`;
    onChange(next);
    requestAnimationFrame(() => {
      inputEl.focus();
      const caret = start + emoji.length;
      inputEl.setSelectionRange(caret, caret);
    });
  }

  function toggleEmoji() {
    if (emojiOpen) {
      setEmojiOpen(false);
      inputRef.current?.focus();
    } else {
      setEmojiOpen(true);
      if (typeof document !== 'undefined' && document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
    }
  }

  function handleSend() {
    if (!value.trim() || disabled) return;
    onSend();
    setEmojiOpen(false);
  }

  return (
    <div className="flex flex-col shrink-0 border-t border-[#262629] bg-[#0A0A0B]" style={{ paddingBottom: emojiOpen ? 0 : 'env(safe-area-inset-bottom)' }}>
      {replyPreview}
      <div className="p-3 flex gap-2 items-end">
        {!isDesktop ? (
          <button
            type="button"
            onClick={toggleEmoji}
            disabled={disabled}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg border border-[#262629] shrink-0"
            aria-label={emojiOpen ? 'Show keyboard' : 'Show emoji picker'}
          >
            <Smile className="w-5 h-5" style={{ color: emojiOpen ? 'var(--sec-accent)' : 'var(--sec-text-muted)' }} />
          </button>
        ) : null}
        <Input
          ref={inputRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="min-h-[44px] flex-1"
          disabled={disabled}
          onFocus={() => setEmojiOpen(false)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
        />
        {isDesktop ? (
          <EmojiPickerButton disabled={disabled} onSelect={handleEmojiSelect} />
        ) : null}
        <Button
          className="min-h-[44px] min-w-[44px] px-3 shrink-0"
          disabled={!value.trim() || disabled}
          onClick={handleSend}
          aria-label="Send message"
        >
          <Send className="w-5 h-5" />
        </Button>
      </div>
      {!isDesktop ? (
        <MobileEmojiPanel
          open={emojiOpen}
          onSelect={handleEmojiSelect}
          onCloseKeyboard={() => {
            setEmojiOpen(false);
            inputRef.current?.focus();
          }}
        />
      ) : null}
    </div>
  );
}
