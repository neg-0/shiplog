'use client';

import { useState } from 'react';
import { MessageSquare, X, Send, Loader2 } from 'lucide-react';

export default function FeedbackWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!feedback.trim()) return;

    setSending(true);
    
    // Simulate sending feedback (TODO: Wire to API)
    await new Promise(resolve => setTimeout(resolve, 800));
    
    setSending(false);
    setSent(true);
    setFeedback('');
    
    setTimeout(() => {
      setSent(false);
      setIsOpen(false);
    }, 2000);
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-50 bg-white border border-navy-200 text-navy-600 p-3 rounded-full shadow-lg hover:bg-navy-50 hover:text-navy-900 transition flex items-center gap-2 group"
      >
        <MessageSquare className="w-5 h-5 text-teal-600 group-hover:scale-110 transition-transform" />
        <span className="font-medium text-sm hidden group-hover:block transition-all duration-300">Feedback</span>
      </button>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 animate-in slide-in-from-bottom-2 duration-300">
      <div className="bg-white rounded-xl shadow-2xl border border-navy-100 w-80 overflow-hidden">
        <div className="bg-navy-50 p-4 border-b border-navy-100 flex justify-between items-center">
          <h3 className="font-semibold text-navy-900 flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-teal-600" />
            Send Feedback
          </h3>
          <button 
            onClick={() => setIsOpen(false)}
            className="text-navy-400 hover:text-navy-600 p-1 rounded-full hover:bg-navy-100 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        
        <div className="p-4">
          {sent ? (
            <div className="text-center py-8">
              <div className="bg-teal-50 w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3">
                <Send className="w-6 h-6 text-teal-600" />
              </div>
              <h4 className="font-medium text-navy-900 mb-1">Thanks!</h4>
              <p className="text-sm text-navy-500">Your feedback helps us improve.</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <textarea
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                className="w-full bg-navy-50 border border-navy-200 rounded-lg p-3 text-sm text-navy-900 placeholder:text-navy-400 mb-3 focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none resize-none transition-all"
                placeholder="What do you think? Any bugs or ideas?"
                rows={4}
                autoFocus
              />
              <button
                type="submit"
                disabled={sending || !feedback.trim()}
                className="w-full bg-navy-900 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-navy-800 transition flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {sending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Sending...</span>
                  </>
                ) : (
                  <>
                    <span>Send Feedback</span>
                    <Send className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
