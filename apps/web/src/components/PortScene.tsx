'use client';

import { motion } from 'framer-motion';

export function PortScene() {
  return (
    <div className="relative">
      <svg width="120" height="140" viewBox="0 0 120 140">
        {/* Dock/pier */}
        <rect x="0" y="100" width="120" height="40" fill="#78350f" />
        <rect x="0" y="100" width="120" height="8" fill="#92400e" />
        
        {/* Dock posts */}
        <rect x="10" y="90" width="8" height="50" fill="#451a03" />
        <rect x="50" y="90" width="8" height="50" fill="#451a03" />
        <rect x="100" y="90" width="8" height="50" fill="#451a03" />
        
        {/* Crane */}
        <rect x="70" y="20" width="6" height="80" fill="#64748b" />
        <rect x="40" y="20" width="50" height="6" fill="#64748b" />
        <line x1="50" y1="26" x2="50" y2="60" stroke="#94a3b8" strokeWidth="2" />
        
        {/* Crane hook */}
        <motion.g
          animate={{ y: [0, 10, 0] }}
          transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
        >
          <line x1="50" y1="60" x2="50" y2="75" stroke="#94a3b8" strokeWidth="2" />
          <path d="M45,75 Q50,82 55,75" stroke="#fbbf24" strokeWidth="3" fill="none" />
        </motion.g>
        
        {/* Cargo crates */}
        <motion.g
          animate={{ opacity: [1, 0.5, 1] }}
          transition={{ duration: 2, repeat: Infinity }}
        >
          <rect x="15" y="75" width="20" height="20" fill="#3b82f6" rx="2" />
          <text x="25" y="88" textAnchor="middle" fill="white" fontSize="8">📦</text>
        </motion.g>
        
        <rect x="40" y="80" width="18" height="18" fill="#8b5cf6" rx="2" />
        <rect x="20" y="60" width="15" height="15" fill="#10b981" rx="2" />
        
        {/* Git tag label */}
        <motion.g
          initial={{ x: -30, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ duration: 1, repeat: Infinity, repeatDelay: 3 }}
        >
          <rect x="5" y="45" width="35" height="14" fill="#1e293b" rx="3" />
          <text x="22" y="55" textAnchor="middle" fill="#22d3ee" fontSize="7" fontFamily="monospace">v1.2.0</text>
        </motion.g>
      </svg>
      
      {/* Label */}
      <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-center">
        <span className="text-slate-400 text-xs">Your Repo</span>
      </div>
    </div>
  );
}
