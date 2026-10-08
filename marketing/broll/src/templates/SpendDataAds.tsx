import React from 'react';
import {
  BackdropStage,
  BrandFrame,
  COLORS,
  Card3D,
  CashStack,
  Decor,
  Eyebrow,
  MoneyGutters,
  P3D,
  Stage3D,
  TRACK,
  enter,
  fadeUp,
  progressBetween,
  useTimeline,
} from '../brand';

// SpendDataAds (reference ad "Scale without your own cash", script line 35):
// "When your business is stuck with limited cash, you have to turn your
// spending UP. More spend gets you more data, your ads perform better, ..."
//
// One idea: a three-link chain, read top to bottom. A floating card holds three
// rows. A cash stack grows (more spend), a grid of squares lights up one by one
// (more data), then four bars rise (ads perform better). A blue line runs down
// from each picture to the next, with an arrowhead at the end.
// The words are the line's own; nothing else is written on screen. The stack,
// squares and bars are pictures, never amounts.

export type SpendDataAdsProps = {
  /** The small line above the card. */
  eyebrow: string;
  /** The three links of the chain, top to bottom. Each comes from the script line. */
  stepOne: string;
  stepTwo: string;
  stepThree: string;
  durationInFrames?: number;
  showSafeZones?: boolean;
};

export const SPEND_DATA_ADS_BASE = 90;
/** Every link is lit, the last bar is up and the card has settled. */
export const SPEND_DATA_ADS_HERO = 82;

export const spendDataAdsDefaults: SpendDataAdsProps = {
  eyebrow: 'Turn your spending up',
  stepOne: 'More spend',
  stepTwo: 'More data',
  stepThree: 'Ads perform better',
};

const ROW_H = 198;
const PIC_W = 214;
const PIC_H = 140;
const GAP_X = 34;

/** Frames on the 90-frame base. */
const T = {
  card: 3,
  one: 8,
  stack: [8, 28] as const,
  badge: 18,
  link1: [26, 35] as const,
  two: 33,
  squares: 35,
  link2: [52, 61] as const,
  three: 59,
  bars: 61,
} as const;

const SQUARES = 12;
const SQ = 38;
const SQ_GAP = 10;
/** Bar heights, lowest first. The last one is the tallest and blue. */
const BARS = [34, 58, 88, 124];
const BAR_W = 38;
const BAR_GAP = 14;

/** One row: the picture on the left, the words on the right. */
const Row: React.FC<{label: string; progress: number; picture: React.ReactNode}> = ({label, progress, picture}) => (
  <div style={{display: 'flex', alignItems: 'center', gap: GAP_X, height: ROW_H}}>
    <div style={{position: 'relative', flex: '0 0 auto', width: PIC_W, height: PIC_H, ...P3D}}>{picture}</div>
    <div
      style={{
        ...fadeUp(progress, 18),
        flex: 1,
        minWidth: 0,
        fontSize: 62,
        fontWeight: 800,
        letterSpacing: TRACK.h2,
        lineHeight: 1.05,
        textWrap: 'balance',
        color: COLORS.ink,
      }}
    >
      {label}
    </div>
  </div>
);

/** A blue line that runs down from one picture to the next and ends in an arrowhead. */
const Link: React.FC<{y1: number; y2: number; p: number}> = ({y1, y2, p}) => {
  const x = PIC_W / 2;
  const head = 15;
  return (
    <g opacity={Math.min(1, p * 5)}>
      <line x1={x} y1={y1} x2={x} y2={y1 + (y2 - y1) * p} stroke={COLORS.accent} strokeWidth={7} strokeLinecap="round" />
      <path
        d={`M ${x - head} ${y2 - head} L ${x} ${y2} L ${x + head} ${y2 - head}`}
        fill="none"
        stroke={COLORS.accent}
        strokeWidth={7}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={progressBetween(p, 0.7, 1)}
      />
    </g>
  );
};

