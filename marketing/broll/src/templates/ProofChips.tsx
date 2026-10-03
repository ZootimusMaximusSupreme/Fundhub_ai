import React from 'react';
import {BrandFrame, CARD_EDGE, COLORS, GradientDash, Layer, P3D, Stage3D, TRACK, enter, fadeUp, useTimeline} from '../brand';

// ProofChips: the simple ProofWall (owner call 2026-10-03: ProofWall was "way
// too much"). Only the proof chips, in the brand chip style (gradient dash and
// a few words). Each chip is a thick glossy pill that comes forward out of the
// wall, one at a time, each one sitting a little nearer the camera than the one
// above it. Then the lead line lands under them and holds. No approvals, no
// money, nothing else moving.

export type ProofChipsProps = {
  /** One to four chips, word for word from the script line ("A decade" or "Ten years"). */
  chips: string[];
  /** The big line under the chips. Empty or missing means no lead line. */
  lead?: string;
  durationInFrames?: number;
  showSafeZones?: boolean;
};

export const PROOF_CHIPS_BASE = 90;
/** Every chip and the lead line have landed. */
export const PROOF_CHIPS_HERO = 84;

// The newer scripts' wording (9/30 /watch VSL, the 10-02 ads). The older $297
// ads say "Ten years" and "Tens of thousands of data points": pass those as props.
export const proofChipsDefaults: ProofChipsProps = {
  chips: ['A decade', 'Hundreds of files', 'Thousands of data points'],
  lead: 'A little over a million dollars funded for myself',
};

const MAX_CHIPS = 4;
/** Frames between one chip and the next. */
const STAGGER = 12;
/** Pill thickness, px, drawn as plates behind the face. */
const THICK = 28;
/** Plate colors from just behind the face to the back: the side of the pill. */
const PLATE_COLORS = ['#E6E8EC', '#E1E3E8', '#DCDFE4', '#D7DAE0', '#D2D5DC', '#CDD0D8', '#C8CCD4'];
/** The pills lie back a little so their thickness shows under the camera. */
const REST_TILT = 14;

/** Chip text size: as big as fits, so the longest chip stays inside the 900 px content width. */
const chipSize = (longest: number): number => Math.max(40, Math.min(56, Math.floor(780 / (0.53 * Math.max(1, longest)))));

/** One thick glossy pill. `p` 0 to 1 brings it forward out of the wall; `z` is its resting depth. */
const Pill: React.FC<{text: string; p: number; z: number; size: number}> = ({text, p, z, size}) => {
  const q = 1 - p;
  return (
    <div
      style={{
        position: 'relative',
        ...P3D,
        transform: `translate3d(0, ${q * 36}px, ${z - q * 420}px) rotateX(${REST_TILT + q * 16}deg)`,
      }}
    >
      {/* The side of the pill: plates behind the face, darker toward the back. Fades sit on each
          plate, never on this wrapper, so the depth survives the fade. */}
      {PLATE_COLORS.map((color, i) => {
        const last = i === PLATE_COLORS.length - 1;
        return (
          <div
            key={color}
            style={{
              position: 'absolute',
              inset: 0,
              borderRadius: 999,
              background: color,
              opacity: p,
              transform: `translateZ(${(-(i + 1) * THICK) / PLATE_COLORS.length}px)`,
              boxShadow: last ? '0 14px 24px rgba(10,10,10,.09), 0 34px 52px -18px rgba(10,10,10,.16)' : undefined,
            }}
          />
        );
      })}
      <div
        style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          gap: size * 0.36,
          padding: `${size * 0.44}px ${size * 0.82}px ${size * 0.44}px ${size * 0.62}px`,
          borderRadius: 999,
          background: 'linear-gradient(180deg, #FFFFFF 0%, #FFFFFF 46%, #F3F4F6 100%)',
          ...CARD_EDGE,
          boxShadow: 'inset 0 3px 0 rgba(255,255,255,.95), inset 0 -4px 8px rgba(10,10,10,.035)',
          opacity: p,
          fontSize: size,
          fontWeight: 600,
          letterSpacing: TRACK.body,
          lineHeight: 1.15,
          color: COLORS.ink2,
          whiteSpace: 'nowrap',
        }}
      >
        <GradientDash grow={p} />
        {text}
      </div>
    </div>
  );
};

export const ProofChips: React.FC<ProofChipsProps> = ({chips, lead, durationInFrames, showSafeZones}) => {
  const {f, fps} = useTimeline(PROOF_CHIPS_BASE, durationInFrames);
  const L = PROOF_CHIPS_BASE;
  const list = chips.map((t) => t.trim()).filter((t) => t.length > 0).slice(0, MAX_CHIPS);
  const leadText = (lead ?? '').trim();
  const size = chipSize(Math.max(0, ...list.map((t) => t.length)));
  const chipAt = (j: number) => 4 + j * STAGGER;
  const leadAt = list.length > 0 ? chipAt(list.length - 1) + 16 : 6;

  return (
    <BrandFrame showSafeZones={showSafeZones}>
      <Stage3D f={f} length={L} drift={0.8}>
        <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 28, ...P3D}}>
          {list.map((text, j) => (
            <Pill key={j} text={text} p={enter(f, fps, chipAt(j), 16)} z={16 + j * 20} size={size} />
          ))}
        </div>
        {leadText ? (
          <Layer z={16 + list.length * 20} style={{marginTop: list.length > 0 ? 54 : 0, display: 'flex', flexDirection: 'column', alignItems: 'center'}}>
            {list.length > 0 ? (
              <div
                style={{
                  width: 96,
                  height: 8,
                  borderRadius: 4,
                  marginBottom: 40,
                  background: COLORS.accent,
                  boxShadow: '0 6px 16px rgba(61,134,240,.35)',
                  transform: `scaleX(${enter(f, fps, leadAt - 4, 14)})`,
                }}
              />
            ) : null}
            <div
              style={{
                ...fadeUp(enter(f, fps, leadAt, 16), 22),
                maxWidth: 860,
                textAlign: 'center',
                fontSize: 66,
                fontWeight: 700,
                letterSpacing: TRACK.h2,
                lineHeight: 1.1,
                color: COLORS.ink,
                textWrap: 'balance',
              }}
            >
              {leadText}
            </div>
          </Layer>
        ) : null}
      </Stage3D>
    </BrandFrame>
  );
};
