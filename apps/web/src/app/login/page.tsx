'use client';

import { Ship, GitBranch, Key } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { setToken } from '../../lib/api';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const showDemo = searchParams.get('demo') === 'true';
  const [loading, setLoading] = useState(false);

  const handleDemoLogin = async () => {
    const token = prompt('Enter Demo Access Token:');
    if (!token) return;

    setLoading(true);
    try {
      // The demo endpoint is handled by next.config.js rewrite or direct API call
      // In this repo, /api is rewritten to the API server
      const res = await fetch('/api/auth/demo', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Demo-Token': token,
        },
      });

      if (!res.ok) {
        alert('Invalid token or unauthorized');
        setLoading(false);
        return;
      }

      const data = await res.json();
      setToken(data.token);
      router.push('/dashboard');
    } catch (err) {
      console.error(err);
      alert('Login failed');
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-md">
      <div className="text-center mb-8">
        <div className="flex items-center justify-center gap-2 mb-4">
          <Ship className="w-10 h-10 text-teal-600" />
          <span className="text-2xl font-bold text-navy-900">ShipLog</span>
        </div>
        <h1 className="text-xl font-semibold text-navy-900 mb-2">
          Welcome aboard
        </h1>
        <p className="text-navy-600">
          Connect your GitHub to get started
        </p>
      </div>

      <a 
        href="/api/auth/github"
        className="w-full bg-navy-900 text-white py-4 px-6 rounded-xl font-semibold hover:bg-navy-800 transition flex items-center justify-center gap-3"
      >
        <GitBranch className="w-5 h-5" />
        Continue with GitHub
      </a>

      {showDemo && (
        <button
          onClick={handleDemoLogin}
          disabled={loading}
          className="w-full mt-4 bg-gray-100 text-navy-900 py-4 px-6 rounded-xl font-semibold hover:bg-gray-200 transition flex items-center justify-center gap-3"
        >
          <Key className="w-5 h-5 text-gray-500" />
          {loading ? 'Logging in...' : 'Demo Login'}
        </button>
      )}

      <div className="mt-6 text-center">
        <p className="text-sm text-navy-500">
          By continuing, you agree to our{' '}
          <Link href="/terms" className="text-teal-600 hover:underline">
            Terms of Service
          </Link>{' '}
          and{' '}
          <Link href="/privacy" className="text-teal-600 hover:underline">
            Privacy Policy
          </Link>
        </p>
      </div>

      <div className="mt-8 pt-6 border-t border-navy-100">
        <h3 className="text-sm font-medium text-navy-900 mb-3">What we'll access:</h3>
        <ul className="space-y-2 text-sm text-navy-600">
          <li className="flex items-center gap-2">
            <span className="w-2 h-2 bg-teal-500 rounded-full" />
            Read access to your repositories
          </li>
          <li className="flex items-center gap-2">
            <span className="w-2 h-2 bg-teal-500 rounded-full" />
            Webhook creation for release events
          </li>
          <li className="flex items-center gap-2">
            <span className="w-2 h-2 bg-teal-500 rounded-full" />
            Your GitHub profile (name, email)
          </li>
        </ul>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-navy-50 to-navy-100 flex items-center justify-center p-4">
      <Suspense fallback={<div>Loading...</div>}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
