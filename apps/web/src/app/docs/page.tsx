import StaticPageLayout from '../../components/StaticPageLayout';
import { BookOpen, Zap, Users, MessageSquare, GitBranch, HelpCircle } from 'lucide-react';

export const metadata = {
  title: 'Documentation | ShipLog',
  description: 'Learn how to use ShipLog to generate AI-powered release notes for your software.',
};

export default function DocsPage() {
  return (
    <StaticPageLayout>
      <article className="prose prose-navy max-w-none">
        <h1 className="text-3xl font-bold text-navy-900 mb-2">Documentation</h1>
        <p className="text-lg text-navy-600 mb-8">
          Everything you need to get started with ShipLog.
        </p>

        {/* Getting Started */}
        <section className="mb-12">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-teal-100 rounded-lg flex items-center justify-center">
              <Zap className="w-5 h-5 text-teal-600" />
            </div>
            <h2 className="text-2xl font-bold text-navy-900 m-0">Getting Started</h2>
          </div>
          
          <div className="bg-navy-50 rounded-xl p-6 space-y-4">
            <div>
              <h3 className="font-semibold text-navy-900 mb-2">1. Connect Your GitHub Repository</h3>
              <p className="text-navy-600">
                Click "Connect GitHub" and authorize ShipLog to access your repositories. 
                Select the repos you want to generate release notes for.
              </p>
            </div>
            
            <div>
              <h3 className="font-semibold text-navy-900 mb-2">2. Configure Audiences</h3>
              <p className="text-navy-600">
                By default, ShipLog generates notes for three audiences: Developers, Customers, and Stakeholders.
                Pro users can create custom audiences with tailored prompts.
              </p>
            </div>
            
            <div>
              <h3 className="font-semibold text-navy-900 mb-2">3. Publish a Release</h3>
              <p className="text-navy-600">
                When you create a release on GitHub, ShipLog automatically generates release notes 
                for each configured audience. View and edit them in your dashboard.
              </p>
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="mb-12">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-teal-100 rounded-lg flex items-center justify-center">
              <BookOpen className="w-5 h-5 text-teal-600" />
            </div>
            <h2 className="text-2xl font-bold text-navy-900 m-0">Features</h2>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-white border border-navy-100 rounded-xl p-5">
              <h3 className="font-semibold text-navy-900 mb-2 flex items-center gap-2">
                <GitBranch className="w-4 h-4 text-teal-600" />
                GitHub Integration
              </h3>
              <p className="text-navy-600 text-sm">
                Automatically triggered when you publish a release. Works with public and private repos.
              </p>
            </div>

            <div className="bg-white border border-navy-100 rounded-xl p-5">
              <h3 className="font-semibold text-navy-900 mb-2 flex items-center gap-2">
                <Users className="w-4 h-4 text-teal-600" />
                Multiple Audiences
              </h3>
              <p className="text-navy-600 text-sm">
                Generate different notes for developers, customers, and stakeholders from the same release.
              </p>
            </div>

            <div className="bg-white border border-navy-100 rounded-xl p-5">
              <h3 className="font-semibold text-navy-900 mb-2 flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-teal-600" />
                Slack & Discord
              </h3>
              <p className="text-navy-600 text-sm">
                Set up webhooks to automatically post release notes to your team channels.
              </p>
            </div>

            <div className="bg-white border border-navy-100 rounded-xl p-5">
              <h3 className="font-semibold text-navy-900 mb-2 flex items-center gap-2">
                <Zap className="w-4 h-4 text-teal-600" />
                AI-Powered
              </h3>
              <p className="text-navy-600 text-sm">
                Uses advanced AI to analyze your commits and PRs, generating human-readable summaries.
              </p>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="mb-12">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-teal-100 rounded-lg flex items-center justify-center">
              <HelpCircle className="w-5 h-5 text-teal-600" />
            </div>
            <h2 className="text-2xl font-bold text-navy-900 m-0">FAQ</h2>
          </div>

          <div className="space-y-6">
            <div>
              <h3 className="font-semibold text-navy-900 mb-2">How does ShipLog work?</h3>
              <p className="text-navy-600">
                When you publish a GitHub release, ShipLog receives a webhook, analyzes the commits 
                and PRs since the last release, and uses AI to generate audience-appropriate summaries.
              </p>
            </div>

            <div>
              <h3 className="font-semibold text-navy-900 mb-2">What AI model do you use?</h3>
              <p className="text-navy-600">
                We use GPT-4o-mini for fast, cost-effective generation. The model is optimized for 
                understanding code changes and producing clear, concise release notes.
              </p>
            </div>

            <div>
              <h3 className="font-semibold text-navy-900 mb-2">Can I customize the prompts?</h3>
              <p className="text-navy-600">
                Pro and Team users can create custom audiences with their own prompts, allowing you 
                to tailor the output for specific use cases like investor updates or support docs.
              </p>
            </div>

            <div>
              <h3 className="font-semibold text-navy-900 mb-2">How do I share my changelog?</h3>
              <p className="text-navy-600">
                Each repo has a public changelog page at shiplog.io/c/your-repo. You can share this 
                link, embed it on your site, or use our API to build custom integrations.
              </p>
            </div>
          </div>
        </section>
      </article>
    </StaticPageLayout>
  );
}
