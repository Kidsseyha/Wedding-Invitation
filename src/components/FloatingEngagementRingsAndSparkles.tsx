import React, { useMemo } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { buildEngagementParticles, EngagementParticle } from '../utils/engagementAnimation';

/**
 * 3/4-perspective 3D-shaded Luxury Solitaire Diamond Engagement Ring.
 * Features an elliptical 18k gold band with interior shadow recess, beveled rim highlight,
 * raised 4-prong cathedral basket, multi-faceted brilliant diamond, and a pulsing glint.
 */
const LuxurySolitaireRingSvg: React.FC<{ id: string; size: number }> = ({ id, size }) => {
  const outerGoldId = `eng-outer-gold-${id}`;
  const innerShadowId = `eng-inner-gold-${id}`;
  const rimHighlightId = `eng-rim-gold-${id}`;
  const diamondTopId = `eng-diamond-top-${id}`;
  const diamondPavilionId = `eng-diamond-pav-${id}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      className="filter drop-shadow-[0_4px_12px_rgba(245,184,15,0.48)]"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={outerGoldId} x1="14%" y1="15%" x2="86%" y2="85%">
          <stop offset="0%" stopColor="#fffbeb" />
          <stop offset="28%" stopColor="#fde68a" />
          <stop offset="62%" stopColor="#f59e0b" />
          <stop offset="100%" stopColor="#92400e" />
        </linearGradient>

        <linearGradient id={innerShadowId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#78350f" />
          <stop offset="50%" stopColor="#b45309" />
          <stop offset="100%" stopColor="#451a03" />
        </linearGradient>

        <linearGradient id={rimHighlightId} x1="0%" y1="50%" x2="100%" y2="50%">
          <stop offset="0%" stopColor="rgba(255,251,235,0.15)" />
          <stop offset="50%" stopColor="rgba(255,255,255,0.9)" />
          <stop offset="100%" stopColor="rgba(254,243,199,0.2)" />
        </linearGradient>

        <linearGradient id={diamondTopId} x1="20%" y1="0%" x2="85%" y2="100%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="45%" stopColor="#e0f2fe" />
          <stop offset="85%" stopColor="#bae6fd" />
          <stop offset="100%" stopColor="#fef9c3" />
        </linearGradient>

        <linearGradient id={diamondPavilionId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#f0f9ff" />
          <stop offset="55%" stopColor="#7dd3fc" />
          <stop offset="100%" stopColor="#38bdf8" />
        </linearGradient>
      </defs>

      <g transform="rotate(-16 32 34)">
        {/* Back/Interior Band Recess (creates 3D ring depth) */}
        <path
          d="M 15.5 34.5 A 16.5 11.2 0 1 1 48.5 34.5 A 16.5 11.2 0 1 1 15.5 34.5 Z
             M 20 34.8 A 12 7.6 0 1 0 44 34.8 A 12 7.6 0 1 0 20 34.8 Z"
          fill={`url(#${innerShadowId})`}
          fillRule="evenodd"
          opacity="0.92"
        />

        {/* Sculpted Outer 18k Gold Shank */}
        <path
          d="M 14.5 36.2 C 14.5 44.2 22.3 50.2 32 50.2 C 41.7 50.2 49.5 44.2 49.5 36.2
             C 49.5 30.8 45.8 26.2 40.2 23.9 L 38.6 26.8 C 42.6 28.5 45.2 31.8 45.2 35.6
             C 45.2 41.2 39.3 45.6 32 45.6 C 24.7 45.6 18.8 41.2 18.8 35.6
             C 18.8 31.8 21.4 28.5 25.4 26.8 L 23.8 23.9 C 18.2 26.2 14.5 30.8 14.5 36.2 Z"
          fill={`url(#${outerGoldId})`}
          stroke="#fef3c7"
          strokeWidth="0.65"
        />

        {/* Back Upper Band Arc Connecting to Basket */}
        <path
          d="M 22.8 25.4 C 25.6 23.8 28.7 23 32 23 C 35.3 23 38.4 23.8 41.2 25.4"
          stroke={`url(#${outerGoldId})`}
          strokeWidth="3.2"
          strokeLinecap="round"
          fill="none"
        />

        {/* Specular Metallic Rim Highlight on Front Band */}
        <path
          d="M 17.5 38.2 C 19.8 44.4 25.4 48 32 48 C 38.6 48 44.2 44.4 46.5 38.2"
          stroke={`url(#${rimHighlightId})`}
          strokeWidth="1.25"
          strokeLinecap="round"
          fill="none"
        />

        {/* Raised 4-Prong Cathedral Basket */}
        <path
          d="M 25.6 23.8 L 27.6 26.8 L 36.4 26.8 L 38.4 23.8 Z"
          fill={`url(#${outerGoldId})`}
          stroke="#78350f"
          strokeWidth="0.55"
          strokeLinejoin="round"
        />
        <path
          d="M 24.8 18.4 L 27.2 24.4 M 39.2 18.4 L 36.8 24.4 M 29.2 20.2 L 30.2 24.8 M 34.8 20.2 L 33.8 24.8"
          stroke="#fde68a"
          strokeWidth="1.2"
          strokeLinecap="round"
        />

        {/* Multi-Faceted Brilliant-Cut Solitaire Diamond */}
        {/* Lower Pavilion */}
        <path
          d="M 23.5 16.4 L 40.5 16.4 L 32 24.4 Z"
          fill={`url(#${diamondPavilionId})`}
          stroke="#e0f2fe"
          strokeWidth="0.65"
          strokeLinejoin="round"
        />
        {/* Upper Crown */}
        <path
          d="M 26.8 11.4 L 37.2 11.4 L 40.5 16.4 L 23.5 16.4 Z"
          fill={`url(#${diamondTopId})`}
          stroke="#ffffff"
          strokeWidth="0.7"
          strokeLinejoin="round"
        />
        {/* Internal Diamond Facets */}
        <path
          d="M 26.8 11.4 L 29.4 16.4 L 32 24.4 M 37.2 11.4 L 34.6 16.4 L 32 24.4 M 29.4 16.4 L 32 11.4 L 34.6 16.4"
          stroke="rgba(255,255,255,0.85)"
          strokeWidth="0.6"
          strokeLinejoin="round"
          fill="none"
        />
        {/* Crisp Table Specular Reflection */}
        <polygon points="29.1,12 34.9,12 36.3,14.8 27.7,14.8" fill="rgba(255,255,255,0.55)" />

        {/* Gold Prong Tips Gripping Diamond Girdle */}
        <circle cx="24.5" cy="17.2" r="1.15" fill="#fef3c7" stroke="#b45309" strokeWidth="0.45" />
        <circle cx="39.5" cy="17.2" r="1.15" fill="#fef3c7" stroke="#b45309" strokeWidth="0.45" />
        <circle cx="29.4" cy="18.1" r="0.95" fill="#fffbeb" stroke="#b45309" strokeWidth="0.4" />
        <circle cx="34.6" cy="18.1" r="0.95" fill="#fffbeb" stroke="#b45309" strokeWidth="0.4" />

        {/* Animated Starlight Glint on Diamond Crown */}
        <motion.g
          style={{ originX: '37.8px', originY: '11.4px' }}
          animate={{ scale: [0.65, 1.22, 0.72, 1.15, 0.65], opacity: [0.65, 1, 0.7, 0.98, 0.65] }}
          transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut' }}
        >
          <path
            d="M 37.8 6.8 L 38.6 10.6 L 42.4 11.4 L 38.6 12.2 L 37.8 16 L 37 12.2 L 33.2 11.4 L 37 10.6 Z"
            fill="#ffffff"
          />
          <circle cx="37.8" cy="11.4" r="1.2" fill="#fef9c3" />
        </motion.g>
      </g>
    </svg>
  );
};

