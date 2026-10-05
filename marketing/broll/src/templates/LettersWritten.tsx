import React from 'react';
import {interpolateColors} from 'remotion';
import {
  BrandFrame,
  CARD_EDGE,
  COLORS,
  CONTENT,
  DEPTH,
  Eyebrow,
  P3D,
  SAFE,
  Stage3D,
  TRACK,
  cardShadow,
  enter,
  progressBetween,
  useTimeline,
} from '../brand';
import {SAMPLE_LATER_ROUNDS, SAMPLE_LETTER} from './lettersWrittenSamples';

export type LettersWrittenProps = {
  eyebrow: string;
  headline: string;
  /** Blue chip that points at the lit account line on the letter. Null hides it. */
  accountChip: string | null;
  /** Small, quiet mark on the front page: the client on the sample is made up. */
  sampleLabel: string;
  /** Headings of the five pages behind the Round 1 letter, on tabs 2 to 6. */
  laterRounds: string[];
  durationInFrames?: number;
  showSafeZones?: boolean;
};

export const LETTERS_WRITTEN_BASE = 90;
export const LETTERS_WRITTEN_HERO = 80;

// Words from the notes for "Letters Already Written" (SLO VSL 1: "each one with
// the letter already written, your accounts in it, all six rounds"). The letter
// itself is the real Round 1 letter from the /roadmap sample, word for word.
export const lettersWrittenDefaults: LettersWrittenProps = {
  eyebrow: 'Every letter written',
  headline: 'All six rounds',
  accountChip: 'Your accounts in it',
  sampleLabel: 'Sample',
  laterRounds: SAMPLE_LATER_ROUNDS,
};

// Layout in content-box pixels (900 x 824, y 0 = frame y 400).
const BOX_W = 900;
const BOX_H = 824;
const PAGE_W = 770;
const PAGE_X = 40;
const TAB_W = 46;
const TAB_H = 34;
const STEP = 40; // the strip of each page that shows above the one in front
const STRIP_TOP = 66;
const FRONT_TOP = STRIP_TOP + 5 * STEP; // 266
const FRONT_H = 560;
const SOLID = 392; // the front page is fully opaque down to here (page px) ...
const FADE_END = 488; // ... and gone by here, so it never reaches the headline
const BACK_H = 300; // pages behind end well inside the front page's opaque part
const PAD = 70; // room around the front page for its shadow inside the fade mask

const ENV_W = 880; // wide enough to hide the tabs too
const ENV_H = 560;
const ENV_X = PAGE_X + (PAGE_W + TAB_W) / 2 - ENV_W / 2;
const ENV_TOP = 250;
const FLAP_H = 196;
const V_Y = 0.5 * ENV_H; // where the pocket's V edge meets in the middle
const START_TOP = ENV_TOP + 66; // the pages' top edge while they sit in the envelope

// Small resting tilts and offsets so the pages behind read as loose paper.
const BACK_RZ = [-0.5, 0.45, -0.4, 0.5, -0.45];
const BACK_DX = [-4, 3, -3, 4, -2];
const BACK_Z = 30; // depth between pages once they fan out

const PAPER: React.CSSProperties = {
  background: 'linear-gradient(180deg, #FFFFFF 0%, #FFFFFF 70%, #FCFCFD 100%)',
  ...CARD_EDGE,
  borderRadius: 10,
};

const LINER = 'linear-gradient(180deg, #D9E6FC 0%, #E9F0FD 100%)';

/**
 * The envelope slides down through the bottom of the text zone on its way out.
 * This fade (in envelope pixels) reaches zero right at y 1248, so BrandFrame's
 * clip there never shows as a hard edge across it.
 */
const exitMask = (drop: number): string => {
  const cut = SAFE.bottom - (CONTENT.top + ENV_TOP + drop);
  return `linear-gradient(to bottom, #000 0px, #000 ${cut - 40}px, transparent ${cut}px)`;
};

