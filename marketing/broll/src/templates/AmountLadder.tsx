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
  formatDollars,
  useTimeline,
} from '../brand';

// AmountLadder (reference ad "Scale without your own cash", script line 37):
// "Maybe your business makes $10,000 a month, maybe $20,000 a month, maybe
// $50,000 a month. ... if you want to get past $100,000 a month, you need
// capital to get there."
//
// One idea: a ladder of amounts. A cash stack sits on the lowest rung and
// climbs, rung by rung. Each rung shows its amount as it arrives. The top rung
// is the line to get past: it is dashed and blue, and the stack ends up above
// it with a blue slab of new cash on top. Amounts are the line's own, written
// out in full, and the rungs are evenly spaced: the picture says "up", it does
// not scale the dollars. Reusable for any "$A, $B, $C ... past $Z" line: pass
// the amounts lowest first.

export type AmountLadderProps = {
  /** The small line above the card. */
  eyebrow: string;
  /** Whole dollars, lowest first, 2 to 5 of them. The last is the line the stack climbs past. */
  amounts: number[];
  /** Said after each amount ("a month"). Empty hides it. */
  suffix: string;
  /** The line under the card. Null hides it. */
  subline: string | null;
  durationInFrames?: number;
  showSafeZones?: boolean;
};

export const AMOUNT_LADDER_BASE = 90;
/** The stack has climbed past the top rung and the subline is in. */
export const AMOUNT_LADDER_HERO = 86;

export const amountLadderDefaults: AmountLadderProps = {
  eyebrow: "Wherever you're starting",
  amounts: [10000, 20000, 50000, 100000],
  suffix: 'a month',
  subline: 'You need capital to get there.',
};

/** The inner box of the card: where rungs, words and the stack are drawn. */
const W = 812;
/** Room above the top rung for the stack to climb past it. */
const HEAD = 186;
const STEP = 100;
const FOOT = 26;
const STACK_W = 190;
const STACK_D = STACK_W / 2.35;
/** Half the height of the stack's footprint on screen (the stack is turned 26 degrees and tipped 58, as CashStack draws it). */
const STACK_HALF = (0.5299 * (STACK_W * 0.4384 + STACK_D * 0.8988)) / 2;
/** Center of the column the stack climbs in, from the left of the inner box. */
const STACK_X = W - 124;
/** How far above the top rung the stack ends up. */
const PAST = 48;

/** First climb starts here; the last one has landed by frame 74. */
const CLIMB_FROM = 18;
const CLIMB_LANDED = 74;
const HOP = 14;

