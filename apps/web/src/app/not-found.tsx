import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen py-12 px-4 bg-navy-50 text-center">
      <h2 className="text-4xl font-bold text-navy-900 mb-4">404</h2>
      <p className="text-xl text-navy-600 mb-8">Page not found</p>
      <Link 
        href="/" 
        className="bg-teal-600 text-white px-6 py-3 rounded-lg hover:bg-teal-500 transition font-medium"
      >
        Return Home
      </Link>
    </div>
  );
}