import React from 'react';
import {
  BrandFrame,
  CARD_EDGE,
  COLORS,
  Card3D,
  P3D,
  Stage3D,
  TRACK,
  cardShadow,
  enter,
  fadeUp,
  progressBetween,
  useTimeline,
} from '../brand';

// TenSeconds: "fill out the form, it takes about ten seconds, and all of it is
// in your account." A thin blue ring ticks once around a big "10" on a
// floating dial, then the account card settles in and the deliverables land
// on it as small rows. One idea, gentle 3D, no money pieces.
//
// Words: "About ten seconds" and "All of it is in your account." are the ones
// in shot-lists/animation-ideas-2026-10-03.md (idea 4). The rows are the
// deliverables' names as the /roadmap page writes them (marketing/landing-
// pages/slo/slo-01-sales.html, order summary). The page's third item, "Credit
// Optimization Roadmap", is left out of the defaults because the ad rules ban
// every form of "optimize" on screen; a shot list can still pass it in.

export type TenSecondsProps = {
  /** The big figure inside the ring, e.g. "10" (the Founder VSL: "2"). */
  ringNumber: string;
  /** The words under the ring, e.g. "About ten seconds" (the Founder VSL: "About two minutes"). */
  ringLabel: string;
  /** The line on the account card. Null drops it; null with no rows drops the card (the Founder VSL line never mentions the account). */
  headline: string | null;
  /** Rows that land on the card, 0 to 6: the deliverables' names as the /roadmap page writes them. */
  items: string[];
  durationInFrames?: number;
  showSafeZones?: boolean;
};

export const TEN_SECONDS_BASE = 90;
export const TEN_SECONDS_HERO = 80;

export const tenSecondsDefaults: TenSecondsProps = {
  ringNumber: '10',
  ringLabel: 'About ten seconds',
  headline: 'All of it is in your account.',
  // The real deliverable names from the /roadmap order summary. "Credit Optimization" is the
  // company's product term (owner rules 2026-10-02); the old checker's ban on "optimize" is outdated.
  items: ['How Much You Qualify For', 'Credit Analysis Report', 'Credit Optimization Roadmap', 'Dispute Letter Pack', 'Bank & Lender Match List'],
};

const CARD_W = 820;
const TICKS = 10;
const STROKE = 10;

// Timing (base frames).
const DIAL_AT = 0;
const SWEEP_FROM = 6;
const SWEEP_TO = 40;
const CARD_AT = 10;
const ROWS_AT = 40;

// Short card shadow: the kit's tall one would run past the bottom safe edge
// under the card and be cut off flat there.
const CARD_SHADOW = '0 5px 0 -1px #DCDCE1, 0 12px 22px rgba(10,10,10,.07), 0 28px 40px -16px rgba(10,10,10,.16)';

