import React from 'react';
import {interpolateColors} from 'remotion';
import {
  BrandFrame,
  COLORS,
  CONTENT,
  CONTENT_WIDTH,
  Card3D,
  DEPTH,
  Eyebrow,
  GroundShadow,
  P3D,
  Stage3D,
  TRACK,
  cardShadow,
  enter,
  progressBetween,
  useTimeline,
} from '../brand';

export type PickYourPathProps = {
  /** Small line on top, in the script's words. */
  eyebrow: string;
  /** Two or three lanes, left to right, in the words of the script line. */
  lanes: string[];
  /** Which lane lights up blue (0 is the first lane). The others stay gray. */
  lit: number;
  durationInFrames?: number;
  showSafeZones?: boolean;
};

export const PICK_YOUR_PATH_BASE = 90;
export const PICK_YOUR_PATH_HERO = 80;

// Words from the 9/30 /watch VSL: "Wherever your file is right now, Fundhub has a
// solution for that phase." then "If your file is ready ..." / "If something on
// your report is holding you back ..." / "And if you'd rather do the work on your
// file yourself ...". Ad 24 passes two lanes: ['We fix your file', 'You fix it yourself'].
export const pickYourPathDefaults: PickYourPathProps = {
  eyebrow: 'Wherever you are',
  lanes: ['If your file is ready', 'If something is holding it back', "If you'd rather do it yourself"],
  lit: 1,
};

type Pt = {x: number; y: number};

// The path lies on a floor tilted far back, so the lanes run off into the
// distance. The file lies at the near end. Each lane ends at a card that stands
// up and faces the viewer; far cards are scaled back up so their words stay big.
// Floor coordinates: x across, y from the far edge (0) to the near edge (FLOOR_L).
// The layout is set by where things should land on screen (content y), and the
// floor position for each is solved from the stage's perspective.
const W = CONTENT_WIDTH; // 900
const H = CONTENT.bottom - CONTENT.top; // 824
const MID = W / 2;
const TILT = 56;
const COS = Math.cos((TILT * Math.PI) / 180);
const SIN = Math.sin((TILT * Math.PI) / 180);
const PERSP = DEPTH.perspective;
const ORIGIN_Y = H / 2; // Stage3D looks at the middle of the content box
const FLOOR_NEAR = 806; // content y of the floor's near edge
const FLOOR_L = 1300;
/** A deep floor swings a lot under the camera, so this clip drifts at half strength. */
const DRIFT = 0.5;

/** How far back along the floor (from its near edge) a point sits when it shows at content height `y`. */
const depthFor = (y: number): number => ((FLOOR_NEAR - y) * PERSP) / ((y - ORIGIN_Y) * SIN + COS * PERSP);
/** How much the perspective shrinks anything at that depth. */
const shrinkAt = (d: number): number => PERSP / (PERSP + d * SIN);
/** The floor point that shows at screen spot (x, y). */
const floorAt = (x: number, y: number): Pt => {
  const d = depthFor(y);
  return {x: MID + (x - MID) / shrinkAt(d), y: FLOOR_L - d};
};

const LANE = 22;
const CARD_H = 150;
const LABEL = 48;
const NODE = 32;
const NODE_AHEAD = 80; // floor units between a card's foot and its node

// Where things land on screen (content px).
const FAR_FOOT = 222; // foot of the far card(s)
const SIDE_FOOT = 412; // foot of the side cards
const SPLIT_Y = 588;
const FILE_TOP_Y = 630;
const FILE_BOTTOM_Y = 796;

const FILE_W = 224;
const FILE_FAR = floorAt(MID, FILE_TOP_Y).y;
const FILE_NEAR = floorAt(MID, FILE_BOTTOM_Y).y;
const START: Pt = {x: MID, y: FILE_FAR + 60}; // under the file, so the path comes out of it
const SPLIT: Pt = floorAt(MID, SPLIT_Y);

