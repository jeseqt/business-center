import React, { useId } from 'react';

interface LambertCoinProps {
  className?: string;
  size?: number;
  variant?: 'gold' | 'brand' | 'silver' | 'plain';
}

export function LambertCoin({ className = '', size = 24, variant = 'gold' }: LambertCoinProps) {
  const uniqueId = useId();
  const getGradientId = (name: string) => `${name}-${uniqueId.replace(/:/g, '')}`;

  // Color configuration
  const styles = {
    gold: {
      gradientStart: '#F59E0B', // amber-500
      gradientEnd: '#D97706',   // amber-600
      stroke: '#B45309',        // amber-700
      fill: `url(#${getGradientId('gradient-gold')})`,
      border: '#FCD34D',        // amber-300
    },
    brand: {
      gradientStart: '#6366F1', // indigo-500
      gradientEnd: '#4F46E5',   // indigo-600
      stroke: '#3730A3',        // indigo-800
      fill: `url(#${getGradientId('gradient-brand')})`,
      border: '#A5B4FC',        // indigo-300
    },
    silver: {
      gradientStart: '#94A3B8', // slate-400
      gradientEnd: '#64748B',   // slate-500
      stroke: '#475569',        // slate-600
      fill: `url(#${getGradientId('gradient-silver')})`,
      border: '#CBD5E1',        // slate-300
    },
    plain: {
      gradientStart: 'currentColor',
      gradientEnd: 'currentColor',
      stroke: 'currentColor',
      fill: 'currentColor',
      border: 'currentColor',
    }
  };

  const style = styles[variant];

  return (
    <svg 
      width={size} 
      height={size} 
      viewBox="0 0 24 24" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <defs>
        {variant !== 'plain' && (
          <>
            <linearGradient id={getGradientId('gradient-gold')} x1="2" y1="2" x2="22" y2="22" gradientUnits="userSpaceOnUse">
              <stop stopColor="#FDE68A" offset="0%" />
              <stop stopColor="#F59E0B" offset="50%" />
              <stop stopColor="#B45309" offset="100%" />
            </linearGradient>
            <linearGradient id={getGradientId('gradient-brand')} x1="2" y1="2" x2="22" y2="22" gradientUnits="userSpaceOnUse">
              <stop stopColor="#A5B4FC" offset="0%" />
              <stop stopColor="#6366F1" offset="50%" />
              <stop stopColor="#4338CA" offset="100%" />
            </linearGradient>
            <linearGradient id={getGradientId('gradient-silver')} x1="2" y1="2" x2="22" y2="22" gradientUnits="userSpaceOnUse">
              <stop stopColor="#E2E8F0" offset="0%" />
              <stop stopColor="#94A3B8" offset="50%" />
              <stop stopColor="#475569" offset="100%" />
            </linearGradient>
            
            {/* Gloss effect */}
            <linearGradient id={getGradientId('gloss')} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="white" stopOpacity="0.4" />
              <stop offset="100%" stopColor="white" stopOpacity="0" />
            </linearGradient>
          </>
        )}
      </defs>

      {/* Outer Ring / Base */}
      <circle 
        cx="12" 
        cy="12" 
        r="10" 
        fill={style.fill} 
        stroke={variant === 'plain' ? 'none' : style.border}
        strokeWidth={variant === 'plain' ? 0 : 0.5}
      />
      
      {/* Gloss/Reflection (Top Half) */}
      {variant !== 'plain' && (
        <path
          d="M12 2C6.48 2 2 6.48 2 12C2 13.5 2.33 14.92 2.92 16.21C4.37 13.1 7.48 11 11 11C15.5 11 19.28 14.16 20.48 18.35C21.44 16.48 22 14.31 22 12C22 6.48 17.52 2 12 2Z"
          fill={`url(#${getGradientId('gloss')})`}
          opacity="0.3"
        />
      )}

      {/* Inner Ring Detail */}
      <circle cx="12" cy="12" r="7.5" stroke="white" strokeOpacity="0.3" strokeWidth="0.5" strokeDasharray="1 1" />

      {/* The "L" Symbol */}
      {/* Stylized L: Sharp, modern, slightly italic */}
      <path
        d="M9.5 7C9.22386 7 9 7.22386 9 7.5V15.5C9 16.3284 9.67157 17 10.5 17H15.5C15.7761 17 16 16.7761 16 16.5C16 16.2239 15.7761 16 15.5 16H11C10.4477 16 10 15.5523 10 15V7.5C10 7.22386 9.77614 7 9.5 7Z"
        fill="white"
        stroke="white"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      
      {/* Sparkle/Accent */}
      <path 
        d="M16 6L16.5 7.5L18 8L16.5 8.5L16 10L15.5 8.5L14 8L15.5 7.5L16 6Z" 
        fill="white" 
      />
    </svg>
  );
}
