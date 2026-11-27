'use client';
import { AlertCircle, CheckCircle2, Loader2, Moon, Sun, X } from 'lucide-react';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { cn, initials } from '@/lib/utils';

/* ---------- Button ---------- */
type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; size?: 'sm' | 'md'; loading?: boolean };
export function Button({ variant = 'primary', size = 'md', loading, className, children, disabled, ...props }: ButtonProps) {
  return (
    <button
      disabled={disabled || loading}
      className={cn(
        'inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:pointer-events-none disabled:opacity-50',
        size === 'sm' ? 'h-8 px-3 text-[13px]' : 'h-9 px-4 text-sm',
        variant === 'primary' && 'bg-primary text-primary-foreground hover:bg-primary/90',
        variant === 'secondary' && 'border bg-card text-foreground hover:bg-muted',
        variant === 'ghost' && 'text-foreground hover:bg-muted',
        variant === 'danger' && 'border border-danger/30 bg-card text-danger hover:bg-danger-bg',
        className
      )}
      {...props}
    >
      {loading && <Loader2 className="size-4 animate-spin" />}
      {children}
    </button>
  );
}

/* ---------- Form controls ---------- */
const control = 'w-full rounded-md border bg-card px-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-70';
export const Input = ({ className, ...p }: InputHTMLAttributes<HTMLInputElement>) => <input className={cn(control, 'h-9', className)} {...p} />;
export const Textarea = ({ className, ...p }: TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea className={cn(control, 'min-h-20 py-2', className)} {...p} />;
export const Select = ({ className, children, ...p }: SelectHTMLAttributes<HTMLSelectElement>) => (
  <select className={cn(control, 'h-9 pr-8', className)} {...p}>{children}</select>
);
export function Field({ label, hint, error, children, className }: { label: string; hint?: string; error?: string | null; children: ReactNode; className?: string }) {
  return (
    <label className={cn('block space-y-1.5', className)}>
      <span className="text-[13px] font-medium">{label}</span>
      {children}
      {hint && !error && <span className="block text-xs text-muted-foreground">{hint}</span>}
      {error && <span className="block text-xs text-danger">{error}</span>}
    </label>
  );
}
export function Switch({ checked, onChange, disabled, label }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={() => onChange(!checked)}
      className={cn('relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50', checked ? 'bg-primary' : 'bg-muted-foreground/40')}>
      <span className={cn('inline-block size-4 rounded-full bg-primary-foreground shadow transition-transform', checked ? 'translate-x-4.5' : 'translate-x-0.5')} />
    </button>
  );
}

