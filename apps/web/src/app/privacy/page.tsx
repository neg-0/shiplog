import StaticPageLayout from '../../components/StaticPageLayout';

export const metadata = {
  title: 'Privacy Policy | ShipLog',
  description: 'ShipLog Privacy Policy - how we collect, use, and protect your data.',
};

export default function PrivacyPage() {
  return (
    <StaticPageLayout>
      <article className="prose prose-navy max-w-none">
        <h1 className="text-3xl font-bold text-navy-900 mb-2">Privacy Policy</h1>
        <p className="text-navy-500 mb-8">Last updated: February 2026</p>

        <section className="mb-8">
          <h2 className="text-xl font-bold text-navy-900 mb-4">1. Information We Collect</h2>
          
          <h3 className="text-lg font-semibold text-navy-800 mb-2">Account Information</h3>
          <p className="text-navy-600 mb-4">
            When you sign up, we collect your GitHub username, email address, and profile information 
            provided by GitHub OAuth.
          </p>

          <h3 className="text-lg font-semibold text-navy-800 mb-2">Repository Data</h3>
          <p className="text-navy-600 mb-4">
            We access your GitHub repositories (with your permission) to read commits, pull requests, 
            and releases for generating release notes.
          </p>

          <h3 className="text-lg font-semibold text-navy-800 mb-2">Usage Data</h3>
          <p className="text-navy-600">
            We collect information about how you use the Service, including pages visited, 
            features used, and actions taken.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-bold text-navy-900 mb-4">2. How We Use Information</h2>
          <ul className="list-disc pl-6 text-navy-600 space-y-2">
            <li>To provide and maintain the Service</li>
            <li>To generate AI-powered release notes from your repositories</li>
            <li>To process payments and manage subscriptions</li>
            <li>To send important service updates and notifications</li>
            <li>To improve and optimize the Service</li>
            <li>To respond to support requests</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-bold text-navy-900 mb-4">3. Data Sharing</h2>
          <p className="text-navy-600 mb-4">
            <strong>We do not sell your data.</strong> We only share data with:
          </p>
          <ul className="list-disc pl-6 text-navy-600 space-y-2">
            <li><strong>Service Providers:</strong> Payment processors (Stripe), hosting (Vercel, Railway), and AI providers (OpenAI) necessary to operate the Service.</li>
            <li><strong>Legal Requirements:</strong> When required by law or to protect our rights.</li>
            <li><strong>With Your Consent:</strong> When you explicitly authorize sharing.</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-bold text-navy-900 mb-4">4. Data Retention</h2>
          <p className="text-navy-600">
            We retain your data for as long as your account is active. When you delete your account, 
            we delete your data within 30 days, except where we are required to retain it for legal 
            or regulatory purposes.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-bold text-navy-900 mb-4">5. Security</h2>
          <p className="text-navy-600">
            We implement industry-standard security measures to protect your data, including:
          </p>
          <ul className="list-disc pl-6 text-navy-600 space-y-2 mt-4">
            <li>Encryption in transit (HTTPS/TLS)</li>
            <li>Encryption at rest for sensitive data</li>
            <li>Regular security audits</li>
            <li>Access controls and authentication</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-bold text-navy-900 mb-4">6. Your Rights</h2>
          <p className="text-navy-600 mb-4">You have the right to:</p>
          <ul className="list-disc pl-6 text-navy-600 space-y-2">
            <li><strong>Access:</strong> Request a copy of your data.</li>
            <li><strong>Correction:</strong> Request correction of inaccurate data.</li>
            <li><strong>Deletion:</strong> Request deletion of your data.</li>
            <li><strong>Portability:</strong> Request your data in a machine-readable format.</li>
            <li><strong>Objection:</strong> Object to certain processing of your data.</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-bold text-navy-900 mb-4">7. Cookies</h2>
          <p className="text-navy-600">
            We use essential cookies to maintain your session and preferences. We do not use 
            tracking cookies for advertising purposes.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-bold text-navy-900 mb-4">8. Children&apos;s Privacy</h2>
          <p className="text-navy-600">
            The Service is not intended for children under 18. We do not knowingly collect 
            information from children under 18.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-bold text-navy-900 mb-4">9. Changes to This Policy</h2>
          <p className="text-navy-600">
            We may update this policy from time to time. We will notify you of material changes 
            via email or through the Service.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-bold text-navy-900 mb-4">10. Contact</h2>
          <p className="text-navy-600">
            Questions about privacy? Contact us at{' '}
            <a href="mailto:privacy@shiplog.io" className="text-teal-600 hover:underline">
              privacy@shiplog.io
            </a>
          </p>
        </section>
      </article>
    </StaticPageLayout>
  );
}
