import { Ship, GitBranch } from 'lucide-react';
import Link from 'next/link';

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-navy-50 to-navy-100 flex items-center justify-center p-4">
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
    </div>
  );
}
