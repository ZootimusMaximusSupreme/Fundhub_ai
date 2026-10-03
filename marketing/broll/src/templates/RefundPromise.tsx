import React from 'react';
import {
  BrandFrame,
  COLORS,
  Eyebrow,
  GroundShadow,
  P3D,
  Stage3D,
  TRACK,
  Wordmark,
  enter,
  fadeUp,
  progressBetween,
  useTimeline,
} from '../brand';

// RefundPromise: the refund line. A $297 receipt floats in, a blue email
// envelope slides onto its corner, and a calm blue "We'll refund you" stamp
// presses onto the receipt. One idea, gentle 3D, no money pieces.
//
// Words: the line is word for word the same in 12 scripts: "If you're not
// happy with what you get, email us and we'll refund you." The stamp words are
// the ones in shot-lists/animation-ideas-2026-10-03.md (idea 1). Never a
// number of days anywhere on screen.

export type RefundPromiseProps = {
  /** Brand label at the very top. Null (the default) shows none. */
  eyebrow: string | null;
  /** The small line on top: the first half of the script line. */
  topLine: string;
  /** The big line under the receipt: the second half of the script line. */
  mainLine: string;
  /** The price on the receipt, shown exactly as given, e.g. "$297". */
  priceLabel: string;
  /** The words on the blue stamp. */
  stamp: string;
  durationInFrames?: number;
  showSafeZones?: boolean;
};

export const REFUND_PROMISE_BASE = 90;
export const REFUND_PROMISE_HERO = 80;

export const refundPromiseDefaults: RefundPromiseProps = {
  eyebrow: null,
  topLine: "If you're not happy with what you get",
  mainLine: "Email us and we'll refund you.",
  priceLabel: '$297',
  stamp: "We'll refund you",
};

// Scene geometry (px inside the 900-wide content box).
const SCENE_W = 900;
const RW = 460; // receipt width
const RH = 440; // receipt height, teeth included
const TOOTH_H = 14;
const TOOTH_W = 30;
const ENV_W = 240;
const ENV_H = 160;
const ENV_LIFT = 26; // the envelope rides this far above the receipt's top edge
const RX = 160; // receipt left
const RY = ENV_LIFT; // receipt top
const EX = RX + RW - 124; // envelope left: over the receipt's top-right corner
const EY = 0;
const SCENE_H = RY + RH + 8;
const STAMP_W = 420;
const STAMP_H = 112;

// Timing (base frames).
const RECEIPT_AT = 4;
const ENVELOPE_AT = 22;
const STAMP_AT = 40;
const MAIN_AT = 50;

/** Rounded top corners, straight sides, torn (zigzag) bottom edge. */
const receiptPath = (w: number, h: number, r: number): string => {
  const n = Math.max(4, Math.round(w / TOOTH_W));
  const tw = w / n;
  let d = `M 0 ${r} Q 0 0 ${r} 0 L ${w - r} 0 Q ${w} 0 ${w} ${r} L ${w} ${h - TOOTH_H}`;
  for (let i = n - 1; i >= 0; i--) {
    d += ` L ${(i + 0.5) * tw} ${h} L ${i * tw} ${h - TOOTH_H}`;
  }
  return `${d} Z`;
};
const RECEIPT_D = receiptPath(RW, RH, 26);

/** Line items on the receipt: blank bars, never words or amounts. */
const LINE_BARS = [
  {left: 196, right: 70},
  {left: 156, right: 70},
  {left: 178, right: 70},
];