/** Local y that lands on screen at `y` for a page pushed back to depth `z` (undoes the pull toward the stage center). */
const atDepth = (y: number, z: number): number => BOX_H / 2 + ((y - BOX_H / 2) * (DEPTH.perspective - z)) / DEPTH.perspective;

/** The numbered tab on a page's right edge. */
const Tab: React.FC<{n: number; front?: boolean}> = ({n, front}) => (
  <div
    style={{
      position: 'absolute',
      left: PAGE_W - 4,
      top: 3,
      width: TAB_W,
      height: TAB_H,
      borderRadius: '0 10px 10px 0',
      background: front ? COLORS.accent : '#FFFFFF',
      ...(front ? {} : CARD_EDGE),
      borderLeftWidth: 0,
      boxShadow: front ? '0 6px 14px rgba(61,134,240,.28)' : '0 5px 12px rgba(10,10,10,.06)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      paddingLeft: 4,
      fontSize: 21,
      fontWeight: 700,
      fontVariantNumeric: 'tabular-nums',
      color: front ? COLORS.white : COLORS.gray,
    }}
  >
    {n}
  </div>
);

/** A small down arrow, pointing from the chip to the account line. */
const DownArrow: React.FC = () => (
  <svg width={18} height={20} viewBox="0 0 18 20" style={{display: 'block', flex: '0 0 auto'}}>
    <path d="M9 2 V16 M3 10.5 L9 16.5 L15 10.5" fill="none" stroke={COLORS.accent} strokeWidth={2.8} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/** The real Round 1 letter, set like a business letter. */
const FrontLetter: React.FC<{lit: number; chip: number; chipText: string | null; sampleLabel: string}> = ({lit, chip, chipText, sampleLabel}) => {
  const L = SAMPLE_LETTER;
  return (
    <div style={{padding: '24px 40px 0', fontSize: 20, fontWeight: 500, lineHeight: 1.36, color: COLORS.ink2, letterSpacing: '-0.005em'}}>
      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start'}}>
        <div>
          {L.sender.map((line) => (
            <div key={line}>{line}</div>
          ))}
        </div>
        {sampleLabel ? (
          <span
            style={{
              marginTop: 2,
              fontSize: 15,
              fontWeight: 600,
              letterSpacing: '0.3em',
              textTransform: 'uppercase',
              color: 'rgba(17,17,19,.36)',
              border: '1.5px solid rgba(17,17,19,.14)',
              borderRadius: 6,
              padding: '5px 6px 5px 10px',
              lineHeight: 1,
            }}
          >
            {sampleLabel}
          </span>
        ) : null}
      </div>
      <div style={{marginTop: 12}}>{L.date}</div>
      <div style={{marginTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end'}}>
        <div>
          {L.bureau.map((line) => (
            <div key={line}>{line}</div>
          ))}
        </div>
        {chipText ? (
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 10,
              marginBottom: -2,
              padding: '9px 18px 9px 14px',
              borderRadius: 999,
              background: '#EEF4FE',
              border: `2px solid ${COLORS.accentLine}`,
              boxShadow: '0 3px 0 -1px rgba(61,134,240,.22), 0 10px 20px rgba(61,134,240,.14)',
              color: COLORS.accent,
              fontSize: 22,
              fontWeight: 700,
              letterSpacing: '-0.01em',
              lineHeight: 1.1,
              whiteSpace: 'nowrap',
              opacity: chip,
              transform: `translateY(${(1 - chip) * 10}px)`,
            }}
          >
            <DownArrow />
            {chipText}
          </div>
        ) : null}
      </div>
      <div style={{marginTop: 14, fontSize: 22, fontWeight: 700, lineHeight: 1.36, color: COLORS.ink}}>
        <div>{L.rePrefix}</div>
        <div>
          <span
            style={{
              backgroundImage: 'linear-gradient(rgba(61,134,240,.15), rgba(61,134,240,.15))',
              backgroundRepeat: 'no-repeat',
              backgroundSize: `${lit * 100}% 100%`,
              borderRadius: 6,
              padding: '2px 8px',
              margin: '0 -8px',
              color: interpolateColors(lit, [0, 1], [COLORS.ink, COLORS.accent]),
            }}
          >
            {L.reAccount}
          </span>
        </div>
      </div>
      <div style={{marginTop: 14}}>{L.salutation}</div>
      <div style={{marginTop: 8, fontSize: 16, fontWeight: 400, lineHeight: 1.5, color: COLORS.gray}}>
        {L.body.map((b) =>
          b.kind === 'item' ? (
            <div key={b.text} style={{marginTop: 10, fontWeight: 700, color: COLORS.ink2}}>
              {b.text}
            </div>
          ) : b.kind === 'cite' ? (
            <div key={b.text} style={{fontSize: 14, fontWeight: 500, color: COLORS.gray2}}>
              {b.text}
            </div>
          ) : (
            <div key={b.text.slice(0, 24)} style={{marginTop: 4}}>
              {b.text}
            </div>
          ),
        )}
      </div>
    </div>
  );
};

/**
 * One part of the envelope, drawn in envelope pixels, moved with the others as
 * a unit. It only slides straight down on the way out: any tilt would swing the
 * pocket back through the letters and they would pop in front of it.
 */
const EnvPart: React.FC<{drop: number; z: number; children: React.ReactNode}> = ({drop, z, children}) => (
  <div
    style={{
      position: 'absolute',
      left: ENV_X,
      top: ENV_TOP,
      width: ENV_W,
      height: ENV_H,
      ...P3D,
      transform: `translate3d(0, ${drop}px, ${z}px)`,
    }}
  >
    {children}
  </div>
);

export const LettersWritten: React.FC<LettersWrittenProps> = ({
  eyebrow,
  headline,
  accountChip,
  sampleLabel,
  laterRounds,
  durationInFrames,
  showSafeZones,
}) => {
  const {f, fps} = useTimeline(LETTERS_WRITTEN_BASE, durationInFrames);
  const L = LETTERS_WRITTEN_BASE;
  const rounds = laterRounds.slice(0, 5);

  const envIn = enter(f, fps, 0, 16); // the envelope (with the letters inside) comes forward
  const envShow = progressBetween(f, 0, 6); // it is fully opaque before it lands ...
  const pagesShow = progressBetween(f, 5, 7); // ... so the letters never show through it
  const flap = progressBetween(f, 8, 21); // flap opens
  const envOut = progressBetween(f, 20, 36); // envelope drops away below the letters
  const envFade = progressBetween(f, 23, 34);
  const rise = enter(f, fps, 18, 20); // letters lift out
  const forward = enter(f, fps, 36, 18); // front letter comes toward the camera
  const lit = progressBetween(f, 46, 58); // the account line lights blue
  const chip = enter(f, fps, 52, 12);
  const head = enter(f, fps, 58, 14);

  const frontTop = START_TOP + (FRONT_TOP - START_TOP) * rise;
  const drop = 470 * envOut;
  const envOpacity = envShow * (1 - envFade);
  const q = 1 - envIn;
  const entrance = `translate3d(0, ${q * 40}px, ${-q * 320}px) rotateX(${q * 14}deg)`;

  // The flap swings toward the camera: closed half in front of the pocket, open half on the back panel.
  const closedTurn = Math.min(1, flap * 2) * 90;
  const openTurn = -90 * (1 - Math.max(0, flap * 2 - 1));

  const mask = `linear-gradient(to bottom, #000 0px, #000 ${PAD + SOLID}px, transparent ${PAD + FADE_END}px)`;

  return (
    <BrandFrame showSafeZones={showSafeZones}>
      <Stage3D f={f} length={L} drift={0.6}>
        <div style={{position: 'relative', width: BOX_W, height: BOX_H, flex: '0 0 auto', ...P3D}}>
          <div style={{position: 'absolute', left: 0, right: 0, top: 0}}>
            <Eyebrow text={eyebrow} progress={enter(f, fps, 0, 14)} />
          </div>

          <div style={{position: 'absolute', inset: 0, ...P3D, transform: entrance}}>
            {/* envelope back panel, its blue liner shows inside */}
            {envOpacity > 0.001 ? (
              <EnvPart drop={drop} z={-24}>
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    borderRadius: 16,
                    background: LINER,
                    opacity: envOpacity,
                    WebkitMaskImage: exitMask(drop),
                    maskImage: exitMask(drop),
                  }}
                />
              </EnvPart>
            ) : null}
            {/* open flap, standing up from the back panel */}
            {flap > 0.5 && envOpacity > 0.001 ? (
              <EnvPart drop={drop} z={-24}>
                <div
                  style={{
                    position: 'absolute',
                    left: 0,
                    top: -FLAP_H,
                    width: ENV_W,
                    height: FLAP_H,
                    transformOrigin: '50% 100%',
                    transform: `rotateX(${openTurn}deg)`,
                  }}
                >
                  <svg width={ENV_W} height={FLAP_H} viewBox={`0 0 ${ENV_W} ${FLAP_H}`} style={{display: 'block', overflow: 'visible', opacity: envOpacity}}>
                    <defs>
                      <linearGradient id="lw-liner" x1="0" y1="1" x2="0" y2="0">
                        <stop offset="0%" stopColor="#D9E6FC" />
                        <stop offset="100%" stopColor="#EAF1FE" />
                      </linearGradient>
                    </defs>
                    <path
                      d={`M 0 ${FLAP_H} L ${ENV_W / 2 - 40} 14 Q ${ENV_W / 2} -6 ${ENV_W / 2 + 40} 14 L ${ENV_W} ${FLAP_H} Z`}
                      fill="url(#lw-liner)"
                      stroke="rgba(61,134,240,.22)"
                      strokeWidth={2}
                    />
                  </svg>
                </div>
              </EnvPart>
            ) : null}

            {/* the five pages behind, deepest first */}
            {rounds
              .map((title, i) => {
                const j = i + 1;
                const p = enter(f, fps, 34 + i * 3, 18);
                const zRest = -BACK_Z * j;
                const z = -3 * j + (zRest + 3 * j) * p;
                const yRest = atDepth(FRONT_TOP - j * STEP, zRest);
                const y = frontTop + (yRest - FRONT_TOP) * p;
                // grown by what the depth takes away, so every page and tab keeps the front page's size
                const grow = (DEPTH.perspective - z) / DEPTH.perspective;
                return (
                  <div
                    key={title}
                    style={{
                      position: 'absolute',
                      left: PAGE_X,
                      top: y,
                      width: PAGE_W,
                      height: BACK_H,
                      ...PAPER,
                      boxShadow: cardShadow(0.5),
                      opacity: pagesShow,
                      transformOrigin: '50% 0%',
                      transform: `translate3d(${BACK_DX[i] * p}px, 0, ${z}px) rotateZ(${BACK_RZ[i] * p}deg) scale(${grow})`,
                    }}
                  >
                    <div
                      style={{
                        height: STEP,
                        display: 'flex',
                        alignItems: 'center',
                        padding: '0 40px',
                        fontSize: 21,
                        fontWeight: 700,
                        letterSpacing: TRACK.body,
                        color: COLORS.ink2,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {title}
                    </div>
                    <Tab n={j + 1} />
                  </div>
                );
              })
              .reverse()}

            {/* the Round 1 letter: real text, square to the camera once it lands */}
            <div
              style={{
                position: 'absolute',
                left: PAGE_X - PAD,
                top: frontTop - PAD,
                width: PAGE_W + TAB_W + PAD * 2,
                height: FRONT_H + PAD * 2,
                opacity: pagesShow,
                transform: `translateZ(${26 * forward}px) rotateX(${-1.4 * forward}deg) rotateY(${-1.2 * forward}deg)`,
                WebkitMaskImage: mask,
                maskImage: mask,
              }}
            >
              <div style={{position: 'absolute', left: PAD, top: PAD, width: PAGE_W, height: FRONT_H, ...PAPER, boxShadow: cardShadow(0.8)}}>
                <FrontLetter lit={lit} chip={chip} chipText={accountChip} sampleLabel={sampleLabel} />
                <Tab n={1} front />
              </div>
            </div>

            {/* envelope pocket, in front of the letters */}
            {envOpacity > 0.001 ? (
              <EnvPart drop={drop} z={14}>
                <svg
                  width={ENV_W}
                  height={ENV_H}
                  viewBox={`0 0 ${ENV_W} ${ENV_H}`}
                  style={{
                    display: 'block',
                    overflow: 'visible',
                    opacity: envOpacity,
                    filter: 'drop-shadow(0 4px 0 #DCDCE1) drop-shadow(0 26px 30px rgba(10,10,10,.10))',
                    WebkitMaskImage: exitMask(drop),
                    maskImage: exitMask(drop),
                  }}
                >
                  <defs>
                    <linearGradient id="lw-pocket" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#FFFFFF" />
                      <stop offset="100%" stopColor="#F5F6F8" />
                    </linearGradient>
                  </defs>
                  <path
                    d={`M 0 0 L ${ENV_W / 2} ${V_Y} L ${ENV_W} 0 L ${ENV_W} ${ENV_H - 16} Q ${ENV_W} ${ENV_H} ${ENV_W - 16} ${ENV_H} L 16 ${ENV_H} Q 0 ${ENV_H} 0 ${ENV_H - 16} Z`}
                    fill="url(#lw-pocket)"
                    stroke="#E4E4E7"
                    strokeWidth={2}
                    strokeLinejoin="round"
                  />
                  {/* the bottom flap's folds */}
                  <path
                    d={`M 6 ${ENV_H - 6} L ${ENV_W / 2} ${V_Y + 44} L ${ENV_W - 6} ${ENV_H - 6}`}
                    fill="rgba(10,10,10,.018)"
                    stroke="#E7E7EB"
                    strokeWidth={2}
                    strokeLinejoin="round"
                  />
                </svg>
              </EnvPart>
            ) : null}
            {/* closed flap, folded over the pocket */}
            {flap <= 0.5 && envOpacity > 0.001 ? (
              <EnvPart drop={drop} z={16}>
                <div style={{position: 'absolute', left: 0, top: 0, width: ENV_W, height: FLAP_H, transformOrigin: '50% 0%', transform: `rotateX(${closedTurn}deg)`}}>
                  <svg
                    width={ENV_W}
                    height={FLAP_H}
                    viewBox={`0 0 ${ENV_W} ${FLAP_H}`}
                    style={{display: 'block', overflow: 'visible', opacity: envOpacity, filter: 'drop-shadow(0 6px 8px rgba(10,10,10,.08))'}}
                  >
                    <path
                      d={`M 0 0 L ${ENV_W} 0 L ${ENV_W / 2 + 40} ${FLAP_H - 14} Q ${ENV_W / 2} ${FLAP_H + 6} ${ENV_W / 2 - 40} ${FLAP_H - 14} Z`}
                      fill="#FFFFFF"
                      stroke="#E4E4E7"
                      strokeWidth={2}
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
              </EnvPart>
            ) : null}
          </div>

          <div
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: 0,
              textAlign: 'center',
              fontSize: 62,
              fontWeight: 800,
              letterSpacing: TRACK.h2,
              lineHeight: 1.04,
              color: COLORS.ink,
              opacity: head,
              transform: `translate3d(0, ${(1 - head) * 18}px, 40px)`,
            }}
          >
            {headline}
          </div>
        </div>
      </Stage3D>
    </BrandFrame>
  );
};
