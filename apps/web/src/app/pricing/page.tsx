import { Check, GitBranch, Ship } from 'lucide-react';
import Link from 'next/link';

type Plan = {
  name: string;
  price: string;
  period?: string;
  description: string;
  trial?: string;
  features: string[];
  cta: string;
  href: string;
  highlighted: boolean;
};

const plans: Plan[] = [
  {
    name: 'Free',
    price: '$0',
    description: 'For side projects',
    features: ['1 repo', 'Manual trigger', 'Hosted changelog'],
    cta: 'Get Started',
    href: '/login',
    highlighted: false,
  },
  {
    name: 'Pro',
    price: '$29',
    period: '/mo',
    description: 'For growing teams',
    trial: '14-day free trial',
    features: ['5 repos', 'Auto-trigger on release', 'Slack + Discord', 'Email digests', 'Edit before publish'],
    cta: 'Start Free Trial',
    href: '/login',
    highlighted: true,
  },
  {
    name: 'Team',
    price: '$79',
    period: '/mo',
    description: 'For scaling orgs',
    features: ['Unlimited repos', 'Everything in Pro', 'Custom branding', 'API access', 'Priority support'],
    cta: 'Contact Us',
    href: 'mailto:hello@shiplog.io',
    highlighted: false,
  },
];

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-white">
      <header className="fixed top-0 w-full bg-white/80 backdrop-blur-md border-b border-navy-100 z-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <Link href="/" className="flex items-center gap-2">
              <Ship className="w-7 h-7 text-teal-600" />
              <span className="text-lg font-bold text-navy-900">ShipLog</span>
            </Link>
            <nav className="flex items-center gap-6">
              <Link href="/docs" className="text-navy-600 hover:text-navy-900 transition text-sm">Docs</Link>
              <Link href="/changelog" className="text-navy-600 hover:text-navy-900 transition text-sm">Changelog</Link>
              <Link href="/pricing" className="text-navy-900 font-medium transition text-sm">Pricing</Link>
              <Link href="/login" className="bg-navy-900 text-white px-4 py-2 rounded-lg hover:bg-navy-800 transition text-sm">Login</Link>
            </nav>
          </div>
        </div>
      </header>

      <main className="pt-24 pb-16">
        <section className="py-12">
          <div className="max-w-6xl mx-auto px-4 text-center">
            <h1 className="text-4xl md:text-5xl font-bold text-navy-900 mb-4">Simple pricing</h1>
            <p className="text-xl text-navy-600 max-w-2xl mx-auto mb-12">
              Start free. Upgrade when you need more. Every plan helps your release notes ship faster with less manual rewriting.
            </p>

            <div className="grid md:grid-cols-3 gap-6">
              {plans.map((plan) => (
                <div
                  key={plan.name}
                  className={`rounded-2xl p-6 text-left ${
                    plan.highlighted
                      ? 'bg-navy-900 text-white ring-4 ring-teal-500 scale-105'
                      : 'bg-white border border-navy-200'
                  }`}
                >
                  <h2 className={`text-lg font-semibold ${plan.highlighted ? 'text-teal-400' : 'text-navy-600'}`}>
                    {plan.name}
                  </h2>
                  <div className="mt-2 mb-4">
                    <span className="text-4xl font-bold">{plan.price}</span>
                    {plan.period && (
                      <span className={plan.highlighted ? 'text-navy-300' : 'text-navy-500'}>{plan.period}</span>
                    )}
                  </div>
                  <p className={`text-sm mb-6 ${plan.highlighted ? 'text-navy-300' : 'text-navy-500'}`}>
                    {plan.description}
                  </p>
                  {plan.trial && (
                    <div className="mb-4 inline-block bg-teal-500/20 text-teal-400 text-xs font-semibold px-3 py-1 rounded-full">
                      ✨ {plan.trial}
                    </div>
                  )}
                  <ul className="space-y-3 mb-6">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-center gap-2">
                        <Check className={`w-4 h-4 ${plan.highlighted ? 'text-teal-400' : 'text-teal-600'}`} />
                        <span className={plan.highlighted ? 'text-navy-100' : 'text-navy-700'}>{feature}</span>
                      </li>
                    ))}
                  </ul>
                  {plan.href.startsWith('mailto:') ? (
                    <a
                      href={plan.href}
                      className={`block text-center w-full py-3 rounded-lg font-semibold transition ${
                        plan.highlighted
                          ? 'bg-teal-500 text-white hover:bg-teal-400'
                          : 'bg-navy-100 text-navy-900 hover:bg-navy-200'
                      }`}
                    >
                      {plan.cta}
                    </a>
                  ) : (
                    <Link
                      href={plan.href}
                      className={`block text-center w-full py-3 rounded-lg font-semibold transition ${
                        plan.highlighted
                          ? 'bg-teal-500 text-white hover:bg-teal-400'
                          : 'bg-navy-100 text-navy-900 hover:bg-navy-200'
                      }`}
                    >
                      {plan.cta}
                    </Link>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="py-20 bg-gradient-to-br from-navy-900 to-navy-950 text-white">
          <div className="max-w-4xl mx-auto px-4 text-center">
            <Ship className="w-16 h-16 mx-auto mb-6 text-teal-400" />
            <h2 className="text-3xl font-bold mb-4">Ready to ship your release notes?</h2>
            <p className="text-navy-300 mb-8 max-w-xl mx-auto">
              Connect your GitHub repo in under 2 minutes. Your next release will write itself.
            </p>
            <Link
              href="/login"
              className="inline-flex items-center gap-2 bg-teal-500 text-white px-8 py-4 rounded-xl text-lg font-semibold hover:bg-teal-400 transition shadow-lg"
            >
              <GitBranch className="w-5 h-5" />
              Connect GitHub — It&apos;s Free
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}
