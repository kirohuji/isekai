import { cn } from '../lib/utils';
import type { ReactNode } from 'react';

// ===== 简单 shadcn 风格组件（无需安装额外依赖） =====

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('rounded-xl border border-amber-800/40 bg-stone-900/90 shadow-lg backdrop-blur', className)}>{children}</div>;
}

export function CardHeader({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('px-5 py-4 border-b border-amber-800/20', className)}>{children}</div>;
}

export function CardContent({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('px-5 py-4', className)}>{children}</div>;
}

export function CardTitle({ className, children }: { className?: string; children: ReactNode }) {
  return <h3 className={cn('text-lg font-serif text-amber-200 tracking-wide', className)}>{children}</h3>;
}

export function Button({
  className, children, variant = 'default', size = 'md', disabled, onClick, ...props
}: {
  className?: string; children: ReactNode; variant?: 'default' | 'outline' | 'ghost' | 'danger' | 'success';
  size?: 'sm' | 'md' | 'lg'; disabled?: boolean; onClick?: () => void;
}) {
  const base = 'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-all duration-200 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed';
  const variants = {
    default: 'bg-amber-700 text-amber-50 hover:bg-amber-600 shadow-md',
    outline: 'border border-amber-700/60 text-amber-300 hover:bg-amber-900/40',
    ghost: 'text-stone-400 hover:text-amber-300 hover:bg-stone-800/50',
    danger: 'bg-red-900/80 text-red-200 hover:bg-red-800',
    success: 'bg-emerald-900/80 text-emerald-200 hover:bg-emerald-800',
  };
  const sizes = { sm: 'px-3 py-1.5 text-xs', md: 'px-4 py-2 text-sm', lg: 'px-6 py-3 text-base' };
  return (
    <button
      className={cn(base, variants[variant], sizes[size], className)}
      disabled={disabled}
      onClick={onClick}
      {...props}
    >
      {children}
    </button>
  );
}

export function Badge({ className, children, variant = 'default' }: { className?: string; children: ReactNode; variant?: 'default' | 'warning' | 'danger' | 'success' }) {
  const variants = {
    default: 'bg-stone-800 text-stone-300',
    warning: 'bg-amber-900/60 text-amber-300',
    danger: 'bg-red-900/60 text-red-300',
    success: 'bg-emerald-900/60 text-emerald-300',
  };
  return <span className={cn('inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium', variants[variant], className)}>{children}</span>;
}

export function Progress({ value, max = 100, variant = 'default' }: { value: number; max?: number; variant?: 'default' | 'danger' | 'warning' | 'success' }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const colors = {
    default: 'bg-amber-600',
    danger: 'bg-red-500',
    warning: 'bg-amber-500',
    success: 'bg-emerald-500',
  };
  return (
    <div className="h-2 rounded-full bg-stone-800 overflow-hidden">
      <div
        className={cn('h-full rounded-full transition-all duration-700 ease-out', colors[variant])}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export function Separator() {
  return <hr className="border-amber-800/20 my-2" />;
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-stone-800', className)} />;
}