export const AmountLadder: React.FC<AmountLadderProps> = ({eyebrow, amounts, suffix, subline, durationInFrames, showSafeZones}) => {
  const {f, fps} = useTimeline(AMOUNT_LADDER_BASE, durationInFrames);
  const L = AMOUNT_LADDER_BASE;

  const list = amounts.slice(0, 5);
  const n = Math.max(1, list.length);
  const H = HEAD + (n - 1) * STEP + FOOT;
  const rungY = (i: number) => HEAD + (n - 1 - i) * STEP;

  // Hop k (1 to n-1) lifts the stack from rung k-1 to rung k; hop n lifts it past the top rung.
  const step = Math.min(16, (CLIMB_LANDED - HOP - CLIMB_FROM) / Math.max(1, n - 1));
  const hopStart = (k: number) => CLIMB_FROM + (k - 1) * step;
  const hop = (k: number) => enter(f, fps, hopStart(k), HOP);

  let up = 0;
  for (let k = 1; k < n; k++) up += hop(k);
  const past = hop(n);
  const thick = 14 + (n > 1 ? (30 * up) / (n - 1) : 0);
  const slab = 22 * past;

  // The stack's footprint sits on the rung line; the last hop lifts it clear of the top rung.
  const onLine = rungY(0) - 4 - STEP * up - PAST * past;
  const stackTop = onLine - STACK_D / 2 - STACK_HALF;
  // A short blue arrow in the gap between the dashed line and the stack.
  const arrowTip = rungY(n - 1) - 8 - (PAST - 14) * past;

  const card = enter(f, fps, 4, 16);

  return (
    <BrandFrame
      showSafeZones={showSafeZones}
      backdrop={
        <BackdropStage f={f} length={L}>
          <MoneyGutters f={f} mode="rise" count={8} seed="ladder-rise" size={[170, 250]} depth={[-800, -200]} opacity={0.45} blur={2.5} />
        </BackdropStage>
      }
    >
      <Stage3D f={f} length={L}>
        <Eyebrow text={eyebrow} progress={enter(f, fps, 0, 14)} />
        <div style={{height: 40}} />
        <Card3D enter={card} z={40} tilt={{rx: 2, ry: -3}} padding="26px 40px 30px 44px">
          <div style={{position: 'relative', width: W, height: H, ...P3D}}>
            {/* the rungs, and the arrow that points up past the top one */}
            <svg width={W} height={H} style={{position: 'absolute', left: 0, top: 0, overflow: 'visible'}}>
              {list.map((_, i) => {
                const top = i === n - 1;
                const shown = i === 0 ? enter(f, fps, 4, 12) : enter(f, fps, hopStart(i) - 4, 12);
                return top ? (
                  <line key={i} x1={0} x2={W} y1={rungY(i)} y2={rungY(i)} stroke={COLORS.accent} strokeWidth={5} strokeLinecap="round" strokeDasharray="16 14" opacity={shown} />
                ) : (
                  <line
                    key={i}
                    x1={0}
                    x2={W}
                    y1={rungY(i)}
                    y2={rungY(i)}
                    stroke={COLORS.track}
                    strokeWidth={4}
                    strokeLinecap="round"
                    pathLength={1}
                    strokeDasharray={1}
                    strokeDashoffset={1 - shown}
                  />
                );
              })}
              {past > 0.05 ? (
                <g opacity={Math.min(1, past * 1.6)}>
                  <line x1={STACK_X} x2={STACK_X} y1={rungY(n - 1) - 8} y2={arrowTip} stroke={COLORS.accent} strokeWidth={6} strokeLinecap="round" />
                  <path
                    d={`M ${STACK_X - 13} ${arrowTip + 13} L ${STACK_X} ${arrowTip} L ${STACK_X + 13} ${arrowTip + 13}`}
                    fill="none"
                    stroke={COLORS.accent}
                    strokeWidth={6}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </g>
              ) : null}
            </svg>

            {/* the amounts, one on each rung, in as the stack gets to them */}
            {list.map((amount, i) => {
              const top = i === n - 1;
              const shown = i === 0 ? enter(f, fps, 6, 14) : enter(f, fps, hopStart(i) - 2, 14);
              return (
                <div
                  key={i}
                  style={{
                    ...fadeUp(shown, 16),
                    position: 'absolute',
                    left: 0,
                    top: rungY(i) - 14 - 78,
                    height: 78,
                    display: 'flex',
                    alignItems: 'baseline',
                    gap: 16,
                    whiteSpace: 'nowrap',
                    color: top ? COLORS.accent : COLORS.ink,
                  }}
                >
                  <span style={{fontSize: 72, fontWeight: 800, letterSpacing: TRACK.num, lineHeight: 1.08, fontVariantNumeric: 'tabular-nums'}}>
                    {formatDollars(amount)}
                  </span>
                  {suffix ? <span style={{fontSize: 34, fontWeight: 600, letterSpacing: TRACK.body, color: COLORS.gray2}}>{suffix}</span> : null}
                </div>
              );
            })}

            {/* the cash stack that climbs: green all the way, with a blue slab of new cash on top once it is past the line */}
            <Decor>
              <div style={{position: 'absolute', left: STACK_X - STACK_W / 2, top: stackTop, width: STACK_W, height: STACK_D, ...P3D}}>
                <CashStack width={STACK_W} height={thick} />
                {slab > 0.5 ? (
                  <div style={{position: 'absolute', left: 0, top: 0, ...P3D}}>
                    <CashStack width={STACK_W} height={slab} base={thick} tone="accent" strap={false} shadow={false} />
                  </div>
                ) : null}
              </div>
            </Decor>
          </div>
        </Card3D>
        {subline ? (
          <div
            style={{
              ...fadeUp(enter(f, fps, 70, 14), 18),
              marginTop: 40,
              maxWidth: 860,
              textWrap: 'balance',
              fontSize: 48,
              fontWeight: 600,
              letterSpacing: TRACK.body,
              lineHeight: 1.22,
              color: COLORS.ink2,
              textAlign: 'center',
            }}
          >
            {subline}
          </div>
        ) : null}
      </Stage3D>
    </BrandFrame>
  );
};
