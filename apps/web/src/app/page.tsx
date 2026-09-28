'use client';

import Link from 'next/link';
import { ArrowDown, ArrowRight, Check, GitBranch, Globe, Pause, Play, Ship, Slack } from 'lucide-react';
import { useEffect, useState } from 'react';
import { isAuthenticated } from '../lib/api';
import Harbor from '../components/landing/Harbor';
import Plans from '../components/landing/Plans';
import styles from '../components/landing/landing.module.css';

const audiences = [
  { name: 'Customers', eyebrow: 'THE BENEFIT, WITHOUT THE JARGON', title: 'Your reports. Ready to go.', body: 'Export your reports as PDFs and share them with anyone. We also fixed a timeout so large CSV exports finish more reliably.', destination: 'Your public changelog' },
  { name: 'Developers', eyebrow: 'THE DETAILS THAT MATTER', title: 'PDF export is here.', body: 'Added PDF report export. Fixed a timeout affecting CSV exports above 10,000 rows. Existing export formats are unchanged.', destination: 'Your engineering channel' },
  { name: 'Stakeholders', eyebrow: 'WHAT SHIPPED. WHY IT MATTERS.', title: 'Less friction in reporting.', body: 'Teams can now share reports outside the product as PDFs. A fix to large CSV exports also improves reporting reliability.', destination: 'Your team’s release channel' },
];

