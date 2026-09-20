'use client';

import { X } from 'lucide-react';
import * as React from 'react';
import { useEffect, useRef, useId } from 'react';

// ============================================
// Modern (Radix-style) Exports
// ============================================

const DialogContext = React.createContext<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  titleId: string;
} | null>(null);

export function Dialog({ open, onOpenChange, children }: { open?: boolean; onOpenChange?: (open: boolean) => void; children: React.ReactNode }) {
  const titleId = useId();
  if (typeof open !== 'undefined' && onOpenChange) {
    return (
      <DialogContext.Provider value={{ open, onOpenChange, titleId }}>
        {children}
      </DialogContext.Provider>
    );
  }
  return null;
}

export function DialogContent({ children, className }: { children: React.ReactNode; className?: string }) {
  const context = React.useContext(DialogContext);
  const contentRef = useRef<HTMLDivElement>(null);
  const onOpenChange = useRef(context?.onOpenChange);
  onOpenChange.current = context?.onOpenChange;

  useEffect(() => {
    if (!context?.open) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    const focusable = () => Array.from(contentRef.current?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]'
    ) || []);
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onOpenChange.current?.(false);
      if (e.key !== 'Tab') return;
      const items = focusable();
      const first = items[0];
      const last = items[items.length - 1];
      if (!first) {
        e.preventDefault();
        contentRef.current?.focus();
      } else if (e.shiftKey && (document.activeElement === first || document.activeElement === contentRef.current)) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';
    (focusable()[0] || contentRef.current)?.focus();
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [context?.open]);

  if (!context?.open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={() => context?.onOpenChange(false)}
      />
      <div ref={contentRef} role="dialog" aria-modal="true" aria-labelledby={context.titleId} tabIndex={-1} className={`relative bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[calc(100dvh-2rem)] overflow-y-auto ${className || ''}`}>
        {children}
      </div>
    </div>
  );
}

export function DialogHeader({ children }: { children: React.ReactNode }) {
  const context = React.useContext(DialogContext);
  return (
    <div className="flex items-start justify-between p-6 border-b border-navy-100">
      <div className="space-y-1 text-left w-full">
        {children}
      </div>
      <button
        type="button"
        aria-label="Close dialog"
        onClick={() => context?.onOpenChange(false)}
        className="text-navy-400 hover:text-navy-600 transition -mt-2 -mr-2 p-2"
      >
        <X className="w-5 h-5" />
      </button>
    </div>
  );
}

export function DialogTitle({ children }: { children: React.ReactNode }) {
  const context = React.useContext(DialogContext);
  return <h2 id={context?.titleId} className="text-lg font-semibold text-navy-900">{children}</h2>;
}

export function DialogDescription({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-navy-500 mt-1">{children}</p>;
}

export function DialogFooter({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2 p-6 border-t border-navy-100 bg-navy-50/50">
      {children}
    </div>
  );
}

// ============================================
// Legacy Helpers (Confirm/Alert)
// ============================================

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'default' | 'danger';
  loading?: boolean;
}

export function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'default',
  loading = false,
}: ConfirmDialogProps) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && !loading && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="p-6">
          <p className="text-navy-600">{message}</p>
        </div>
        <DialogFooter>
          <button
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 rounded-lg border border-navy-200 text-navy-700 hover:bg-navy-50 transition disabled:opacity-50"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className={`px-4 py-2 rounded-lg text-white transition disabled:opacity-50 flex items-center gap-2 ${
              variant === 'danger' 
                ? 'bg-red-600 hover:bg-red-700' 
                : 'bg-teal-600 hover:bg-teal-700'
            }`}
          >
            {loading && (
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            )}
            {confirmText}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface AlertDialogProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  message: string;
  variant?: 'success' | 'error' | 'info';
}

export function AlertDialog({
  isOpen,
  onClose,
  title,
  message,
  variant = 'info',
}: AlertDialogProps) {
  const variantStyles = {
    success: 'bg-green-50 border-green-100 text-green-900',
    error: 'bg-red-50 border-red-100 text-red-900',
    info: 'bg-navy-50 border-navy-100 text-navy-900',
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className={`mx-6 mt-2 p-4 rounded-lg ${variantStyles[variant]}`}>
          <p>{message}</p>
        </div>
        <DialogFooter>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-navy-900 text-white hover:bg-navy-800 transition"
          >
            OK
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
