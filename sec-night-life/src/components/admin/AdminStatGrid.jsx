export default function AdminStatGrid({ children, className = '' }) {
  return (
    <div className={`grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 ${className}`}>
      {children}
    </div>
  );
}

export function AdminStatCard({ icon: Icon, value, label, iconClassName = 'text-[var(--sec-accent)]', borderClassName = 'border-[#262629]', valueClassName = '' }) {
  return (
    <div className={`p-4 rounded-xl bg-[#141416] border ${borderClassName}`}>
      {Icon ? <Icon size={20} className={`${iconClassName} mb-2`} /> : null}
      <p className={`text-2xl font-bold ${valueClassName}`}>{value}</p>
      <p className="text-xs text-[var(--sec-text-muted)]">{label}</p>
    </div>
  );
}
