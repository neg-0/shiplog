'use client';

import { motion } from 'framer-motion';

interface ShipProps {
  color: string;
  label: string;
  delay?: number;
  isAnimating?: boolean;
}

export function Ship({ color, label, delay = 0, isAnimating = false }: ShipProps) {
  return (
    <motion.div
      className="relative"
      initial={{ x: 0, opacity: 1 }}
      animate={isAnimating ? { x: 400, opacity: 0 } : { x: 0, opacity: 1 }}
      transition={{ duration: 2, delay, ease: 'easeInOut' }}
    >
      <svg width="80" height="60" viewBox="0 0 80 60" className="drop-shadow-lg">
        {/* Hull */}
        <path
          d="M10,40 L15,55 L65,55 L70,40 L60,40 L55,50 L25,50 L20,40 Z"
          fill={color}
        />
        {/* Deck */}
        <rect x="20" y="30" width="40" height="12" fill={color} opacity="0.8" rx="2" />
        {/* Cabin */}
        <rect x="35" y="18" width="15" height="14" fill="#1e293b" rx="2" />
        {/* Smokestack */}
        <rect x="40" y="8" width="6" height="12" fill="#475569" rx="1" />
        {/* Smoke */}
        <motion.circle
          cx="43"
          cy="4"
          r="3"
          fill="#94a3b8"
          opacity="0.6"
          animate={{ y: [-2, -8], opacity: [0.6, 0] }}
          transition={{ duration: 1.5, repeat: Infinity }}
        />
        {/* Flag */}
        <rect x="52" y="12" width="1" height="20" fill="#64748b" />
        <path d="M53,12 L63,16 L53,20 Z" fill={color} />
      </svg>
      <span className="absolute -bottom-4 left-1/2 -translate-x-1/2 text-xs text-teal-300 whitespace-nowrap">
        {label}
      </span>
    </motion.div>
  );
}
