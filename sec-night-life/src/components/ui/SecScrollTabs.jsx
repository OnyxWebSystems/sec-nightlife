import React from 'react';
import { cn } from '@/lib/utils';
import { TabsList, TabsTrigger } from '@/components/ui/tabs';

/**
 * Horizontally scrollable tab list for narrow viewports (e.g. iPhone 14).
 */
export default function SecScrollTabs({
  tabs = [],
  listClassName,
  triggerClassName,
  variant = 'underline',
}) {
  const isPill = variant === 'pill';

  return (
    <TabsList
      className={cn(
        'flex w-full overflow-x-auto scrollbar-hide gap-0 border-0 bg-transparent p-0',
        isPill ? 'gap-2 pb-1' : 'border-b border-[#1C1C22]',
        listClassName,
      )}
    >
      {tabs.map((tab) => (
        <TabsTrigger
          key={tab.value}
          value={tab.value}
          className={cn(
            'flex-shrink-0 min-w-max px-3 sm:px-4',
            isPill
              ? 'rounded-full border border-[#262629] bg-[#0A0A0B] data-[state=active]:bg-[var(--sec-accent)] data-[state=active]:text-black data-[state=active]:border-transparent'
              : '',
            triggerClassName,
          )}
        >
          {tab.label}
        </TabsTrigger>
      ))}
    </TabsList>
  );
}