type Slot = {foot: Pt; width: number; node: Pt; scale: number};
/** A card whose foot shows at screen spot (x, y), `width` px wide on screen at rest. */
const slot = (x: number, y: number, width: number): Slot => {
  const foot = floorAt(x, y);
  const s = shrinkAt(FLOOR_L - foot.y);
  // Scale the card back up for its distance, leaving a hint of depth (far cards a few percent smaller).
  const look = 1 - 0.07 * (1 - s) * 2;
  return {foot, width: width / look, node: {x: foot.x, y: foot.y + NODE_AHEAD}, scale: look / s};
};

/** Three lanes make a trident (the middle one runs furthest); two make a Y. */
const slotsFor = (n: number): Slot[] =>
  n >= 3
    ? [slot(205, SIDE_FOOT, 420), slot(MID, FAR_FOOT, 530), slot(695, SIDE_FOOT, 420)]
    : [slot(225, FAR_FOOT + 40, 420), slot(675, FAR_FOOT + 40, 420)];

const cubicAt = (a: Pt, b: Pt, c: Pt, d: Pt, t: number): Pt => {
  const u = 1 - t;
  return {
    x: u * u * u * a.x + 3 * u * u * t * b.x + 3 * u * t * t * c.x + t * t * t * d.x,
    y: u * u * u * a.y + 3 * u * u * t * b.y + 3 * u * t * t * c.y + t * t * t * d.y,
  };
};

/** One route from the file to a lane end: straight on to the split, then a smooth S into the lane. */
type Route = {d: string; pts: Pt[]; cum: number[]};
const routeTo = (end: Pt): Route => {
  const pts: Pt[] = [START, SPLIT];
  let d = `M ${START.x} ${START.y} L ${SPLIT.x} ${SPLIT.y}`;
  if (Math.abs(end.x - SPLIT.x) < 0.5) {
    pts.push(end);
    d += ` L ${end.x} ${end.y}`;
  } else {
    const k = (SPLIT.y - end.y) * 0.5;
    const c1 = {x: SPLIT.x, y: SPLIT.y - k};
    const c2 = {x: end.x, y: end.y + k};
    d += ` C ${c1.x} ${c1.y} ${c2.x} ${c2.y} ${end.x} ${end.y}`;
    for (let i = 1; i <= 48; i++) pts.push(cubicAt(SPLIT, c1, c2, end, i / 48));
  }
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  return {d, pts, cum};
};

/** The point a fraction `p` of the way along a route (by length), so the lead ball matches the drawn line. */
const pointAt = (r: Route, p: number): Pt => {
  const target = Math.max(0, Math.min(1, p)) * r.cum[r.cum.length - 1];
  for (let i = 1; i < r.pts.length; i++) {
    if (r.cum[i] >= target) {
      const t = (target - r.cum[i - 1]) / (r.cum[i] - r.cum[i - 1] || 1);
      return {x: r.pts[i - 1].x + (r.pts[i].x - r.pts[i - 1].x) * t, y: r.pts[i - 1].y + (r.pts[i].y - r.pts[i - 1].y) * t};
    }
  }
  return r.pts[r.pts.length - 1];
};

/**
 * A lane drawn as a thick ribbon on the floor, lit from the top left: a soft
 * shadow, darker copies toward the viewer for its side, then the top and a thin
 * highlight. Offsets are in floor units, so they are larger than they look.
 */
const Ribbon: React.FC<{d: string; p: number; top: string; side: string; shadow: number}> = ({d, p, top, side, shadow}) => {
  if (p <= 0.002) return null;
  const line = {d, fill: 'none', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, pathLength: 1, strokeDasharray: `${p} 2`};
  return (
    <g>
      <path {...line} transform="translate(12 30)" stroke={`rgba(10,10,10,${shadow})`} strokeWidth={LANE + 14} />
      {[
        [2.6, 15],
        [1.8, 10],
        [0.9, 5],
      ].map(([dx, dy]) => (
        <path key={dy} {...line} transform={`translate(${dx} ${dy})`} stroke={side} strokeWidth={LANE} />
      ))}
      <path {...line} stroke={top} strokeWidth={LANE} />
      <path {...line} transform="translate(-5 -7)" stroke="rgba(255,255,255,.55)" strokeWidth={3} />
    </g>
  );
};

