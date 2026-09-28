import Link from 'next/link';
import { ArrowRight, Check } from 'lucide-react';
import styles from './landing.module.css';

const plans = [
  { name: 'Free', price: '$0', desc: 'For the project you’re proud of.', features: ['1 repository', 'Manual release generation', 'Hosted changelog'] },
  { name: 'Pro', price: '$29', desc: 'For a steady shipping rhythm.', features: ['5 repositories', 'Opt-in automatic release drafts', 'Slack + Discord delivery', 'Edit before you publish'] },
  { name: 'Team', price: '$79', desc: 'For products with many repositories.', features: ['Unlimited repositories', 'Everything in Pro', 'Branding options by request'] },
];

export default function Plans({ loggedIn = false }: { loggedIn?: boolean }) {
  return <div className={styles.plans}>{plans.map(plan => {
    const href = loggedIn ? plan.name === 'Free' ? '/dashboard' : '/dashboard/settings' : '/login';
    const cta = plan.name === 'Team' ? 'Explore Team' : plan.name === 'Pro' ? loggedIn ? 'Upgrade to Pro' : 'Start free, explore Pro' : 'Start free';
    return <article key={plan.name} className={plan.name === 'Pro' ? styles.proPlan : styles.plan}><div className={styles.planName}>{plan.name}{plan.name === 'Pro' && <span>14 DAYS FREE</span>}</div><p className={styles.price}>{plan.price}<span>/ month</span></p><p className={styles.planDescription}>{plan.desc}</p><ul>{plan.features.map(feature => <li key={feature}><Check size={15} />{feature}</li>)}</ul><Link href={href} className={styles.planCta}>{cta}<ArrowRight size={16} /></Link></article>;
  })}</div>;
}