/**
 * Delicate Khmer Jasmine Blossom (ផ្កាម្លិះ) with 5 ivory-cream petals and warm golden stamen.
 */
const JasmineBlossomSvg: React.FC<{ id: string; size: number }> = ({ id, size }) => {
  const petalGradId = `eng-jasmine-${id}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      className="filter drop-shadow-[0_2px_6px_rgba(0,0,0,0.2)]"
      aria-hidden="true"
    >
      <defs>
        <radialGradient id={petalGradId} cx="50%" cy="50%" r="55%">
          <stop offset="0%" stopColor="#fef9c3" />
          <stop offset="45%" stopColor="#fffbeb" />
          <stop offset="100%" stopColor="#fde68a" stopOpacity="0.88" />
        </radialGradient>
      </defs>
      {[0, 72, 144, 216, 288].map((angle) => (
        <path
          key={angle}
          transform={`rotate(${angle} 16 16)`}
          d="M16 14 C13.5 9.5 13.8 4.2 16 2.5 C18.2 4.2 18.5 9.5 16 14 Z"
          fill={`url(#${petalGradId})`}
          stroke="rgba(255,255,255,0.75)"
          strokeWidth="0.6"
        />
      ))}
      <circle cx="16" cy="16" r="2.6" fill="#f59e0b" />
      <circle cx="16" cy="16" r="1.3" fill="#fffbeb" />
    </svg>
  );
};

