'use client';

import { X } from 'lucide-react';
import { useEffect, useCallback } from 'react';

interface DialogProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  variant?: 'default' | 'danger';
}

export function Dialog({ isOpen, onClose, title, children, variant = 'default' }: DialogProps) {
  const handleEscape = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  }, [onClose]);

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, handleEscape]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Dialog */}
      <div className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden">
        {/* Header */}
        <div className={`px-6 py-4 border-b ${variant === 'danger' ? 'bg-red-50 border-red-100' : 'bg-navy-50 border-navy-100'}`}>
          <div className="flex items-center justify-between">
            <h2 className={`text-lg font-semibold ${variant === 'danger' ? 'text-red-900' : 'text-navy-900'}`}>
              {title}
            </h2>
            <button
              onClick={onClose}
              className="p-1 rounded-lg hover:bg-navy-100 transition"
            >
              <X className="w-5 h-5 text-navy-500" />
            </button>
          </div>
        </div>
        
        {/* Content */}
        <div className="px-6 py-4">
          {children}
        </div>
      </div>
    </div>
  );
}

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
    <Dialog isOpen={isOpen} onClose={onClose} title={title} variant={variant}>
      <p className="text-navy-600 mb-6">{message}</p>
      <div className="flex gap-3 justify-end">
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
            <svg className="animate-spin h-4 w-4\" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          )}
          {confirmText}
        </button>
      </div>
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
    <Dialog isOpen={isOpen} onClose={onClose} title={title}>
      <div className={`p-4 rounded-lg mb-4 ${variantStyles[variant]}`}>
        <p>{message}</p>
      </div>
      <div className="flex justify-end">
        <button
          onClick={onClose}
          className="px-4 py-2 rounded-lg bg-navy-900 text-white hover:bg-navy-800 transition"
        >
          OK
        </button>
      </div>
    </Dialog>
  );
}
