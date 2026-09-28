import { ArrowRight, Ship } from 'lucide-react';
import Link from 'next/link';
import Plans from '../../components/landing/Plans';
import styles from '../../components/landing/landing.module.css';

export const metadata = { title: 'Pricing | ShipLog', alternates: { canonical: '/pricing' } };

export default function PricingPage() {
  return <div className={styles.page}>
    <header className={styles.header}><Link href="/" className={styles.brand} aria-label="ShipLog home"><Ship size={27} />ShipLog</Link><nav aria-label="Main navigation" className={styles.nav}><Link href="/docs">Docs</Link><Link href="/" className={styles.desktopLink}>How it works</Link><Link href="/login" className={styles.navCta}>Log in <ArrowRight size={15} /></Link></nav></header>
    <main>
      <section className={styles.pricing} aria-labelledby="pricing-heading"><div className={styles.pricingIntro}><div><p className={styles.eyebrow}>A PLAN FOR YOUR SHIPPING RHYTHM.</p><h1 id="pricing-heading" className={styles.pricingTitle}>Start with one ship.<br /><em>Build your fleet.</em></h1></div><p>One repository is free.<br />Start a 14-day Pro trial from Settings when you upgrade.</p></div><Plans /><p className={styles.billingNote}>The Pro trial starts at checkout, not when you connect GitHub. After 14 days, Pro is $29/month unless you cancel before the trial ends. Team is $79/month with no automatic trial; choose it in Settings. Team collaboration tools are still in development.</p></section>
      <section className={styles.pricingFaq} aria-labelledby="pricing-questions"><p className={styles.eyebrow}>BEFORE YOU COME ABOARD.</p><h2 id="pricing-questions">A few practical details.</h2><div><article><h3>What can I do for free?</h3><p>Connect one repository, import a GitHub release, manually generate your drafts, and publish a hosted changelog after reviewing it.</p></article><article><h3>When does my trial start?</h3><p>Create your account with GitHub, then upgrade to Pro in dashboard Settings. Eligible accounts receive 14 days free at checkout. Signing in alone does not start a trial.</p></article><article><h3>Will ShipLog publish without me?</h3><p>You review and publish your notes. Pro can generate drafts automatically from new releases when you enable it for a repository.</p></article><article><h3>Where can I send my updates?</h3><p>Every plan includes a hosted changelog. Pro adds delivery to connected Slack and Discord channels when you publish.</p></article></div></section>
      <section className={styles.closing}><div><p className={styles.eyebrow}>YOUR NEXT RELEASE IS A GOOD PLACE TO START.</p><h2>Good work.<br /><em>Worth sharing.</em></h2></div><div><Link href="/login" className={styles.primary}>Connect GitHub — start free<ArrowRight size={18} /></Link><p>Start with one repository and an existing release.</p></div></section>
    </main><footer className={styles.footer}><Link href="/" className={styles.brand}><Ship size={24} />ShipLog</Link><p>A proper send-off for the things you build.</p><nav aria-label="Footer navigation"><Link href="/docs">Docs</Link><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link></nav></footer>
  </div>;
}
