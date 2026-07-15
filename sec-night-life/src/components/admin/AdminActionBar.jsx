import { ChevronRight } from 'lucide-react';

export default function AdminActionBar({ title = 'Quick actions', actions = [] }) {
  if (!actions.length) return null;

  return (
    <div className="p-4 rounded-xl bg-[#141416] border border-[#262629]">
      <h3 className="font-semibold mb-2">{title}</h3>
      <div className="space-y-2">
        {actions.map((action) => (
          <button
            key={action.id}
            type="button"
            onClick={action.onClick}
            className="w-full flex items-center justify-between p-3 rounded-lg hover:bg-[#1a1a1c] transition-colors min-h-[44px]"
          >
            <span>{action.label}</span>
            <ChevronRight size={18} />
          </button>
        ))}
      </div>
    </div>
  );
}
