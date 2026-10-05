import React from 'react';
import {interpolate, interpolateColors} from 'remotion';
import {
  BrandFrame,
  CARD_EDGE,
  COLORS,
  CONTENT,
  CONTENT_WIDTH,
  Card3D,
  P3D,
  Stage3D,
  TAG,
  TRACK,
  enter,
  fadeUp,
  progressBetween,
  useTimeline,
} from '../brand';

export type ShotgunApplyProps = {
  /** Headline, in the words of the script line. */
  headline: string;
  /** Label on the file, over the slots that fill one per application. */
  inquiryLabel: string;
  /** Word on the back of each bank that says no (shown with a small x mark). */
  declinedLabel: string;
  durationInFrames?: number;
  showSafeZones?: boolean;
};

export const SHOTGUN_APPLY_BASE = 90;
export const SHOTGUN_APPLY_HERO = 80;

// Words from the 9/30 /watch VSL: "they sent your file to every lender on their
// list, and you came out with a couple of approvals and a credit report full of
// hard inquiries." Ad 22 can pass "Each decline makes the next one harder" and
// Notes Script 4 "A report full of hard inquiries" as the headline. Banks stay
// blank: no names, no logos, no amounts, and no approval marks (the two banks
// that do not decline simply stay plain).
export const shotgunApplyDefaults: ShotgunApplyProps = {
  headline: 'Sent to every lender on their list',
  inquiryLabel: 'Hard inquiries',
  declinedLabel: 'Declined',
};

const W = CONTENT_WIDTH; // 900
const H = CONTENT.bottom - CONTENT.top; // 824
const MID = W / 2;

// Bank tiles: a 3 x 3 wall of thick slabs.
const COLS = 3;
const TW = 272;
const TH = 108;
const GX = (W - COLS * TW) / (COLS - 1); // 42
const GY = 16;
const GRID_TOP = 170;
const GRID_H = 3 * TH + 2 * GY;
const SLAB = 16; // slab thickness
const GRID_TILT = 10;
/** Tiles that do not come back declined. They stay plain: never an approval mark. */
const PLAIN = [2, 6];
/** Copies leave nearest row first, so the spray ripples back across the wall. */
const LAUNCH_ORDER = [7, 6, 8, 4, 3, 5, 1, 0, 2];
const LAUNCH_START = 20;
const LAUNCH_STEP = 1.5;
const TRAVEL = 14;
const FLIP_START = 44;
const FLIP_STEP = 2.6;
const FLIP_LEN = 14;

// The file: a floating card at the bottom with one slot per application.
const FILE_W = 540;
const FILE_TOP = 570;
const SLOT_W = 34;
const SLOT_H = 42;
const SLOT_GAP = 12;
const COPY_W = 54;
const COPY_H = 68;

const tileCenter = (i: number) => {
  const col = i % COLS;
  const row = Math.floor(i / COLS);
  return {x: col * (TW + GX) + TW / 2, y: GRID_TOP + row * (TH + GY) + TH / 2};
};

/** A plain bank pictogram (no name, no logo), drawn like the one on LenderList's rows. */
const BankGlyph: React.FC<{size: number; color: string}> = ({size, color}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 9.5 12 4l9 5.5" />
    <path d="M5 10.5v7M9.7 10.5v7M14.3 10.5v7M19 10.5v7" />
    <path d="M3 20h18" />
  </svg>
);

const face: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  borderRadius: 24,
  backfaceVisibility: 'hidden',
  boxSizing: 'border-box',
};