const CheckBadge: React.FC<{size: number}> = ({size}) => (
  <div
    style={{
      flex: '0 0 auto',
      width: size,
      height: size,
      borderRadius: '50%',
      background: COLORS.accent,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}
  >
    <svg width={size * 0.56} height={size * 0.56} viewBox="0 0 24 24">
      <path d="M5 12.5 L10 17.5 L19 7" fill="none" stroke={COLORS.white} strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  </div>
);

export const RefundPromise: React.FC<RefundPromiseProps> = ({
  eyebrow,
  topLine,
  mainLine,
  priceLabel,
  stamp,
  durationInFrames,
  showSafeZones,
}) => {
  const {f, fps} = useTimeline(REFUND_PROMISE_BASE, durationInFrames);
  const L = REFUND_PROMISE_BASE;

  const topIn = enter(f, fps, 0, 14);
  const rIn = enter(f, fps, RECEIPT_AT, 18);
  const rFade = Math.min(1, rIn * 1.6);
  const eIn = enter(f, fps, ENVELOPE_AT, 16);
  const sIn = enter(f, fps, STAMP_AT, 12);
  // The receipt gives a little under the stamp, then settles back. A smooth
  // dip and return, not a bounce.
  const dip = Math.sin(Math.PI * progressBetween(f, STAMP_AT + 7, STAMP_AT + 17));
  const mainIn = enter(f, fps, MAIN_AT, 14);

  // With an eyebrow on top the scene steps down a little so everything fits.
  const k = eyebrow ? 0.88 : 1;

  return (
    <BrandFrame showSafeZones={showSafeZones}>
      <Stage3D f={f} length={L}>
        {eyebrow ? (
          <>
            <Eyebrow text={eyebrow} progress={enter(f, fps, 0, 14)} />
            <div style={{height: 22}} />
          </>
        ) : null}
        <div
          style={{
            ...fadeUp(topIn, 18),
            maxWidth: 860,
            fontSize: 42,
            fontWeight: 600,
            letterSpacing: TRACK.body,
            lineHeight: 1.2,
            color: COLORS.gray,
            textAlign: 'center',
            textWrap: 'balance',
          }}
        >
          {topLine}
        </div>
        <div style={{height: 52 * k}} />

        <div style={{position: 'relative', width: SCENE_W, height: SCENE_H * k, ...P3D}}>
          <div
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              width: SCENE_W,
              height: SCENE_H,
              transform: `scale(${k})`,
              transformOrigin: '50% 0%',
              ...P3D,
            }}
          >
            {/* soft shadow on the wall under the floating receipt */}
            <GroundShadow
              width={RW * 0.9}
              height={90}
              strength={0.13}
              style={{
                position: 'absolute',
                left: RX + RW * 0.05,
                top: RY + RH - 40,
                opacity: rFade,
                transform: `translateZ(-60px) translateY(${(1 - rIn) * 30}px)`,
              }}
            />

            {/* the receipt: floats in from the wall, tilted a little */}
            <div
              style={{
                position: 'absolute',
                left: RX,
                top: RY,
                width: RW,
                height: RH,
                ...P3D,
                transform: `translate3d(0, ${(1 - rIn) * 44}px, ${30 - (1 - rIn) * 380 - 7 * dip}px) rotateX(${4 + (1 - rIn) * 16}deg) rotateY(-6deg) rotateZ(-2deg)`,
              }}
            >
              <svg
                width={RW}
                height={RH + 8}
                viewBox={`0 0 ${RW} ${RH + 8}`}
                style={{
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  overflow: 'visible',
                  opacity: rFade,
                  filter: 'drop-shadow(0 12px 16px rgba(10,10,10,.07))',
                }}
              >
                <defs>
                  <linearGradient id="refund-paper" x1="0" y1="0" x2="0.4" y2="1">
                    <stop offset="0%" stopColor="#FFFFFF" />
                    <stop offset="70%" stopColor="#FFFFFF" />
                    <stop offset="100%" stopColor="#F7F7F9" />
                  </linearGradient>
                </defs>
                {/* the paper's edge, so it reads as a thing with thickness */}
                <path d={RECEIPT_D} transform="translate(0 6)" fill="#DCDCE1" />
                <path d={RECEIPT_D} fill="url(#refund-paper)" stroke="#E4E4E7" strokeWidth={2} strokeLinejoin="round" />
              </svg>

              <div style={{position: 'absolute', inset: 0, opacity: rFade}}>
                <div style={{position: 'absolute', left: 40, top: 38}}>
                  <Wordmark width={124} color={COLORS.ink2} />
                </div>
                <div
                  style={{
                    position: 'absolute',
                    left: 34,
                    top: 86,
                    fontSize: 112,
                    fontWeight: 800,
                    letterSpacing: TRACK.num,
                    lineHeight: 1,
                    fontVariantNumeric: 'tabular-nums',
                    color: COLORS.ink,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {priceLabel}
                </div>
                <div style={{position: 'absolute', left: 40, right: 40, top: 230, borderTop: `3px dashed ${COLORS.line}`}} />
                {LINE_BARS.map((b, i) => (
                  <React.Fragment key={i}>
                    <div style={{position: 'absolute', left: 40, top: 266 + i * 42, width: b.left, height: 16, borderRadius: 8, background: '#ECECEF'}} />
                    <div style={{position: 'absolute', right: 40, top: 266 + i * 42, width: b.right, height: 16, borderRadius: 8, background: '#ECECEF'}} />
                  </React.Fragment>
                ))}
              </div>

              {/* the stamp: comes down from in front and presses onto the paper */}
              <div
                style={{
                  position: 'absolute',
                  left: (RW - STAMP_W) / 2,
                  top: 284,
                  width: STAMP_W,
                  height: STAMP_H,
                  borderRadius: 22,
                  border: `5px solid ${COLORS.accent}`,
                  background: 'rgba(255,255,255,.94)',
                  boxShadow: `inset 0 0 0 5px #FFFFFF, inset 0 0 0 7px rgba(61,134,240,.5), 0 ${6 + 18 * (1 - sIn)}px ${14 + 30 * (1 - sIn)}px rgba(61,134,240,${(0.1 + 0.12 * (1 - sIn)).toFixed(3)})`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 14,
                  color: COLORS.accent,
                  fontSize: 38,
                  fontWeight: 800,
                  letterSpacing: '-0.01em',
                  whiteSpace: 'nowrap',
                  opacity: Math.min(1, sIn * 2.5),
                  transform: `translateZ(${16 + (1 - sIn) * 240}px) rotateZ(-6deg) scale(${1 + 0.08 * (1 - sIn)})`,
                }}
              >
                <CheckBadge size={44} />
                {stamp}
              </div>
            </div>

            {/* the email: slides in from the right and lands on the receipt's corner */}
            <div
              style={{
                position: 'absolute',
                left: EX,
                top: EY,
                width: ENV_W,
                height: ENV_H,
                borderRadius: 22,
                background: 'linear-gradient(160deg, #5C9CF4 0%, #3D86F0 55%, #3479E0 100%)',
                boxShadow: '0 6px 0 -1px #2F6CC4, 0 14px 22px rgba(10,10,10,.10), 0 30px 40px -16px rgba(10,10,10,.24)',
                opacity: Math.min(1, eIn * 2),
                transform: `translate3d(${(1 - eIn) * 190}px, ${(1 - eIn) * -20}px, ${92 + (1 - eIn) * 60}px) rotateY(-4deg) rotateZ(${8 + (1 - eIn) * 14}deg)`,
              }}
            >
              <svg width={ENV_W} height={ENV_H} viewBox={`0 0 ${ENV_W} ${ENV_H}`} style={{position: 'absolute', inset: 0}}>
                <path
                  d={`M 18 ${ENV_H - 20} L ${ENV_W * 0.4} ${ENV_H * 0.54} M ${ENV_W - 18} ${ENV_H - 20} L ${ENV_W * 0.6} ${ENV_H * 0.54}`}
                  fill="none"
                  stroke="rgba(255,255,255,.4)"
                  strokeWidth={5}
                  strokeLinecap="round"
                />
                <path
                  d={`M 18 20 L ${ENV_W / 2} ${ENV_H * 0.6} L ${ENV_W - 18} 20`}
                  fill="rgba(255,255,255,.1)"
                  stroke="rgba(255,255,255,.95)"
                  strokeWidth={6}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
          </div>
        </div>

        <div style={{height: 34 * k}} />
        <div
          style={{
            ...fadeUp(mainIn, 22),
            maxWidth: 860,
            fontSize: 70,
            fontWeight: 800,
            letterSpacing: TRACK.h2,
            lineHeight: 1.06,
            color: COLORS.ink,
            textAlign: 'center',
            textWrap: 'balance',
          }}
        >
          {mainLine}
        </div>
      </Stage3D>
    </BrandFrame>
  );
};
