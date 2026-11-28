'use client';
import { AlertCircle, CheckCircle2, Loader2, Moon, Search, Sun, X } from 'lucide-react';
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { cn, initials } from '@/lib/utils';

/* ---------- Button ---------- */
type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; size?: 'sm' | 'md'; loading?: boolean };
export function Button({ variant = 'primary', size = 'md', loading, className, children, disabled, ...props }: ButtonProps) {
  return (
    <button
      disabled={disabled || loading}
      className={cn(
        'inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium transition-[color,background-color,border-color,box-shadow,transform] duration-150 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40 disabled:pointer-events-none disabled:opacity-50',
        size === 'sm' ? 'h-8 px-3 text-[13px]' : 'h-9 px-4 text-sm',
        variant === 'primary' && 'bg-primary text-primary-foreground hover:bg-primary/90',
        variant === 'secondary' && 'border bg-card text-foreground shadow-[var(--input-shadow)] hover:border-ring/60 hover:bg-muted',
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

export function IconButton({ label, className, children, tone = 'default', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; tone?: 'default' | 'danger' }) {
  return (
    <button type="button" aria-label={label} title={label}
      className={cn('inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-[color,background-color,transform] duration-150 active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 [&_svg]:size-4',
        tone === 'danger' ? 'hover:bg-danger-bg hover:text-danger' : 'hover:bg-muted hover:text-foreground', className)}
      {...props}>{children}</button>
  );
}

/* ---------- Form controls ---------- */
/*
 * Text fields: recessed into the surface with a faint inner shadow; the border lifts on hover; focus gets a soft
 * brand-green ring. Invalid fields turn red only after the person has interacted with them (:user-invalid).
 */
const control = cn(
  'w-full rounded-lg border border-input-border bg-input px-3 text-sm text-foreground shadow-[var(--input-shadow)] outline-none',
  'transition-[border-color,box-shadow,background-color] duration-150 placeholder:text-muted-foreground/60',
  'hover:border-ring/70 focus-visible:border-brand/70 focus-visible:ring-[3px] focus-visible:ring-brand/20',
  'user-invalid:border-danger/70 user-invalid:focus-visible:ring-danger/20 aria-[invalid=true]:border-danger/70 aria-[invalid=true]:focus-visible:ring-danger/20',
  'disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:border-input-border'
);
export const Input = ({ className, ...p }: InputHTMLAttributes<HTMLInputElement>) => <input className={cn(control, 'h-9', className)} {...p} />;
export const Textarea = ({ className, ...p }: TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea className={cn(control, 'min-h-20 resize-y py-2 leading-relaxed', className)} {...p} />;
export const Select = ({ className, children, ...p }: SelectHTMLAttributes<HTMLSelectElement>) => (
  <select className={cn(control, 'h-9 pr-8', className)} {...p}>{children}</select>
);
export function SearchInput({ className, ...p }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className={cn('relative', className)}>
      <input type="search" className={cn(control, 'peer h-9 pl-8 [&::-webkit-search-cancel-button]:hidden')} {...p} />
      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground transition-colors peer-focus-visible:text-brand" strokeWidth={1.75} />
    </div>
  );
}
/* Pill filter group for switching a list's view (statuses). Underline Tabs stay for page sections. */
/* Measures the selected tab so an indicator can glide to it. */
function useIndicator(value: unknown) {
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ left: number; width: number } | null>(null);
  useLayoutEffect(() => {
    const el = ref.current?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (!el) return;
    const update = () => setBox({ left: el.offsetLeft, width: el.offsetWidth });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [value]);
  return { ref, box };
}

export function Segmented<T extends string>({ options, value, onChange, className }: { options: { id: T; label: string; count?: number }[]; value: T; onChange: (v: T) => void; className?: string }) {
  const { ref, box } = useIndicator(value);
  return (
    <div ref={ref} role="tablist" className={cn('relative inline-flex max-w-full items-center gap-0.5 overflow-x-auto rounded-lg border bg-card p-0.5 [scrollbar-width:none]', className)}>
      {box && <span aria-hidden className="absolute inset-y-0.5 rounded-md bg-muted shadow-sm ring-1 ring-border/60 transition-[left,width] duration-300 ease-[var(--ease-out)]" style={box} />}
      {options.map((o) => (
        <button key={o.id} role="tab" aria-selected={value === o.id} onClick={() => onChange(o.id)}
          className={cn('relative h-7 shrink-0 whitespace-nowrap rounded-md px-2.5 text-[13px] font-medium transition-colors', value === o.id ? 'text-foreground' : 'text-muted-foreground hover:text-foreground')}>
          {o.label}{o.count !== undefined && <span className="ml-1.5 text-xs text-muted-foreground tabular-nums">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}
export function Field({ label, hint, error, children, className }: { label: string; hint?: string; error?: string | null; children: ReactNode; className?: string }) {
  return (
    <label className={cn('group/field block space-y-1.5', className)}>
      <span className="block text-[13px] font-medium text-foreground/90 transition-colors group-focus-within/field:text-foreground">{label}</span>
      {children}
      {hint && !error && <span className="block text-xs text-muted-foreground">{hint}</span>}
      {error && <span className="block text-xs text-danger">{error}</span>}
    </label>
  );
}
export function Switch({ checked, onChange, disabled, label }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={() => onChange(!checked)}
      className={cn('relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50', checked ? 'bg-brand' : 'bg-muted-foreground/30')}>
      <span className={cn('inline-block size-4 rounded-full bg-white shadow-sm transition-transform duration-300 ease-[var(--ease-out)]', checked ? 'translate-x-4.5' : 'translate-x-0.5')} />
    </button>
  );
}

/* ---------- Layout ---------- */
export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-0.5 text-[13px] text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
/* One surface recipe everywhere: 12px radius, hairline border, a faint top highlight in dark mode. */
export const surface = 'rounded-xl border bg-card shadow-[inset_0_1px_0_0_rgb(255_255_255/0.03)]';
export const Card = ({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) => <div className={cn(surface, className)} {...p} />;
export function CardHeader({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-3">
      <div>
        <h2 className="text-sm font-medium">{title}</h2>
        {description && <p className="mt-0.5 text-[13px] text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}
/* A body right under a CardHeader needs only a little top padding: the header already has its own. */
export const CardBody = ({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) => <div className={cn('p-5 not-first:pt-1', className)} {...p} />;

export const CardFooter = ({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex items-center justify-end gap-2 border-t px-5 py-3', className)} {...p} />
);
/* Settings layout: what this is about on the left, the controls in a card on the right. Stacks on small screens. */
export function Section({ title, description, children, className }: { title: string; description?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn('grid gap-4 border-t py-8 first:border-t-0 first:pt-0 lg:grid-cols-[minmax(0,15rem)_1fr] lg:gap-10', className)}>
      <div>
        <h2 className="text-sm font-medium">{title}</h2>
        {description && <p className="mt-1 text-[13px] text-muted-foreground">{description}</p>}
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

type StatProps = { label: string; value: ReactNode; hint?: string; icon?: typeof Loader2 };
function StatContent({ label, value, hint, icon: Icon }: StatProps) {
  return (
    <>
      <div className="flex items-center gap-1.5 text-[13px] text-muted-foreground">{Icon && <Icon className="size-3.5" strokeWidth={2} />}{label}</div>
      <div className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">{value}</div>
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </>
  );
}
export const Stat = (p: StatProps) => <Card className="p-5"><StatContent {...p} /></Card>;
/* Several stats as one surface split by hairlines, instead of a wall of separate boxes. */
export function StatGrid({ stats, className }: { stats: StatProps[]; className?: string }) {
  return (
    <div className={cn(surface, 'grid gap-px overflow-hidden bg-border', className)}>
      {stats.map((s, i) => <div key={s.label} className="bg-card p-5"><div className="animate-rise" style={{ animationDelay: `${i * 50}ms` }}><StatContent {...s} /></div></div>)}
    </div>
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
const dots = { neutral: 'bg-muted-foreground', dark: 'bg-foreground', success: 'bg-success', warning: 'bg-warning', danger: 'bg-danger' };
export const Badge = ({ tone = 'neutral', children, className }: { tone?: keyof typeof tones; children: ReactNode; className?: string }) => (
  <span className={cn('inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-medium', tones[tone], className)}>{children}</span>
);
/* Status: a coloured dot and plain text. Calmer than a filled pill when a table has many of them. */
export const StatusDot = ({ tone = 'neutral', children, className }: { tone?: keyof typeof tones; children: ReactNode; className?: string }) => (
  <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap text-[13px]', tone === 'neutral' ? 'text-muted-foreground' : 'text-foreground', className)}>
    <span className={cn('size-1.5 shrink-0 rounded-full', dots[tone])} />{children}
  </span>
);
export const Avatar = ({ name, className }: { name?: string | null; className?: string }) => (
  <span className={cn('inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground', className)}>{initials(name)}</span>
);

/* ---------- Table ---------- */
export const Table = ({ children }: { children: ReactNode }) => (
  <div className="overflow-x-auto"><table className="stagger-rows w-full text-left text-sm">{children}</table></div>
);
export const THead = ({ children }: { children: ReactNode }) => <thead className="border-b text-xs text-muted-foreground">{children}</thead>;
export const TH = ({ className, ...p }: React.ThHTMLAttributes<HTMLTableCellElement>) => <th className={cn('h-10 px-4 font-medium first:pl-5 last:pr-5', className)} {...p} />;
export const TR = ({ className, onClick, ...p }: React.HTMLAttributes<HTMLTableRowElement>) => (
  <tr onClick={onClick} className={cn('border-b border-border/60 transition-colors last:border-0 hover:bg-muted/30', onClick && 'cursor-pointer', className)} {...p} />
);
export const TD = ({ className, ...p }: React.TdHTMLAttributes<HTMLTableCellElement>) => <td className={cn('px-4 py-3 align-middle first:pl-5 last:pr-5', className)} {...p} />;

/* ---------- Tabs ---------- */
export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: string; count?: number }[]; value: T; onChange: (v: T) => void }) {
  const { ref, box } = useIndicator(value);
  return (
    <div ref={ref} role="tablist" className="relative flex gap-1 overflow-x-auto border-b [scrollbar-width:none]">
      {box && <span aria-hidden className="absolute bottom-0 h-0.5 rounded-full bg-foreground transition-[left,width] duration-300 ease-[var(--ease-out)]" style={box} />}
      {tabs.map((t) => (
        <button key={t.id} role="tab" aria-selected={value === t.id} onClick={() => onChange(t.id)}
          className={cn('shrink-0 px-3 py-2 text-sm font-medium transition-colors', value === t.id ? 'text-foreground' : 'text-muted-foreground hover:text-foreground')}>
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
      className={cn('m-auto w-[calc(100%-2rem)] rounded-xl border bg-card p-0 text-foreground shadow-2xl', wide ? 'max-w-2xl' : 'max-w-md')}>
      {open && (
        <div>
          <div className="flex items-start justify-between gap-4 px-5 pt-5 pb-3">
            <div>
              <h2 className="text-base font-semibold tracking-tight">{title}</h2>
              {description && <p className="mt-0.5 text-[13px] text-muted-foreground">{description}</p>}
            </div>
            <button onClick={onClose} aria-label="Close" className="rounded-md p-1 text-muted-foreground hover:bg-muted"><X className="size-4" /></button>
          </div>
          <div className="max-h-[70vh] overflow-y-auto px-5 pt-1 pb-5 empty:hidden">{children}</div>
          {footer && <div className="flex justify-end gap-2 border-t px-5 py-3">{footer}</div>}
        </div>
      )}
    </dialog>
  );
}

/* ---------- States ---------- */
export const Spinner = () => <Loader2 className="size-5 animate-spin text-muted-foreground" />;
export const Loading = () => <div className="animate-delayed-in flex items-center justify-center py-16"><Spinner /></div>;
export function EmptyState({ icon, title, description, action }: { icon?: ReactNode; title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="animate-rise flex flex-col items-center justify-center px-6 py-14 text-center">
      {icon && <div className="mb-4 flex size-10 items-center justify-center rounded-xl border bg-muted/50 text-muted-foreground [&_svg]:size-[18px]">{icon}</div>}
      <div className="text-sm font-medium">{title}</div>
      {description && <p className="mt-1 max-w-sm text-[13px] text-muted-foreground">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
export const ErrorNote = ({ children }: { children: ReactNode }) => (
  <div className="animate-rise flex items-start gap-2 rounded-lg border border-danger/20 bg-danger-bg px-3 py-2 text-[13px] text-danger"><AlertCircle className="mt-0.5 size-4 shrink-0" />{children}</div>
);
/* A calm heads-up (not an error): something is off or limited, and what that means. */
export function Notice({ tone = 'info', icon, title, children, className }: { tone?: 'info' | 'warning'; icon?: ReactNode; title?: string; children?: ReactNode; className?: string }) {
  return (
    <div className={cn('animate-rise flex items-start gap-3 rounded-xl border px-4 py-3 text-[13px] [&_svg]:size-4',
      tone === 'warning' ? 'border-warning/25 bg-warning-bg text-warning' : 'border-border bg-muted/40 text-muted-foreground', className)}>
      <span className="mt-0.5 shrink-0">{icon ?? <AlertCircle />}</span>
      <div className="min-w-0">{title && <div className={cn('font-medium', tone === 'info' && 'text-foreground')}>{title}</div>}{children && <div className={cn(title && 'mt-0.5')}>{children}</div>}</div>
    </div>
  );
}
/* Checkbox in the same family as the inputs: recessed box, brand green with a white tick when on. */
export const Checkbox = ({ className, ...p }: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>) => (
  <input type="checkbox" {...p}
    className={cn('peer size-4 shrink-0 appearance-none rounded-[5px] border border-input-border bg-input shadow-[var(--input-shadow)] transition-[background-color,border-color,box-shadow] duration-150',
      'hover:border-ring/70 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand/20 disabled:cursor-not-allowed disabled:opacity-50',
      "checked:border-brand checked:bg-brand checked:bg-[url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='white' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m4 8.5 2.5 2.5L12 5.5'/%3E%3C/svg%3E\")] checked:bg-center checked:bg-no-repeat",
      className)} />
);
/* Words as removable chips: type and press Enter (or a comma) to add, Backspace on empty removes the last. */
export function TagInput({ value, onChange, placeholder, disabled, label }: { value: string[]; onChange: (v: string[]) => void; placeholder?: string; disabled?: boolean; label: string }) {
  const [draft, setDraft] = useState('');
  const add = (raw: string) => {
    const next = [...value];
    for (const part of raw.split(',')) {
      const t = part.trim();
      if (t && !next.some((v) => v.toLowerCase() === t.toLowerCase())) next.push(t);
    }
    if (next.length !== value.length) onChange(next);
    setDraft('');
  };
  return (
    <div className={cn('flex min-h-9 flex-wrap items-center gap-1.5 rounded-lg border border-input-border bg-input p-1.5 shadow-[var(--input-shadow)] transition-[border-color,box-shadow] duration-150',
      'hover:border-ring/70 focus-within:border-brand/70 focus-within:ring-[3px] focus-within:ring-brand/20', disabled && 'pointer-events-none opacity-60')}>
      {value.map((v) => (
        <span key={v} className="animate-rise inline-flex items-center gap-0.5 rounded-md border bg-muted/60 py-0.5 pl-2 pr-0.5 text-[13px]">
          {v}
          <button type="button" aria-label={`Remove ${v}`} onClick={() => onChange(value.filter((x) => x !== v))} className="rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground"><X className="size-3" /></button>
        </span>
      ))}
      <input aria-label={label} value={draft} disabled={disabled} placeholder={value.length ? 'Add…' : placeholder}
        onChange={(e) => (e.target.value.includes(',') ? add(e.target.value) : setDraft(e.target.value))}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); add(draft); }
          else if (e.key === 'Backspace' && !draft && value.length) onChange(value.slice(0, -1));
        }}
        onBlur={() => draft && add(draft)}
        className="h-6 min-w-24 flex-1 bg-transparent px-1.5 text-sm outline-none placeholder:text-muted-foreground/60" />
    </div>
  );
}

/* Placeholder bars that shimmer while something is being worked out. */
export const Skeleton = ({ className }: { className?: string }) => <div className={cn('shimmer rounded-md', className)} aria-hidden />;

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
      <span key={theme} className="animate-pop block">{theme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}</span>
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
          <div key={t.id} className="animate-toast-in pointer-events-auto flex items-center gap-2 rounded-lg border bg-card px-3.5 py-2.5 text-sm shadow-xl">
            {t.tone === 'success' ? <CheckCircle2 className="size-4 text-success" /> : <AlertCircle className="size-4 text-danger" />}
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