const EngagementPetalSvg: React.FC<{ id: string; size: number }> = ({ id, size }) => {
  const gradId = `eng-rose-${id}`;

  return (
    <svg
      width={size}
      height={size * 1.25}
      viewBox="0 0 24 30"
      fill="none"
      className="filter drop-shadow-[0_2px_5px_rgba(0,0,0,0.22)]"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradId} x1="20%" y1="0%" x2="80%" y2="100%">
          <stop offset="0%" stopColor="#fff1f2" stopOpacity="0.94" />
          <stop offset="55%" stopColor="#fda4af" stopOpacity="0.88" />
          <stop offset="100%" stopColor="#e11d48" stopOpacity="0.82" />
        </linearGradient>
      </defs>
      <path
        d="M12 2 C17 5 21 11 19.5 18.5 C18.2 24 14.5 27.5 12 28 C9.5 27.5 5.8 24 4.5 18.5 C3 11 7 5 12 2 Z"
        fill={`url(#${gradId})`}
        stroke="rgba(255,241,242,0.6)"
        strokeWidth="0.65"
      />
      <path
        d="M12 5 Q11.5 15 12 25"
        stroke="rgba(255,255,255,0.48)"
        strokeWidth="0.65"
        strokeLinecap="round"
      />
    </svg>
  );
};

const GoldenBokehOrb: React.FC<{ size: number }> = ({ size }) => (
  <div
    style={{
      width: size,
      height: size,
      borderRadius: '9999px',
      background:
        'radial-gradient(circle, rgba(255,251,235,0.95) 0%, rgba(253,224,71,0.62) 42%, rgba(245,158,11,0.16) 72%, rgba(245,158,11,0) 100%)',
      boxShadow: '0 0 12px rgba(251, 191, 36, 0.45)',
    }}
  />
);

const EngagementParticleNode: React.FC<{ particle: EngagementParticle }> = ({ particle }) => {
  const isRing = particle.kind === 'ring';
  const isBokeh = particle.kind === 'bokeh';
  const isPetal = particle.kind === 'petal-rose' || particle.kind === 'petal-jasmine';

  return (
    <motion.div
      className="absolute will-change-transform"
      style={{ left: `${particle.leftPct}%`, top: `${particle.fromTopPct}%` }}
      animate={{
        top: [`${particle.fromTopPct}%`, `${particle.toTopPct}%`],
        x: [0, particle.swayPx, -particle.swayPx * 0.6, particle.swayPx * 0.35, 0],
        rotate: isRing
          ? [particle.tiltFromDeg, particle.tiltToDeg, particle.tiltFromDeg]
          : [particle.tiltFromDeg, particle.tiltToDeg, particle.tiltFromDeg * 0.55, particle.tiltToDeg],
        rotateY: isPetal ? [0, 36, -24, 18, 0] : 0,
        scale: isBokeh
          ? [0.72, 1.18, 0.85, 1.1, 0.72]
          : isRing
          ? [0.94, 1.04, 0.98, 1.03, 0.94]
          : [0.92, 1.02, 0.96, 1, 0.92],
        opacity: [0, particle.peakOpacity, particle.peakOpacity, particle.peakOpacity * 0.86, 0],
      }}
      transition={{
        duration: particle.durationSec,
        delay: particle.delaySec,
        repeat: Infinity,
        ease: 'linear',
      }}
    >
      {isRing && <LuxurySolitaireRingSvg id={particle.id} size={particle.sizePx} />}
      {particle.kind === 'petal-rose' && (
        <EngagementPetalSvg id={particle.id} size={particle.sizePx} />
      )}
      {particle.kind === 'petal-jasmine' && (
        <JasmineBlossomSvg id={particle.id} size={particle.sizePx} />
      )}
      {isBokeh && <GoldenBokehOrb size={particle.sizePx} />}
    </motion.div>
  );
};

export default function FloatingEngagementRingsAndSparkles() {
  const prefersReducedMotion = useReducedMotion();
  const particles = useMemo(() => buildEngagementParticles(16), []);

  if (prefersReducedMotion) return null;

  return (
    <div
      data-testid="engagement-flying-animation"
      aria-hidden="true"
      className="absolute inset-0 pointer-events-none overflow-hidden z-10"
    >
      {particles.map((particle) => (
        <EngagementParticleNode key={particle.id} particle={particle} />
      ))}
    </div>
  );
}