export const SpendDataAds: React.FC<SpendDataAdsProps> = ({eyebrow, stepOne, stepTwo, stepThree, durationInFrames, showSafeZones}) => {
  const {f, fps} = useTimeline(SPEND_DATA_ADS_BASE, durationInFrames);
  const L = SPEND_DATA_ADS_BASE;

  const card = enter(f, fps, T.card, 16);
  const stackH = 8 + 84 * progressBetween(f, T.stack[0], T.stack[1]);
  const badge = enter(f, fps, T.badge, 10);

  // Picture 1: the cash stack grows, and a blue up arrow lands beside it.
  const spend = (
    <>
      <Decor>
        <div style={{position: 'absolute', left: 4, bottom: 12, ...P3D}}>
          <CashStack width={132} height={stackH} />
        </div>
      </Decor>
      <div
        style={{
          position: 'absolute',
          right: 0,
          top: 0,
          width: 54,
          height: 54,
          borderRadius: '50%',
          background: 'linear-gradient(180deg, #78ADF6 0%, #3D86F0 60%, #3479DF 100%)',
          boxShadow: '0 4px 0 #2C67C2, 0 10px 18px rgba(44,103,194,.28)',
          color: '#FFFFFF',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 36,
          fontWeight: 800,
          lineHeight: 1,
          opacity: badge,
          transform: `scale(${0.6 + 0.4 * badge})`,
        }}
      >
        ↑
      </div>
    </>
  );

  // Picture 2: twelve squares light up one after another.
  const data = (
    <div style={{position: 'absolute', left: 14, top: 4, display: 'grid', gridTemplateColumns: `repeat(4, ${SQ}px)`, gap: SQ_GAP}}>
      {Array.from({length: SQUARES}, (_, i) => {
        const lit = progressBetween(f, T.squares + i * 1.5, T.squares + i * 1.5 + 7);
        return (
          <div key={i} style={{position: 'relative', width: SQ, height: SQ}}>
            <div style={{position: 'absolute', inset: 0, borderRadius: 11, background: '#EEEEF1', boxShadow: 'inset 0 2px 3px rgba(10,10,10,.06)'}} />
            <div
              style={{
                position: 'absolute',
                inset: 0,
                borderRadius: 11,
                background: 'linear-gradient(180deg, #78ADF6 0%, #4A8FF2 40%, #3D86F0 65%, #3479DF 100%)',
                boxShadow: `inset 0 2px 0 rgba(255,255,255,.35), 0 ${(4 * lit).toFixed(2)}px 0 #2C67C2`,
                opacity: lit,
                transform: `translateY(${(-2 * lit).toFixed(2)}px) scale(${(0.7 + 0.3 * lit).toFixed(3)})`,
              }}
            />
          </div>
        );
      })}
    </div>
  );

  // Picture 3: four bars rise, the last and tallest in blue.
  const ads = (
    <div style={{position: 'absolute', left: 14, bottom: 6, width: PIC_W - 28}}>
      <div style={{display: 'flex', alignItems: 'flex-end', gap: BAR_GAP, height: BARS[BARS.length - 1] + 6}}>
        {BARS.map((h, i) => {
          const p = progressBetween(f, T.bars + i * 3, T.bars + i * 3 + 9);
          const last = i === BARS.length - 1;
          return (
            <div
              key={h}
              style={{
                width: BAR_W,
                height: h * p,
                borderRadius: '11px 11px 4px 4px',
                background: last ? 'linear-gradient(180deg, #78ADF6 0%, #3D86F0 55%, #3479DF 100%)' : 'linear-gradient(180deg, #E2E5EC 0%, #CBD0DA 100%)',
                boxShadow: last ? 'inset 0 2px 0 rgba(255,255,255,.35), 0 4px 0 #2C67C2' : 'inset 0 2px 0 rgba(255,255,255,.6), 0 3px 0 #B7BCC8',
              }}
            />
          );
        })}
      </div>
      <div style={{height: 4, marginTop: 8, borderRadius: 2, background: COLORS.track}} />
    </div>
  );

  // Link lines run between the pictures (in the card's own pixels).
  const picTop = (i: number) => i * ROW_H + (ROW_H - PIC_H) / 2;
  const links = [
    {y1: picTop(0) + PIC_H + 6, y2: picTop(1) - 8, p: progressBetween(f, T.link1[0], T.link1[1])},
    {y1: picTop(1) + PIC_H + 6, y2: picTop(2) - 8, p: progressBetween(f, T.link2[0], T.link2[1])},
  ];

  return (
    <BrandFrame
      showSafeZones={showSafeZones}
      backdrop={
        <BackdropStage f={f} length={L}>
          <MoneyGutters f={f} mode="rise" count={8} seed="spend-rise" size={[170, 250]} depth={[-800, -200]} opacity={0.45} blur={2.5} />
        </BackdropStage>
      }
    >
      <Stage3D f={f} length={L}>
        <Eyebrow text={eyebrow} progress={enter(f, fps, 0, 14)} />
        <div style={{height: 40}} />
        <Card3D enter={card} z={40} tilt={{rx: 2, ry: -3}} padding="30px 40px 30px 44px">
          <div style={{position: 'relative', width: '100%', height: ROW_H * 3}}>
            <Row label={stepOne} progress={enter(f, fps, T.one, 14)} picture={spend} />
            <Row label={stepTwo} progress={enter(f, fps, T.two, 14)} picture={data} />
            <Row label={stepThree} progress={enter(f, fps, T.three, 14)} picture={ads} />
            <svg width={PIC_W} height={ROW_H * 3} style={{position: 'absolute', left: 0, top: 0, overflow: 'visible'}}>
              {links.map((l, i) => (
                <Link key={i} y1={l.y1} y2={l.y2} p={l.p} />
              ))}
            </svg>
          </div>
        </Card3D>
      </Stage3D>
    </BrandFrame>
  );
};
