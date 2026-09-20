'use client';

import Link from 'next/link';

export default function ChangelogError({ reset }: { reset: () => void }) {
  return (
    <main className="min-h-screen bg-white flex items-center justify-center p-6">
      <div className="max-w-md text-center">
        <h1 className="text-2xl font-bold text-navy-900">We couldn&apos;t load this changelog</h1>
        <p className="mt-3 text-navy-600">The service may be temporarily unavailable. Please try again.</p>
        <button onClick={reset} className="mt-6 rounded-lg bg-teal-600 px-5 py-3 font-medium text-white hover:bg-teal-700">Try again</button>
        <Link href="/" className="mt-4 block text-sm text-navy-600 hover:underline">Go to ShipLog</Link>
      </div>
    </main>
  );
}