export default function Home() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [paused, setPaused] = useState(false);
  const [audience, setAudience] = useState(0);
  useEffect(() => { setLoggedIn(isAuthenticated()); }, []);
  const destination = loggedIn ? '/dashboard' : '/login';
  const example = audiences[audience]!;

  return (
    <div className={styles.page}>
      <a href="#main" className={styles.skip}>Skip to content</a>
      <header className={styles.header}>
        <Link href="/" className={styles.brand} aria-label="ShipLog home"><Ship size={27} strokeWidth={1.7} />ShipLog</Link>
        <nav aria-label="Main navigation" className={styles.nav}>
          <Link href="#how-it-works" className={styles.desktopLink}>How it works</Link>
          <Link href="#pricing">Pricing</Link>
          <Link href="/docs" className={styles.desktopLink}>Docs</Link>
          <Link href={destination} className={styles.navCta}>{loggedIn ? 'Dashboard' : 'Get started'} <ArrowRight size={15} /></Link>
        </nav>
      </header>

      <main id="main">
        <section className={styles.hero} aria-labelledby="hero-heading">
          <div className={styles.chart}>
            <div className={styles.chartTop}><span><i /> A WORKING RELEASE HARBOR</span><span>EST. FOR BUILDERS</span></div>
            <Harbor paused={paused} />
            <div className={styles.chartBottom}><span>FROM YOUR REPO TO YOUR PEOPLE</span><button type="button" onClick={() => setPaused(!paused)} aria-label={paused ? 'Play harbor animation' : 'Pause harbor animation'} aria-pressed={paused}>{paused ? <Play size={12} /> : <Pause size={12} />} {paused ? 'Play' : 'Pause'}</button></div>
          </div>
          <div className={styles.heroCopy}>
            <p className={styles.eyebrow}><span /> GOOD WORK DESERVES A PROPER SEND-OFF.</p>
            <h1 id="hero-heading">You ship code.<br />We get the<br /><em>word out.</em></h1>
            <p className={styles.lede}>Turn GitHub releases into updates your customers, developers, and stakeholders can actually use.</p>
            <p className={styles.heroDetail}>Three tailored drafts. One review. Delivered where your people already are.</p>
            <Link href={destination} className={styles.primary}>{loggedIn ? 'Open your dashboard' : 'Connect GitHub — start free'}<ArrowRight size={18} /></Link>
            <p className={styles.ctaNote}>One repository free. A 14-day Pro trial when you upgrade.</p>
            <a href="#example" className={styles.textLink}>Take a look at the cargo <ArrowDown size={14} /></a>
          </div>
        </section>

        <div className={styles.channelStrip}><span>YOUR RELEASE. A WIDER REACH.</span><div><GitBranch size={18} /> GitHub <span className={styles.stripArrow}>→</span> <Slack size={18} /> Slack <span className={styles.separator}>/</span> <span className={styles.discordMark}>◒</span> Discord <span className={styles.separator}>/</span> <Globe size={18} /> Hosted changelog</div></div>

        <section id="example" className={styles.example} aria-labelledby="example-heading">
          <div className={styles.sectionIntro}><p className={styles.eyebrow}>01 / SAME RELEASE. DIFFERENT READERS.</p><h2 id="example-heading">Not everyone<br /> speaks <em>commit.</em></h2><p>Your customers want the benefit. Your developers need the details. Your stakeholders need the bigger picture. Give each of them the right version.</p></div>
          <div className={styles.exampleBoard}>
            <div className={styles.source}><div><GitBranch size={15} /> acme / reports <span>v1.8.0</span></div><code><span>+ feat:</span> add PDF report export<br /><span>+ fix:</span> CSV export timeout above 10k rows<br /><span>↳</span> existing export formats unchanged</code></div>
            <div className={styles.manifest}><div className={styles.manifestHeader}><span>OUTBOUND MANIFEST</span><span>03 AUDIENCES</span></div><div className={styles.tabs} aria-label="Example audience">{audiences.map((item, index) => <button key={item.name} type="button" aria-pressed={audience === index} onClick={() => setAudience(index)}>{item.name}</button>)}</div><div className={styles.note} aria-live="polite"><p>{example.eyebrow}</p><h3>{example.title}</h3><div>{example.body}</div></div><div className={styles.manifestFoot}><span><Check size={14} /> Ready for your review</span><span>{example.destination}</span></div></div>
            <p className={styles.exampleCaption}>Illustrative example. You review and edit the drafts before publishing.</p>
          </div>
        </section>

        <section id="how-it-works" className={styles.process} aria-labelledby="process-heading">
          <div className={styles.processIntro}><p className={styles.eyebrow}>02 / A SHORT ROUTE TO PUBLISHED.</p><h2 id="process-heading">Keep building.<br />We’ll handle the draft.</h2></div>
          <div className={styles.steps}>{[{ n: '01', title: 'Bring your repository.', text: 'Sign in with GitHub, connect a repository you administer, and import an existing release or your next one.' }, { n: '02', title: 'Give it your voice.', text: 'Generate drafts for three audiences. Check the details, edit the wording, and decide what is ready to share.' }, { n: '03', title: 'Send it on its way.', text: 'Publish to your hosted changelog and connected Slack or Discord channels. Keep a record of each delivery.' }].map(step => <div key={step.n}><span>{step.n}</span><h3>{step.title}</h3><p>{step.text}</p></div>)}</div>
        </section>

        <section id="pricing" className={styles.pricing} aria-labelledby="pricing-heading">
          <div className={styles.pricingIntro}><div><p className={styles.eyebrow}>03 / ROOM TO GROW.</p><h2 id="pricing-heading">Start with one ship.<br /><em>Build your fleet.</em></h2></div><p>Keep one repository on Free.<br />Start a 14-day Pro trial from Settings when you upgrade.</p></div>
          <Plans loggedIn={loggedIn} /><Link href="/pricing" className={styles.pricingDetails}>Compare plans and billing details <ArrowRight size={14} /></Link>
        </section>

        <section className={styles.closing}><div><p className={styles.eyebrow}>NEXT RELEASE, BETTER RECEIVED.</p><h2>You did the hard part.<br /><em>Let people know.</em></h2></div><div><Link href={destination} className={styles.primary}>{loggedIn ? 'Open your dashboard' : 'Bring your first repository'}<ArrowRight size={18} /></Link><p>Connect GitHub. Find your release. Make it readable.</p></div></section>
      </main>
      <footer className={styles.footer}><Link href="/" className={styles.brand}><Ship size={24} strokeWidth={1.7} />ShipLog</Link><p>A proper send-off for the things you build.</p><nav aria-label="Footer navigation"><Link href="/docs">Docs</Link><Link href="/changelog">Changelog</Link><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link></nav><small>© {new Date().getFullYear()} ShipLog</small></footer>
    </div>
  );
}
