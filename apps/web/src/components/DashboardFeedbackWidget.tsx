"use client";

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { MessageSquare, X, Send, Bug, Lightbulb, MessageCircle } from 'lucide-react';

export function DashboardFeedbackWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [type, setType] = useState<'bug' | 'feature' | 'other'>('other');
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState(''); // Optional, or pre-filled if we had auth context here
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);
  const pathname = usePathname();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;

    setSending(true);
    setFeedbackError(null);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          message,
          email,
          page: pathname,
        }),
      });

      if (res.ok) {
        setSent(true);
        setTimeout(() => {
          setIsOpen(false);
          setSent(false);
          setMessage('');
          setEmail('');
          setType('other');
        }, 3000);
      } else {
        setFeedbackError('Failed to send feedback. Please try again.');
      }
    } catch {
      setFeedbackError('Failed to send feedback. Please try again.');
    } finally {
      setSending(false);
    }
  };

  if (isOpen) {
    return (
      <div className="fixed bottom-4 right-4 z-50 w-80 bg-white dark:bg-zinc-900 rounded-lg shadow-xl border border-gray-200 dark:border-zinc-800 p-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100">Send Feedback</h3>
          <button 
            onClick={() => setIsOpen(false)}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {sent ? (
          <div className="text-center py-8 text-green-600 dark:text-green-400">
            <Send className="w-8 h-8 mx-auto mb-2" />
            <p>Thanks for your feedback!</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                What's on your mind?
              </label>
              <div className="flex gap-2 mb-2">
                <button
                  type="button"
                  onClick={() => setType('bug')}
                  className={`flex-1 flex flex-col items-center p-2 rounded border ${type === 'bug' ? 'border-red-500 bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300' : 'border-gray-200 hover:bg-gray-50 dark:border-zinc-700 dark:hover:bg-zinc-800'}`}
                >
                  <Bug className="w-4 h-4 mb-1" />
                  <span className="text-xs">Bug</span>
                </button>
                <button
                  type="button"
                  onClick={() => setType('feature')}
                  className={`flex-1 flex flex-col items-center p-2 rounded border ${type === 'feature' ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300' : 'border-gray-200 hover:bg-gray-50 dark:border-zinc-700 dark:hover:bg-zinc-800'}`}
                >
                  <Lightbulb className="w-4 h-4 mb-1" />
                  <span className="text-xs">Idea</span>
                </button>
                <button
                  type="button"
                  onClick={() => setType('other')}
                  className={`flex-1 flex flex-col items-center p-2 rounded border ${type === 'other' ? 'border-gray-500 bg-gray-50 text-gray-700 dark:bg-zinc-800 dark:text-gray-300' : 'border-gray-200 hover:bg-gray-50 dark:border-zinc-700 dark:hover:bg-zinc-800'}`}
                >
                  <MessageCircle className="w-4 h-4 mb-1" />
                  <span className="text-xs">Other</span>
                </button>
              </div>
            </div>

            <div>
              <textarea
                required
                className="w-full rounded-md border-gray-300 dark:border-zinc-700 dark:bg-zinc-950 shadow-sm focus:border-teal-500 focus:ring-teal-500 text-sm p-2 border"
                rows={3}
                placeholder="Tell us what you think..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />
            </div>
            
            <div>
              <input
                type="email"
                className="w-full rounded-md border-gray-300 dark:border-zinc-700 dark:bg-zinc-950 shadow-sm focus:border-teal-500 focus:ring-teal-500 text-sm p-2 border"
                placeholder="Email (optional)"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            {feedbackError && (
              <p className="text-sm text-red-600">{feedbackError}</p>
            )}

            <button
              type="submit"
              disabled={sending}
              className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-teal-600 hover:bg-teal-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-teal-500 disabled:opacity-50"
            >
              {sending ? 'Sending...' : 'Send Feedback'}
            </button>
          </form>
        )}
      </div>
    );
  }

  return (
    <button
      onClick={() => setIsOpen(true)}
      className="fixed bottom-4 right-4 z-50 bg-teal-600 text-white hover:bg-teal-700 shadow-lg rounded-full p-3 transition-colors md:px-4 md:py-2 md:flex md:items-center md:gap-2"
    >
      <MessageSquare className="w-5 h-5" />
      <span className="hidden md:inline font-medium">Feedback</span>
    </button>
  );
}