/** One bank: a thick slab whose front is blank and whose back says declined. `flip` 0 to 1 turns it over. */
const BankSlab: React.FC<{i: number; show: number; flip: number; declinedLabel: string}> = ({i, show, flip, declinedLabel}) => {
  const col = i % COLS;
  const row = Math.floor(i / COLS);
  const q = 1 - show;
  // the slab rises toward the camera at mid-turn, so it never cuts into its neighbors
  const lift = Math.sin(Math.PI * flip) * 26;
  return (
    <div
      style={{
        position: 'absolute',
        left: col * (TW + GX),
        top: GRID_TOP + row * (TH + GY),
        width: TW,
        height: TH,
        ...P3D,
        transform: `translate3d(0, ${q * 30}px, ${-q * 320}px) rotateX(${q * 18}deg)`,
      }}
    >
      {/* the lift shadow is its own plane behind the slab, so it never turns with it */}
      <div
        style={{
          position: 'absolute',
          left: -TW * 0.06,
          top: TH * 0.18,
          width: TW * 1.12,
          height: TH * 1.05,
          borderRadius: '50%',
          background: 'radial-gradient(closest-side, rgba(10,10,10,.16), rgba(10,10,10,.07) 60%, rgba(10,10,10,0))',
          opacity: show * (1 - 0.4 * Math.sin(Math.PI * flip)),
          transform: `translateZ(${-SLAB - 18}px)`,
        }}
      />
      <div style={{position: 'absolute', inset: 0, ...P3D, transform: `translateZ(${lift}px) rotateX(${-180 * flip}deg)`}}>
        {/* thickness: plates parallel to the faces sort cleanly in 3D */}
        <div style={{...face, backfaceVisibility: 'visible', background: '#E2E2E7', opacity: show, transform: `translateZ(${-SLAB / 3}px)`}} />
        <div style={{...face, backfaceVisibility: 'visible', background: '#D3D3D9', opacity: show, transform: `translateZ(${(-SLAB * 2) / 3}px)`}} />
        {/* front: a blank bank */}
        <div
          style={{
            ...face,
            background: 'linear-gradient(165deg, #FFFFFF 0%, #FFFFFF 55%, #F8F8FA 100%)',
            ...CARD_EDGE,
            opacity: show,
            display: 'flex',
            alignItems: 'center',
            gap: 20,
            padding: '0 26px',
          }}
        >
          <div
            style={{
              flex: '0 0 auto',
              width: 64,
              height: 64,
              borderRadius: 18,
              background: 'linear-gradient(160deg, #FFFFFF, #F1F1F3)',
              border: `2px solid ${COLORS.line}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <BankGlyph size={36} color={COLORS.gray2} />
          </div>
          <div style={{flex: 1, display: 'flex', flexDirection: 'column', gap: 12}}>
            <div style={{width: '86%', height: 18, borderRadius: 9, background: COLORS.line}} />
            <div style={{width: '56%', height: 12, borderRadius: 6, background: COLORS.soft}} />
          </div>
        </div>
        {/* back: declined */}
        <div
          style={{
            ...face,
            background: `linear-gradient(165deg, #FFFFFF 0%, ${TAG.bad.bg} 70%)`,
            border: `2px solid ${TAG.bad.border}`,
            transform: `translateZ(${-SLAB}px) rotateX(180deg)`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div style={{display: 'flex', alignItems: 'center', gap: 14}}>
            <svg width={34} height={34} viewBox="0 0 24 24" fill="none" stroke={TAG.bad.fg} strokeWidth={2.4} strokeLinecap="round">
              <circle cx={12} cy={12} r={10} />
              <path d="M8.5 8.5l7 7M15.5 8.5l-7 7" />
            </svg>
            <span style={{fontSize: 42, fontWeight: 700, letterSpacing: TRACK.body, color: TAG.bad.fg, lineHeight: 1}}>{declinedLabel}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

/** A paper copy of the file, on its way to one bank. */
const Copy: React.FC<{i: number; t: number}> = ({i, t}) => {
  if (t <= 0 || t >= 1) return null;
  const e = 1 - Math.pow(1 - t, 3); // leaves fast, eases into the bank
  const to = tileCenter(i);
  const from = {x: MID, y: FILE_TOP + 40};
  const x = from.x + (to.x - from.x) * e;
  const y = from.y + (to.y - from.y) * e;
  // just in front of the wall, arcing toward the camera mid-flight
  const z = 18 + Math.sin(Math.PI * e) * 110;
  const opacity = interpolate(t, [0, 0.14, 0.78, 1], [0, 1, 1, 0]);
  const spin = (to.x - from.x) / 30;
  return (
    <div
      style={{
        position: 'absolute',
        left: x - COPY_W / 2,
        top: y - COPY_H / 2,
        width: COPY_W,
        height: COPY_H,
        borderRadius: 8,
        background: COLORS.white,
        border: `2px solid ${COLORS.line}`,
        boxShadow: '0 10px 18px rgba(10,10,10,.12)',
        boxSizing: 'border-box',
        padding: '11px 9px',
        opacity,
        transform: `translateZ(${z}px) rotateZ(${spin * (1 - e)}deg) rotateX(${18 * (1 - e)}deg) scale(${0.8 + 0.2 * e})`,
      }}
    >
      <div style={{width: '64%', height: 7, borderRadius: 4, background: COLORS.accent}} />
      {[0.92, 0.7, 0.84].map((w, k) => (
        <div key={k} style={{marginTop: 6, width: `${w * 100}%`, height: 5, borderRadius: 3, background: COLORS.line}} />
      ))}
    </div>
  );
};

export const ShotgunApply: React.FC<ShotgunApplyProps> = ({headline, inquiryLabel, declinedLabel, durationInFrames, showSafeZones}) => {
  const {f, fps} = useTimeline(SHOTGUN_APPLY_BASE, durationInFrames);
  const L = SHOTGUN_APPLY_BASE;
  const declinedOrder = Array.from({length: 9}, (_, i) => i).filter((i) => !PLAIN.includes(i));
  const launchAt = (i: number) => LAUNCH_START + LAUNCH_ORDER.indexOf(i) * LAUNCH_STEP;
  const file = enter(f, fps, 4, 16);

  return (
    <BrandFrame showSafeZones={showSafeZones}>
      <Stage3D f={f} length={L}>
        <div style={{position: 'relative', width: W, height: H, ...P3D}}>
          <div
            style={{
              ...fadeUp(enter(f, fps, 0, 16), 22),
              position: 'absolute',
              left: 0,
              right: 0,
              top: 0,
              textAlign: 'center',
              textWrap: 'balance',
              fontSize: 64,
              fontWeight: 800,
              letterSpacing: TRACK.h2,
              lineHeight: 1.06,
            }}
          >
            {headline}
          </div>

          {/* the wall of banks, leaning back a little */}
          <div
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              width: W,
              height: H,
              ...P3D,
              transformOrigin: `50% ${GRID_TOP + GRID_H / 2}px`,
              transform: `rotateX(${GRID_TILT}deg)`,
            }}
          >
            {Array.from({length: 9}, (_, i) => {
              const j = declinedOrder.indexOf(i);
              const flip = j < 0 ? 0 : progressBetween(f, FLIP_START + j * FLIP_STEP, FLIP_START + j * FLIP_STEP + FLIP_LEN);
              return <BankSlab key={i} i={i} show={enter(f, fps, 6 + i * 1.4, 16)} flip={flip} declinedLabel={declinedLabel} />;
            })}
            {Array.from({length: 9}, (_, i) => (
              <Copy key={`c${i}`} i={i} t={(f - launchAt(i)) / TRAVEL} />
            ))}
          </div>

          {/* the file the copies come from; one slot fills for every application */}
          <div style={{position: 'absolute', left: MID - FILE_W / 2, top: FILE_TOP, width: FILE_W, ...P3D}}>
            <Card3D enter={file} z={40} tilt={{rx: 4}} elevation={0.7} radius={30} padding="24px 34px 28px">
              <div style={{display: 'flex', alignItems: 'center', gap: 18}}>
                <div
                  style={{
                    flex: '0 0 auto',
                    width: 40,
                    height: 50,
                    borderRadius: 8,
                    border: `3px solid ${COLORS.track}`,
                    boxSizing: 'border-box',
                    padding: '7px 6px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 5,
                  }}
                >
                  <div style={{width: '70%', height: 5, borderRadius: 3, background: COLORS.accent}} />
                  <div style={{width: '100%', height: 4, borderRadius: 2, background: COLORS.line}} />
                  <div style={{width: '80%', height: 4, borderRadius: 2, background: COLORS.line}} />
                </div>
                <span style={{fontSize: 40, fontWeight: 700, letterSpacing: TRACK.body, color: COLORS.ink, lineHeight: 1.1}}>{inquiryLabel}</span>
              </div>
              <div style={{marginTop: 20, display: 'flex', gap: SLOT_GAP}}>
                {LAUNCH_ORDER.map((tile, k) => {
                  const fill = enter(f, fps, launchAt(tile) + TRAVEL - 2, 8);
                  return (
                    <div
                      key={k}
                      style={{
                        width: SLOT_W,
                        height: SLOT_H,
                        borderRadius: 10,
                        boxSizing: 'border-box',
                        background: interpolateColors(fill, [0, 1], [COLORS.soft, TAG.bad.fg]),
                        border: `2px solid ${interpolateColors(fill, [0, 1], [COLORS.line, '#9C463F'])}`,
                        boxShadow:
                          fill > 0.02
                            ? `inset 0 3px 0 rgba(255,255,255,${0.28 * fill}), 0 ${4 * fill}px ${8 * fill}px rgba(180,84,76,${0.28 * fill})`
                            : 'inset 0 2px 3px rgba(10,10,10,.06)',
                        transform: `translateY(${-3 * fill}px)`,
                      }}
                    />
                  );
                })}
              </div>
            </Card3D>
          </div>
        </div>
      </Stage3D>
    </BrandFrame>
  );
};
