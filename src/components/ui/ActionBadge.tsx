import React from 'react';
import { BadgeVariant, StatusBadge } from './StatusBadge';

interface ActionBadgeProps {
  variant: BadgeVariant;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}

export const ActionBadge: React.FC<ActionBadgeProps> = ({ variant, label, onClick, disabled, className = '' }) => {
  if (onClick) {
    return (
      <button 
        onClick={onClick}
        disabled={disabled}
        className={`hover:opacity-80 transition-opacity focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 focus:ring-offset-slate-900 ${disabled ? 'opacity-50 cursor-not-allowed hover:opacity-50' : ''} ${className}`}
      >
        <StatusBadge variant={variant} label={label} />
      </button>
    );
  }

  return <StatusBadge variant={variant} label={label} className={className} />;
};
