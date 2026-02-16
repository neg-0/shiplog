"use client";

import { useState } from 'react';
import { MessageSquare, X, Send } from 'lucide-react';

interface FeedbackWidgetProps {
  repoId: string;
  repoName: string;
}

export function FeedbackWidget({ repoId, repoName }: FeedbackWidgetProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!feedback.trim()) return;

    setSending(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/public/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoId, feedback, email, source: 'widget' }),
      });
      
      if (res.ok) {
        setSent(true);
        setTimeout(() => {
          setIsOpen(false);
          setSent(false);
          setFeedback('');
          setEmail('');
        }, 3000);
      }
    } catch (err) {
      console.error('Failed to send feedback', err);
    } finally {
      setSending(false);
    }
  };

  if (isOpen) {
    return (
      <div className="fixed bottom-4 right-4 z-50 w-80 bg-white rounded-lg shadow-xl border border-gray-200 p-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-semibold text-gray-900">Feedback for {repoName}</h3>
          <button 
            onClick={() => setIsOpen(false)}
            className="text-gray-500 hover:text-gray-700 p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {sent ? (
          <div className="text-center py-8 text-green-600">
            <Send className="w-8 h-8 mx-auto mb-2" />
            <p>Thanks for your feedback!</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Your Feedback
              </label>
              <textarea
                required
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-teal-500 focus:ring-teal-500 text-sm p-2 border"
                rows={3}
                placeholder="What can we improve?"
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email (optional)
              </label>
              <input
                type="email"
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-teal-500 focus:ring-teal-500 text-sm p-2 border"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

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
      className="fixed bottom-4 right-4 z-50 bg-white text-gray-600 hover:text-gray-900 border border-gray-200 shadow-lg rounded-full px-4 py-2 flex items-center gap-2 text-sm font-medium transition-colors hover:border-gray-300"
    >
      <MessageSquare className="w-4 h-4" />
      Feedback
    </button>
  );
}
