'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { PortScene } from './PortScene';
import { Lighthouse } from './Lighthouse';
import { Ship } from './Ship';
import { WaveBackground } from './WaveBackground';

interface AnimatedHeroProps {
  onCtaClick?: () => void;
}

export function AnimatedHero({ onCtaClick }: AnimatedHeroProps) {
  const [isAnimating, setIsAnimating] = useState(false);
  const [cycleKey, setCycleKey] = useState(0);

  const triggerAnimation = () => {
    setIsAnimating(true);
    // Reset after animation completes for loop
    setTimeout(() => {
      setIsAnimating(false);
      setCycleKey(k => k + 1);
    }, 4000);
  };

  // Auto-loop the animation
  useEffect(() => {
    const interval = setInterval(() => {
      triggerAnimation();
    }, 6000);
    return () => clearInterval(interval);
  }, []);

  const handleClick = () => {
    triggerAnimation();
    onCtaClick?.();
  };

  return (
    <div className="relative min-h-[500px] bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 overflow-hidden">
      {/* Stars background */}
      <div className="absolute inset-0">
        {[...Array(50)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute w-1 h-1 bg-white rounded-full"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 60}%`,
            }}
            animate={{ opacity: [0.2, 0.8, 0.2] }}
            transition={{ duration: 2 + Math.random() * 2, repeat: Infinity, delay: Math.random() * 2 }}
          />
        ))}
      </div>

      {/* Main scene container */}
      <div className="relative z-10 flex items-end justify-center gap-8 pt-20 pb-40">
        {/* Port (left) */}
        <motion.div
          initial={{ opacity: 0, x: -50 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.8 }}
        >
          <PortScene />
        </motion.div>

        {/* Lighthouse (center) */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="mx-8"
        >
          <Lighthouse isActive={isAnimating} />
        </motion.div>

        {/* Ships (right) */}
        <motion.div
          key={cycleKey}
          initial={{ opacity: 0, x: 50 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.8, delay: 0.4 }}
          className="flex flex-col gap-4"
        >
          <Ship color="#7c3aed" label="Slack" delay={0} isAnimating={isAnimating} />
          <Ship color="#3b82f6" label="Discord" delay={0.3} isAnimating={isAnimating} />
          <Ship color="#10b981" label="Email" delay={0.6} isAnimating={isAnimating} />
        </motion.div>
      </div>

      {/* CTA Button */}
      <div className="absolute bottom-32 left-1/2 -translate-x-1/2 z-20">
        <button
          onClick={handleClick}
          className="bg-teal-500 hover:bg-teal-400 text-white font-semibold px-6 py-3 rounded-lg transition-all hover:scale-105 flex items-center gap-2"
        >
          See it in action
          <span className="animate-pulse">→</span>
        </button>
      </div>

      {/* Waves */}
      <WaveBackground />
    </div>
  );
}
