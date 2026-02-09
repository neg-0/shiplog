'use client';

import { useState } from 'react';
import { MessageSquare, X, Send, Loader2, CheckCircle2 } from 'lucide-react';
import { apiFetch } from '../lib/api';

export function FeedbackWidget({ userEmail }: { userEmail?: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState(userEmail || '');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || !email.trim()) return;

    try {
      setStatus('loading');
      await apiFetch('/feedback', {
        method: 'POST',
        body: JSON.stringify({ email, message }),
      });
      setStatus('success');
      setMessage('');
      setTimeout(() => {
        setIsOpen(false);
        setStatus('idle');
      }, 2000);
    } catch (err) {
      setStatus('error');
      setErrorMessage(err instanceof Error ? err.message : 'Failed to send feedback');
    }
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 p-4 bg-teal-600 text-white rounded-full shadow-lg hover:bg-teal-500 transition-all hover:scale-110 z-50 group"
        title="Send feedback"
      >
        <MessageSquare className="w-6 h-6" />
        <span className="absolute right-full mr-3 px-2 py-1 bg-navy-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
          Send Feedback
        </span>
      </button>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 w-80 sm:w-96 bg-white rounded-2xl shadow-2xl border border-navy-100 z-50 overflow-hidden flex flex-col animate-in slide-in-from-bottom-4 duration-300">
      {/* Header */}
      <div className="bg-navy-900 p-4 text-white flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-teal-400" />
          <span className="font-semibold">Feedback</span>
        </div>
        <button 
          onClick={() => setIsOpen(false)}
          className="p-1 hover:bg-navy-800 rounded transition"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Body */}
      <div className="p-4">
        {status === 'success' ? (
          <div className="py-8 text-center">
            <CheckCircle2 className="w-12 h-12 text-teal-500 mx-auto mb-3" />
            <h3 className="font-semibold text-navy-900">Thank you!</h3>
            <p className="text-navy-500 text-sm">Your feedback helps us build a better ShipLog.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-navy-500 uppercase tracking-wider mb-1">
                Your Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                className="w-full px-3 py-2 bg-navy-50 border border-navy-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 text-navy-900"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-navy-500 uppercase tracking-wider mb-1">
                How can we improve?
              </label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Tell us what's on your mind..."
                required
                rows={4}
                className="w-full px-3 py-2 bg-navy-50 border border-navy-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 text-navy-900 resize-none"
              />
            </div>

            {status === 'error' && (
              <p className="text-xs text-red-500 bg-red-50 p-2 rounded">{errorMessage}</p>
            )}

            <button
              type="submit"
              disabled={status === 'loading'}
              className="w-full bg-teal-600 text-white py-2 rounded-lg font-medium hover:bg-teal-500 transition flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {status === 'loading' ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
              Send Feedback
            </button>
          </form>
        )}
      </div>

      <div className="p-3 bg-navy-50 border-t border-navy-100 text-center text-[10px] text-navy-400">
        Captain 🚢 is listening.
      </div>
    </div>
  );
}
