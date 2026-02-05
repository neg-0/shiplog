'use client';

import Link from 'next/link';
import { Ship, GitBranch, Users, Mail, Slack, Zap, ArrowRight, Check } from 'lucide-react';
import { createCheckoutSession, isAuthenticated } from '../lib/api';

export default function Home() {
  const handleCheckout = async (plan: 'pro' | 'team') => {
    if (!isAuthenticated()) {
      window.location.href = '/login';
      return;
    }

    const session = await createCheckoutSession(plan);
    if (session.url) {
      window.location.href = session.url;
    }
  };

  return (
    <div className="min-h-screen">
      {/* Navigation */}
      <nav className="fixed top-0 w-full bg-white/80 backdrop-blur-md border-b border-navy-100 z-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-2">
              <Ship className="w-8 h-8 text-teal-600" />
              <span className="text-xl font-bold text-navy-900">ShipLog</span>
            </div>
            <div className="flex items-center gap-6">
              <Link href="#features" className="text-navy-600 hover:text-navy-900 transition">
                Features
              </Link>
              <Link href="#pricing" className="text-navy-600 hover:text-navy-900 transition">
                Pricing
              </Link>
              <Link 
                href="/login" 
                className="bg-navy-900 text-white px-4 py-2 rounded-lg hover:bg-navy-800 transition flex items-center gap-2"
              >
                <GitBranch className="w-4 h-4" />
                Connect GitHub
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-teal-50 text-teal-700 px-4 py-2 rounded-full text-sm font-medium mb-6">
            <Zap className="w-4 h-4" />
            Set and forget release notes
          </div>
          <h1 className="text-5xl sm:text-6xl font-bold text-navy-900 mb-6 leading-tight">
            Release notes that{' '}
            <span className="text-teal-600">ship themselves</span>
          </h1>
          <p className="text-xl text-navy-600 mb-8 max-w-2xl mx-auto">
            One release. Three audiences. Zero effort.
            <br />
            Automatically generate changelogs tailored for customers, developers, and stakeholders.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link 
              href="/login"
              className="bg-navy-900 text-white px-8 py-4 rounded-xl text-lg font-semibold hover:bg-navy-800 transition flex items-center justify-center gap-2 shadow-lg shadow-navy-900/20"
            >
              <GitBranch className="w-5 h-5" />
              Connect GitHub — Free
            </Link>
            <Link 
              href="#demo"
              className="bg-white text-navy-900 px-8 py-4 rounded-xl text-lg font-semibold hover:bg-navy-50 transition border-2 border-navy-200 flex items-center justify-center gap-2"
            >
              See it in action
              <ArrowRight className="w-5 h-5" />
            </Link>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-20 bg-navy-950 text-white">
        <div className="max-w-6xl mx-auto px-4">
          <h2 className="text-3xl font-bold text-center mb-4">How it works</h2>
          <p className="text-navy-300 text-center mb-12 max-w-2xl mx-auto">
            Connect your GitHub repo once. We handle the rest.
          </p>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                step: '1',
                title: 'Connect GitHub',
                description: 'One-click OAuth. Select your repos. Done in under 2 minutes.',
              },
              {
                step: '2',
                title: 'Publish a release',
                description: 'Tag your release like normal. We detect it automatically.',
              },
              {
                step: '3',
                title: 'Notes ship everywhere',
                description: 'Customer, dev, and exec versions land in Slack, Discord, Email, and your changelog page.',
              },
            ].map((item) => (
              <div key={item.step} className="text-center">
                <div className="w-12 h-12 bg-teal-600 rounded-full flex items-center justify-center text-xl font-bold mx-auto mb-4">
                  {item.step}
                </div>
                <h3 className="text-xl font-semibold mb-2">{item.title}</h3>
                <p className="text-navy-300">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Three Audiences */}
      <section id="features" className="py-20">
        <div className="max-w-6xl mx-auto px-4">
          <h2 className="text-3xl font-bold text-center text-navy-900 mb-4">
            Three audiences, three formats
          </h2>
          <p className="text-navy-600 text-center mb-12 max-w-2xl mx-auto">
            The same release, reframed for each stakeholder. No more rewriting.
          </p>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                icon: Users,
                title: 'Customer Changelog',
                color: 'teal',
                description: 'Benefit-driven, jargon-free updates your users will actually read.',
                example: '"You can now export reports to PDF in one click"',
              },
              {
                icon: GitBranch,
                title: 'Developer Changelog',
                color: 'navy',
                description: 'Technical details, breaking changes, migration notes.',
                example: '"BREAKING: API v1 deprecated. See migration guide."',
              },
              {
                icon: Mail,
                title: 'Stakeholder Brief',
                color: 'amber',
                description: 'Executive summary with shipped vs planned and business impact.',
                example: '"Q1 goal 80% complete. Key feature shipped ahead of schedule."',
              },
            ].map((item) => (
              <div 
                key={item.title} 
                className="bg-white rounded-2xl p-6 shadow-lg border border-navy-100 hover:shadow-xl transition"
              >
                <div className={`w-12 h-12 bg-${item.color}-100 rounded-xl flex items-center justify-center mb-4`}>
                  <item.icon className={`w-6 h-6 text-${item.color}-600`} />
                </div>
                <h3 className="text-xl font-semibold text-navy-900 mb-2">{item.title}</h3>
                <p className="text-navy-600 mb-4">{item.description}</p>
                <p className="text-sm text-navy-400 italic">"{item.example}"</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Distribution Channels */}
      <section className="py-20 bg-navy-50">
        <div className="max-w-6xl mx-auto px-4">
          <h2 className="text-3xl font-bold text-center text-navy-900 mb-4">
            Delivered to every port
          </h2>
          <p className="text-navy-600 text-center mb-12 max-w-2xl mx-auto">
            Your release notes land where your team already lives.
          </p>
          <div className="flex flex-wrap justify-center gap-6">
            {[
              { name: 'Slack', icon: Slack },
              { name: 'Discord', icon: Users },
              { name: 'Email', icon: Mail },
              { name: 'Hosted Page', icon: Ship },
            ].map((channel) => (
              <div 
                key={channel.name}
                className="bg-white px-8 py-6 rounded-xl shadow-md flex items-center gap-4 border border-navy-100"
              >
                <channel.icon className="w-8 h-8 text-navy-600" />
                <span className="text-lg font-medium text-navy-900">{channel.name}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-20">
        <div className="max-w-4xl mx-auto px-4">
          <h2 className="text-3xl font-bold text-center text-navy-900 mb-4">
            Simple pricing
          </h2>
          <p className="text-navy-600 text-center mb-12">
            Start free. Upgrade when you need more.
          </p>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                name: 'Free',
                price: '$0',
                description: 'For side projects',
                features: ['1 repo', 'Manual trigger', 'Hosted changelog'],
                cta: 'Get Started',
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
                highlighted: true,
              },
              {
                name: 'Team',
                price: '$79',
                period: '/mo',
                description: 'For scaling orgs',
                features: ['Unlimited repos', 'Everything in Pro', 'Custom branding', 'API access', 'Priority support'],
                cta: 'Contact Us',
                highlighted: false,
              },
            ].map((plan) => (
              <div 
                key={plan.name}
                className={`rounded-2xl p-6 ${
                  plan.highlighted 
                    ? 'bg-navy-900 text-white ring-4 ring-teal-500 scale-105' 
                    : 'bg-white border border-navy-200'
                }`}
              >
                <h3 className={`text-lg font-semibold ${plan.highlighted ? 'text-teal-400' : 'text-navy-600'}`}>
                  {plan.name}
                </h3>
                <div className="mt-2 mb-4">
                  <span className="text-4xl font-bold">{plan.price}</span>
                  {plan.period && <span className={plan.highlighted ? 'text-navy-300' : 'text-navy-500'}>{plan.period}</span>}
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
                {plan.name === 'Pro' ? (
                  <button
                    onClick={() => handleCheckout('pro')}
                    className={`w-full py-3 rounded-lg font-semibold transition ${
                      plan.highlighted 
                        ? 'bg-teal-500 text-white hover:bg-teal-400' 
                        : 'bg-navy-100 text-navy-900 hover:bg-navy-200'
                    }`}
                  >
                    {plan.cta}
                  </button>
                ) : plan.name === 'Team' ? (
                  <a
                    href="mailto:hello@shiplog.io"
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
                    href="/login"
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

      {/* CTA */}
      <section className="py-20 bg-gradient-to-br from-navy-900 to-navy-950 text-white">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <Ship className="w-16 h-16 mx-auto mb-6 text-teal-400" />
          <h2 className="text-3xl font-bold mb-4">
            Ready to ship your release notes?
          </h2>
          <p className="text-navy-300 mb-8 max-w-xl mx-auto">
            Connect your GitHub repo in under 2 minutes. Your next release will write itself.
          </p>
          <Link 
            href="/login"
            className="inline-flex items-center gap-2 bg-teal-500 text-white px-8 py-4 rounded-xl text-lg font-semibold hover:bg-teal-400 transition shadow-lg"
          >
            <GitBranch className="w-5 h-5" />
            Connect GitHub — It's Free
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 bg-navy-950 text-navy-400">
        <div className="max-w-6xl mx-auto px-4">
          <div className="flex flex-col md:flex-row justify-between items-center gap-6">
            <div className="flex items-center gap-2">
              <Ship className="w-6 h-6 text-teal-500" />
              <span className="text-white font-semibold">ShipLog</span>
            </div>
            <div className="flex gap-6 text-sm">
              <Link href="/docs" className="hover:text-white transition">Docs</Link>
              <Link href="/changelog" className="hover:text-white transition">Changelog</Link>
              <Link href="/privacy" className="hover:text-white transition">Privacy</Link>
              <Link href="/terms" className="hover:text-white transition">Terms</Link>
            </div>
            <p className="text-sm">© 2026 ShipLog. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