const BALL_GRAY = 'radial-gradient(circle at 34% 30%, #FFFFFF 0%, #F4F4F5 45%, #D4D4D8 100%)';
const BALL_BLUE = 'radial-gradient(circle at 34% 30%, #FFFFFF 0%, #A9C9F8 20%, #3D86F0 60%, #2C67C2 100%)';

/** A glossy ball sitting on the floor. It faces the camera, so it always reads round. */
const Ball: React.FC<{at: Pt; on: number; show: number; size?: number}> = ({at, on, show, size = NODE}) => (
  <div
    style={{
      position: 'absolute',
      left: at.x - size / 2,
      top: at.y - size / 2,
      width: size,
      height: size,
      ...P3D,
      transform: `translateZ(${size / 2}px) rotateX(${-TILT}deg)`,
    }}
  >
    <div
      style={{
        position: 'absolute',
        inset: 0,
        borderRadius: '50%',
        background: on > 0.5 ? BALL_BLUE : BALL_GRAY,
        border: `3px solid ${on > 0.5 ? COLORS.accent : '#C4C4CB'}`,
        boxShadow: `0 0 0 ${12 * on}px rgba(61,134,240,${0.14 * on}), 0 0 0 ${26 * on}px rgba(61,134,240,${0.06 * on}), 0 8px 14px rgba(10,10,10,.14)`,
        opacity: show,
        transform: `scale(${0.6 + 0.4 * show})`,
      }}
    />
  </div>
);

/** The file lying at the start of the path: a page whose header bar turns blue when its lane lights. */
const FilePage: React.FC<{show: number; lit: number}> = ({show, lit}) => (
  <Card3D
    enter={show}
    from="below"
    z={12}
    elevation={0.6}
    radius={24}
    padding="34px 30px"
    width={FILE_W}
    style={{height: FILE_NEAR - FILE_FAR, boxSizing: 'border-box'}}
  >
    <div style={{width: '62%', height: 20, borderRadius: 10, background: interpolateColors(lit, [0, 1], [COLORS.track, COLORS.accent])}} />
    {[0.94, 0.78, 0.88, 0.64, 0.82].map((w, i) => (
      <div key={i} style={{marginTop: i === 0 ? 30 : 18, width: `${w * 100}%`, height: 14, borderRadius: 7, background: COLORS.line}} />
    ))}
  </Card3D>
);