/* ---------- Layout ---------- */
export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
export const Card = ({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) => <div className={cn('rounded-lg border bg-card', className)} {...p} />;
export function CardHeader({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b px-5 py-4">
      <div>
        <h2 className="text-sm font-semibold">{title}</h2>
        {description && <p className="mt-0.5 text-[13px] text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}
export const CardBody = ({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) => <div className={cn('p-5', className)} {...p} />;
export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <Card className="p-5">
      <div className="text-[13px] text-muted-foreground">{label}</div>
      <div className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">{value}</div>
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </Card>
  );
}

/* ---------- Badge / avatar ---------- */
const tones = {
  neutral: 'bg-muted text-muted-foreground',
  dark: 'bg-primary text-primary-foreground',
  success: 'bg-success-bg text-success',
  warning: 'bg-warning-bg text-warning',
  danger: 'bg-danger-bg text-danger'
};
export const Badge = ({ tone = 'neutral', children, className }: { tone?: keyof typeof tones; children: ReactNode; className?: string }) => (
  <span className={cn('inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium', tones[tone], className)}>{children}</span>
);
export const Avatar = ({ name, className }: { name?: string | null; className?: string }) => (
  <span className={cn('inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground', className)}>{initials(name)}</span>
);

/* ---------- Table ---------- */
export const Table = ({ children }: { children: ReactNode }) => (
  <div className="overflow-x-auto"><table className="w-full text-left text-sm">{children}</table></div>
);
export const THead = ({ children }: { children: ReactNode }) => <thead className="border-b bg-muted/50 text-xs font-medium text-muted-foreground">{children}</thead>;
export const TH = ({ className, ...p }: React.ThHTMLAttributes<HTMLTableCellElement>) => <th className={cn('px-5 py-2.5 font-medium', className)} {...p} />;
export const TR = ({ className, onClick, ...p }: React.HTMLAttributes<HTMLTableRowElement>) => (
  <tr onClick={onClick} className={cn('border-b last:border-0', onClick && 'cursor-pointer hover:bg-muted/50', className)} {...p} />
);
export const TD = ({ className, ...p }: React.TdHTMLAttributes<HTMLTableCellElement>) => <td className={cn('px-5 py-3 align-middle', className)} {...p} />;

/* ---------- Tabs ---------- */
export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: string; count?: number }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="flex gap-1 border-b">
      {tabs.map((t) => (
        <button key={t.id} onClick={() => onChange(t.id)}
          className={cn('-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors', value === t.id ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground')}>
          {t.label}{t.count !== undefined && <span className="ml-1.5 text-xs text-muted-foreground">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

/* ---------- Dialog (native <dialog>) ---------- */
export function Dialog({ open, onClose, title, description, children, footer, wide }: { open: boolean; onClose: () => void; title: string; description?: string; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} onClose={onClose} onClick={(e) => e.target === ref.current && onClose()}
      className={cn('m-auto w-full rounded-lg border bg-card p-0 text-foreground shadow-xl', wide ? 'max-w-2xl' : 'max-w-md')}>
      {open && (
        <div>
          <div className="flex items-start justify-between gap-4 border-b px-5 py-4">
            <div>
              <h2 className="text-base font-semibold">{title}</h2>
              {description && <p className="mt-0.5 text-[13px] text-muted-foreground">{description}</p>}
            </div>
            <button onClick={onClose} aria-label="Close" className="rounded-md p-1 text-muted-foreground hover:bg-muted"><X className="size-4" /></button>
          </div>
          <div className="max-h-[70vh] overflow-y-auto px-5 py-4">{children}</div>
          {footer && <div className="flex justify-end gap-2 border-t bg-muted/30 px-5 py-3">{footer}</div>}
        </div>
      )}
    </dialog>
  );
}

/* ---------- States ---------- */
export const Spinner = () => <Loader2 className="size-5 animate-spin text-muted-foreground" />;
export const Loading = () => <div className="flex items-center justify-center py-16"><Spinner /></div>;
export function EmptyState({ icon, title, description, action }: { icon?: ReactNode; title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      {icon && <div className="mb-3 rounded-full bg-muted p-3 text-muted-foreground">{icon}</div>}
      <div className="text-sm font-medium">{title}</div>
      {description && <p className="mt-1 max-w-sm text-[13px] text-muted-foreground">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
export const ErrorNote = ({ children }: { children: ReactNode }) => (
  <div className="flex items-start gap-2 rounded-md border border-danger/20 bg-danger-bg px-3 py-2 text-[13px] text-danger"><AlertCircle className="mt-0.5 size-4 shrink-0" />{children}</div>
);

/* ---------- Theme toggle (dark default, light optional) ---------- */
export function ThemeToggle({ className }: { className?: string }) {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  useEffect(() => { setTheme(document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'); }, []);
  function toggle() {
    const next = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('theme', next); } catch { /* private mode: theme just won't persist */ }
    setTheme(next);
  }
  return (
    <button onClick={toggle} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`} title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
      className={cn('rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground', className)}>
      {theme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </button>
  );
}

/* ---------- Toasts ---------- */
type Toast = { id: number; text: string; tone: 'success' | 'error' };
const ToastCtx = createContext<(text: string, tone?: Toast['tone']) => void>(() => {});
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((text: string, tone: Toast['tone'] = 'success') => {
    const id = Date.now() + Math.random();
    setItems((x) => [...x, { id, text, tone }]);
    setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), 3500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-100 flex flex-col gap-2">
        {items.map((t) => (
          <div key={t.id} className="pointer-events-auto flex items-center gap-2 rounded-md border bg-card px-3.5 py-2.5 text-sm shadow-lg">
            {t.tone === 'success' ? <CheckCircle2 className="size-4 text-success" /> : <AlertCircle className="size-4 text-danger" />}
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