const Check: React.FC<{size: number}> = ({size}) => (
  <div
    style={{
      flex: '0 0 auto',
      width: size,
      height: size,
      borderRadius: '50%',
      background: COLORS.accent,
      boxShadow: '0 3px 0 -1px #2F6CC4',
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

/** A plain person glyph in a blue circle: the account. */
const AccountIcon: React.FC<{size: number}> = ({size}) => (
  <div
    style={{
      flex: '0 0 auto',
      width: size,
      height: size,
      borderRadius: '50%',
      background: 'linear-gradient(160deg, #5C9CF4 0%, #3D86F0 60%, #3479E0 100%)',
      boxShadow: '0 4px 0 -1px #2F6CC4, 0 8px 14px rgba(61,134,240,.22)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}
  >
    <svg width={size * 0.56} height={size * 0.56} viewBox="0 0 24 24" fill={COLORS.white}>
      <circle cx={12} cy={8.2} r={4.2} />
      <path d="M3.8 20.5 C4.6 15.9 8 13.6 12 13.6 C16 13.6 19.4 15.9 20.2 20.5 Z" />
    </svg>
  </div>
);

export const TenSeconds: React.FC<TenSecondsProps> = ({ringNumber, ringLabel, headline, items, durationInFrames, showSafeZones}) => {
  const {f, fps} = useTimeline(TEN_SECONDS_BASE, durationInFrames);
  const L = TEN_SECONDS_BASE;
  const list = items.slice(0, 6);
  const n = list.length;
  const big = n >= 5; // five or six rows: a smaller dial and tighter rows so it all fits
  const cardShown = headline !== null || n > 0;

  const D = !cardShown ? 380 : big ? 248 : 280; // dial size (larger when it is alone)
  const R = D / 2 - 36; // ring radius (the ticks sit outside it)
  const C = 2 * Math.PI * R;
  const rowH = big ? 50 : 56;
  const rowGap = big ? 8 : 10;
  const rowStep = n > 4 ? 4 : 5;

  const dIn = enter(f, fps, DIAL_AT, 16);
  const dFade = Math.min(1, dIn * 1.6);
  const numIn = enter(f, fps, 4, 12);
  const pillIn = enter(f, fps, 8, 14);
  const p = progressBetween(f, SWEEP_FROM, SWEEP_TO);
  const done = progressBetween(f, SWEEP_TO, SWEEP_TO + 8);
  const cIn = enter(f, fps, CARD_AT, 18);
  const hIn = enter(f, fps, CARD_AT + 6, 14);

  const head = (-90 + 360 * p) * (Math.PI / 180);
  const knob = {x: D / 2 + R * Math.cos(head), y: D / 2 + R * Math.sin(head)};
  const knobOn = Math.min(1, p * 25) * (1 - done);

  return (
    <BrandFrame showSafeZones={showSafeZones}>
      <Stage3D f={f} length={L}>
        {/* the dial: a white puck floating off the wall */}
        <div style={{position: 'relative', width: D, height: D, ...P3D}}>
          <div
            style={{
              position: 'absolute',
              inset: 0,
              borderRadius: '50%',
              background: 'radial-gradient(circle at 50% 36%, #FFFFFF 0%, #FFFFFF 58%, #F5F5F7 100%)',
              ...CARD_EDGE,
              boxShadow: `${cardShadow(0.9)}, 0 0 0 ${(12 * done).toFixed(2)}px rgba(61,134,240,${(0.09 * done).toFixed(3)})`,
              opacity: dFade,
              transform: `translate3d(0, ${(1 - dIn) * 30}px, ${50 - (1 - dIn) * 360}px) rotateX(${(1 - dIn) * 16}deg)`,
            }}
          >
            <svg width={D} height={D} viewBox={`0 0 ${D} ${D}`} style={{position: 'absolute', left: -2, top: -2, overflow: 'visible'}}>
              <circle cx={D / 2} cy={D / 2} r={R} fill="none" stroke={COLORS.line} strokeWidth={STROKE} />
              {Array.from({length: TICKS}, (_, i) => {
                const a = (-90 + (360 * i) / TICKS) * (Math.PI / 180);
                const lit = Math.max(0, Math.min(1, (p - i / TICKS) * 30));
                const r1 = R + 13;
                const r2 = R + 23;
                const x1 = D / 2 + r1 * Math.cos(a);
                const y1 = D / 2 + r1 * Math.sin(a);
                const x2 = D / 2 + r2 * Math.cos(a);
                const y2 = D / 2 + r2 * Math.sin(a);
                return (
                  <React.Fragment key={i}>
                    <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={COLORS.track} strokeWidth={4} strokeLinecap="round" />
                    <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={COLORS.accent} strokeWidth={4} strokeLinecap="round" opacity={lit} />
                  </React.Fragment>
                );
              })}
              {p > 0.002 ? (
                <circle
                  cx={D / 2}
                  cy={D / 2}
                  r={R}
                  fill="none"
                  stroke={COLORS.accent}
                  strokeWidth={STROKE}
                  strokeLinecap="round"
                  strokeDasharray={`${C} ${C}`}
                  strokeDashoffset={C * (1 - p)}
                  transform={`rotate(-90 ${D / 2} ${D / 2})`}
                />
              ) : null}
              {knobOn > 0.01 ? (
                <g opacity={knobOn}>
                  <circle cx={knob.x} cy={knob.y + 3} r={13} fill="rgba(10,10,10,.12)" />
                  <circle cx={knob.x} cy={knob.y} r={12} fill={COLORS.white} stroke={COLORS.accent} strokeWidth={5} />
                </g>
              ) : null}
            </svg>
            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: D * 0.4,
                fontWeight: 800,
                letterSpacing: '-0.05em',
                lineHeight: 1,
                fontVariantNumeric: 'tabular-nums',
                color: COLORS.ink,
                opacity: numIn,
                transform: `scale(${0.94 + 0.06 * numIn})`,
              }}
            >
              {ringNumber}
            </div>
          </div>

          {/* the ring's label, a chip resting on the dial's lower edge */}
          <div
            style={{
              position: 'absolute',
              left: '50%',
              top: D - 30,
              padding: '12px 28px',
              borderRadius: 999,
              background: '#EEF4FE',
              border: `2px solid ${COLORS.accentLine}`,
              boxShadow: '0 4px 0 -1px rgba(61,134,240,.22), 0 14px 26px rgba(61,134,240,.16)',
              color: COLORS.accent,
              fontSize: cardShown ? 38 : 46,
              fontWeight: 700,
              letterSpacing: TRACK.body,
              lineHeight: 1.2,
              whiteSpace: 'nowrap',
              opacity: pillIn,
              transform: `translate3d(-50%, ${(1 - pillIn) * 16}px, 90px)`,
            }}
          >
            {ringLabel}
          </div>
        </div>

        {cardShown ? (
          <>
            <div style={{height: big ? 64 : 72}} />

            {/* the account: a floating card; each deliverable drops onto it as a row */}
            <Card3D
              enter={cIn}
              z={24}
              tilt={{rx: 3}}
              width={n > 0 ? CARD_W : 'auto'}
              radius={30}
              padding={n > 0 ? '26px 30px 28px' : '30px 34px'}
              style={{alignSelf: 'center', boxShadow: CARD_SHADOW}}
            >
              {headline !== null ? (
                <div style={{...fadeUp(hIn, 12), display: 'flex', alignItems: 'center', gap: 18}}>
                  <AccountIcon size={52} />
                  <div style={{fontSize: 44, fontWeight: 800, letterSpacing: TRACK.h2, lineHeight: 1.1, color: COLORS.ink, textWrap: 'balance'}}>
                    {headline}
                  </div>
                </div>
              ) : null}
              {n > 0 ? (
                <div
                  style={{
                    marginTop: headline !== null ? 20 : 0,
                    padding: 12,
                    borderRadius: 22,
                    background: '#F4F4F6',
                    boxShadow: 'inset 0 2px 5px rgba(10,10,10,.06)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: rowGap,
                    ...P3D,
                  }}
                >
                  {list.map((t, i) => {
                    const r = enter(f, fps, ROWS_AT + i * rowStep, 14);
                    return (
                      <div key={`${t}-${i}`} style={{position: 'relative', height: rowH, ...P3D}}>
                        {/* the empty slot waiting for this row */}
                        <div
                          style={{
                            position: 'absolute',
                            inset: 0,
                            borderRadius: 16,
                            border: `2px dashed ${COLORS.track}`,
                            opacity: 1 - Math.min(1, r * 1.8),
                          }}
                        />
                        {/* the row itself: drops in from in front and settles into its slot */}
                        <div
                          style={{
                            position: 'absolute',
                            inset: 0,
                            borderRadius: 16,
                            background: 'linear-gradient(180deg, #FFFFFF 0%, #FDFDFE 100%)',
                            border: '2px solid #EAEAEE',
                            boxShadow: '0 4px 0 -1px #DCDCE1, 0 10px 16px rgba(10,10,10,.05)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 16,
                            padding: '0 18px',
                            opacity: Math.min(1, r * 1.8),
                            transform: `translate3d(0, ${(1 - r) * -14}px, ${(1 - r) * 130}px)`,
                          }}
                        >
                          <Check size={Math.round(rowH * 0.6)} />
                          <span
                            style={{
                              fontSize: Math.round(rowH * 0.6),
                              fontWeight: 600,
                              letterSpacing: TRACK.body,
                              color: COLORS.ink2,
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {t}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </Card3D>
          </>
        ) : null}
      </Stage3D>
    </BrandFrame>
  );
};
