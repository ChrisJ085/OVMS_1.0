import React from 'react';
import { AlertCircle, CheckCircle2, Clock, Info, XCircle, AlertTriangle, Send } from 'lucide-react';

export type BadgeVariant = 
  | 'hold'
  | 'release'
  | 'urgent'
  | 'information'
  | 'completed'
  | 'blocked'
  | 'warning';

interface BadgeProps {
  variant: BadgeVariant;
  label: string;
  className?: string;
}

const variantStyles: Record<BadgeVariant, { bg: string; text: string; border: string; icon: React.ElementType }> = {
  hold: { bg: 'bg-slate-900', text: 'text-slate-300', border: 'border-slate-700', icon: Clock },
  release: { bg: 'bg-emerald-950', text: 'text-emerald-400', border: 'border-emerald-800', icon: Send },
  urgent: { bg: 'bg-red-950', text: 'text-red-400', border: 'border-red-800', icon: AlertCircle },
  information: { bg: 'bg-blue-950', text: 'text-blue-400', border: 'border-blue-800', icon: Info },
  completed: { bg: 'bg-emerald-950', text: 'text-emerald-400', border: 'border-emerald-800', icon: CheckCircle2 },
  blocked: { bg: 'bg-red-950', text: 'text-red-400', border: 'border-red-800', icon: XCircle },
  warning: { bg: 'bg-amber-950', text: 'text-amber-400', border: 'border-amber-800', icon: AlertTriangle },
};

export const StatusBadge: React.FC<BadgeProps> = ({ variant, label, className = '' }) => {
  const styles = variantStyles[variant];
  const Icon = styles.icon;

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${styles.bg} ${styles.text} ${styles.border} ${className}`}>
      <Icon className="w-3.5 h-3.5" />
      {label}
    </span>
  );
};
