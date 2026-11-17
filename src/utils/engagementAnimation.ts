export type EngagementParticleKind = 'ring' | 'petal-rose' | 'petal-jasmine' | 'bokeh';

export type EngagementFlightDirection = 'ascend' | 'descend';

export interface EngagementParticle {
  id: string;
  kind: EngagementParticleKind;
  direction: EngagementFlightDirection;
  /** Horizontal anchor in percentage across container width (0-100) */
  leftPct: number;
  /** Starting vertical position in percentage */
  fromTopPct: number;
  /** Ending vertical position in percentage */
  toTopPct: number;
  /** Horizontal curved sway keyframes in px */
  swayPx: number;
  /** Gentle tilt range in degrees (kept upright for rings, fluttering for petals) */
  tiltFromDeg: number;
  tiltToDeg: number;
  /** Rendered SVG / orb size in px */
  sizePx: number;
  /** Total flight cycle duration in seconds */
  durationSec: number;
  /** Staggered animation delay in seconds */
  delaySec: number;
  /** Peak opacity kept balanced so typography remains crisp */
  peakOpacity: number;
  /** Perimeter framing lane */
  lane: 'left' | 'right' | 'ambient';
}

const LANE_LEFT_ANCHORS = [4, 10, 6, 13, 8];
const LANE_RIGHT_ANCHORS = [82, 88, 85, 91, 79];
const AMBIENT_ANCHORS = [20, 74, 24, 70];

/**
 * Builds a deterministic, balanced set of flying engagement particles:
 * - Luxury 3D-perspective solitaire diamond engagement rings (3 perimeter pieces, upright & dignified)
 * - Soft silk rose & Khmer jasmine petals drifting gently downward
 * - Warm luminous champagne-gold bokeh embers ascending smoothly
 * All routed away from the center typography corridor (30%..70%).
 */
export function buildEngagementParticles(count = 16): EngagementParticle[] {
  const particles: EngagementParticle[] = [];
  const safeCount = Math.max(4, Math.min(24, Math.floor(count)));

  // Limit rings to 3 tasteful hero accents so they never clutter the card
  const ringIndices = new Set([1, 7, 13]);

  for (let i = 0; i < safeCount; i++) {
    const isEven = i % 2 === 0;
    const lane: 'left' | 'right' | 'ambient' =
      i % 5 === 4 ? 'ambient' : isEven ? 'left' : 'right';

    const leftPct =
      lane === 'left'
        ? LANE_LEFT_ANCHORS[i % LANE_LEFT_ANCHORS.length]
        : lane === 'right'
        ? LANE_RIGHT_ANCHORS[i % LANE_RIGHT_ANCHORS.length]
        : AMBIENT_ANCHORS[i % AMBIENT_ANCHORS.length];

    if (ringIndices.has(i)) {
      particles.push({
        id: `eng-ring-${i}`,
        kind: 'ring',
        direction: 'ascend',
        leftPct: i === 1 ? 84 : i === 7 ? 7 : 86,
        fromTopPct: 96,
        toTopPct: -12,
        swayPx: i === 7 ? 14 : -14,
        tiltFromDeg: i === 7 ? -8 : 8,
        tiltToDeg: i === 7 ? 6 : -6,
        sizePx: 44 + (i % 2) * 6,
        durationSec: 15 + (i % 3) * 2,
        delaySec: i === 1 ? 0 : i === 7 ? 4.5 : 9,
        peakOpacity: 0.92,
        lane: i === 7 ? 'left' : 'right',
      });
      continue;
    }

    const kindCycle: EngagementParticleKind[] = ['petal-rose', 'bokeh', 'petal-jasmine', 'bokeh'];
    const kind = kindCycle[i % kindCycle.length];

    if (kind === 'bokeh') {
      particles.push({
        id: `eng-bokeh-${i}`,
        kind,
        direction: 'ascend',
        leftPct,
        fromTopPct: 102,
        toTopPct: -8,
        swayPx: (isEven ? 1 : -1) * (10 + (i % 3) * 4),
        tiltFromDeg: -10,
        tiltToDeg: 10,
        sizePx: 12 + (i % 3) * 5,
        durationSec: 10.5 + (i % 4) * 2.2,
        delaySec: (i * 0.9) % 7,
        peakOpacity: lane === 'ambient' ? 0.45 : 0.72,
        lane,
      });
    } else {
      particles.push({
        id: `eng-petal-${i}`,
        kind,
        direction: 'descend',
        leftPct,
        fromTopPct: -10,
        toTopPct: 106,
        swayPx: (isEven ? 1 : -1) * (18 + (i % 4) * 5),
        tiltFromDeg: isEven ? -22 : 22,
        tiltToDeg: isEven ? 28 : -28,
        sizePx: kind === 'petal-jasmine' ? 18 + (i % 2) * 4 : 17 + (i % 3) * 3,
        durationSec: 12 + (i % 4) * 2.4,
        delaySec: (i * 1.1) % 8,
        peakOpacity: lane === 'ambient' ? 0.48 : 0.78,
        lane,
      });
    }
  }

  return particles;
}