export const PickYourPath: React.FC<PickYourPathProps> = ({eyebrow, lanes, lit, durationInFrames, showSafeZones}) => {
  const {f, fps} = useTimeline(PICK_YOUR_PATH_BASE, durationInFrames);
  const L = PICK_YOUR_PATH_BASE;
  const list = lanes.slice(0, 3);
  const slots = slotsFor(list.length);
  const chosen = Math.max(0, Math.min(list.length - 1, Math.round(lit)));
  const routes = slots.map((s) => routeTo(s.node));
  const litRoute = routes[chosen];

  const page = enter(f, fps, 3, 16);
  const draw = progressBetween(f, 9, 32); // gray lanes run out from the file
  const nodesIn = enter(f, fps, 26, 12);
  const run = progressBetween(f, 40, 60); // the chosen lane lights up
  const pageLit = enter(f, fps, 37, 12);
  const arrive = enter(f, fps, 58, 10);
  const pick = enter(f, fps, 57, 16);
  const head = pointAt(litRoute, run);

  return (
    <BrandFrame showSafeZones={showSafeZones}>
      <Stage3D f={f} length={L} drift={DRIFT}>
        <div style={{position: 'relative', width: W, height: H, ...P3D}}>
          <div style={{position: 'absolute', left: 0, right: 0, top: 0}}>
            <Eyebrow text={eyebrow} progress={enter(f, fps, 0, 14)} />
          </div>

          <div
            style={{
              position: 'absolute',
              left: 0,
              top: FLOOR_NEAR - FLOOR_L,
              width: W,
              height: FLOOR_L,
              ...P3D,
              transformOrigin: '50% 100%',
              transform: `rotateX(${TILT}deg)`,
            }}
          >
            {/* contact shadows on the floor */}
            {slots.map((s, i) => (
              <GroundShadow
                key={`gs${i}`}
                width={s.width * s.scale * 0.8}
                height={110}
                strength={0.1}
                style={{position: 'absolute', left: s.foot.x - s.width * s.scale * 0.4, top: s.foot.y - 70, opacity: enter(f, fps, 22 + i * 3, 16)}}
              />
            ))}
            <GroundShadow
              width={FILE_W * 1.4}
              height={(FILE_NEAR - FILE_FAR) * 1.1}
              strength={0.12}
              style={{position: 'absolute', left: MID - FILE_W * 0.7, top: FILE_FAR + 20, opacity: page}}
            />

            {/* gray lanes, then the chosen one in blue on top */}
            <svg width={W} height={FLOOR_L} viewBox={`0 0 ${W} ${FLOOR_L}`} style={{position: 'absolute', inset: 0, overflow: 'visible', transform: 'translateZ(1px)'}}>
              {routes.map((r, i) => (
                <Ribbon key={i} d={r.d} p={draw} top="#E7E7EB" side="#C9C9D0" shadow={0.06} />
              ))}
            </svg>
            <svg width={W} height={FLOOR_L} viewBox={`0 0 ${W} ${FLOOR_L}`} style={{position: 'absolute', inset: 0, overflow: 'visible', transform: 'translateZ(2px)'}}>
              <Ribbon d={litRoute.d} p={run} top={COLORS.accent} side="#2558A8" shadow={0.08} />
            </svg>

            {slots.map((s, i) => (
              <Ball key={`n${i}`} at={s.node} on={i === chosen ? arrive : 0} show={nodesIn} />
            ))}
            {run > 0.01 && run < 0.995 ? <Ball at={head} on={1} show={1} size={NODE + 4} /> : null}

            <div style={{position: 'absolute', left: MID - FILE_W / 2, top: FILE_FAR, width: FILE_W, height: FILE_NEAR - FILE_FAR, ...P3D}}>
              <FilePage show={page} lit={pageLit} />
            </div>

            {/* lane cards stand up at the lane ends, facing the camera */}
            {slots.map((s, i) => {
              const isLit = i === chosen;
              const show = enter(f, fps, 22 + i * 3, 16);
              const on = isLit ? pick : 0;
              const dim = isLit ? 0 : pick;
              return (
                <div
                  key={`c${i}`}
                  style={{
                    position: 'absolute',
                    left: s.foot.x - s.width / 2,
                    top: s.foot.y - CARD_H,
                    width: s.width,
                    height: CARD_H,
                    ...P3D,
                    transformOrigin: '50% 100%',
                    transform: `rotateX(${-TILT}deg) scale(${s.scale}) translateZ(${20 * on - 6 * dim}px)`,
                  }}
                >
                  <Card3D
                    enter={show}
                    z={0}
                    elevation={0.7 + 0.3 * on}
                    radius={30}
                    padding="0 30px"
                    style={{
                      height: '100%',
                      boxSizing: 'border-box',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      opacity: show * (1 - 0.08 * dim),
                      ...(on > 0.01
                        ? {
                            borderColor: interpolateColors(on, [0, 1], ['#E4E4E7', COLORS.accent]),
                            boxShadow: `${cardShadow(0.7 + 0.3 * on)}, 0 0 0 ${7 * on}px rgba(61,134,240,${0.14 * on}), 0 24px 48px rgba(61,134,240,${0.18 * on})`,
                          }
                        : {}),
                    }}
                  >
                    <span
                      style={{
                        fontSize: LABEL,
                        fontWeight: 700,
                        letterSpacing: TRACK.body,
                        lineHeight: 1.1,
                        textAlign: 'center',
                        textWrap: 'balance',
                        color: interpolateColors(dim, [0, 1], [COLORS.ink, COLORS.gray2]),
                      }}
                    >
                      {list[i]}
                    </span>
                  </Card3D>
                </div>
              );
            })}
          </div>
        </div>
      </Stage3D>
    </BrandFrame>
  );
};
