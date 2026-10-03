import React from 'react';
import {Composition, Easing, Img, interpolate, staticFile, useCurrentFrame} from 'remotion';
// Imported file by file, not from '../brand', so this template never loads the
// web font: it has no text, and it renders where fonts.gstatic.com is blocked.
import {Grid} from '../brand/Grid';
import {FRAME, SAFE, SAFE_HEIGHT} from '../brand/tokens';
import {APPROVAL_CARDS, type ApprovalCard} from './approvalCards';

// ApprovalCarousel: the real client approvals rotate past on a carousel, one at
// a time. Nothing else on screen: no chips, no proof lines, no money. Owner ask
// 2026-10-03: ProofWall was too much for the VSL, "literally just rotate them on
// a carousel", then "use better approvals... about 20 high quality ones" and
// "it should be smoother". Each picture is a proof card built from the real crop
// by scripts/approval-cards.mjs (public/approval-cards/, data in approvalCards.ts),
// smallest first, climbing to the biggest. Rendered at 60 fps with a long, soft
// glide between cards.
//
// Two sizes: ApprovalCarouselWide (1920x1080) for the VSLs and ApprovalCarousel
// (1080x1920) for vertical ads, where the cards stay inside the text safe zone.
// The length is the approval count times one step, so the clip loops cleanly.
//
// The 3D versions (ApprovalCarousel3DWide, ApprovalCarousel3D) put the same cards
// on a curved ring: the front card faces the camera, the ones beside it turn
// away into depth and dim. Owner, 2026-10-03: "you can make them 3D, you just
// can't make them throwing money around." Still nothing but the approvals.

export type ApprovalCarouselProps = {
  /** Card ids from approvalCards.ts, in order. Empty means all of them, smallest first. */
  approvals: string[];
  /** Frames each card sits still in the middle. 0 = continuous glide, no stops. */
  holdFrames: number;
  /** Frames the slide to the next card takes. */
  slideFrames: number;
};

/** The cards in approvalCards.ts order: smallest first, climbing to the biggest. */
const DEFAULT_ORDER: ApprovalCard[] = APPROVAL_CARDS;

const pick = (ids: string[]): ApprovalCard[] => {
  if (!ids.length) return DEFAULT_ORDER;
  const byId = new Map(APPROVAL_CARDS.map((a) => [a.id, a]));
  return ids.map((id) => {
    const a = byId.get(id);
    if (!a) throw new Error(`ApprovalCarousel: unknown approval id "${id}"`);
    return a;
  });
};

const carouselLength = ({approvals, holdFrames, slideFrames}: ApprovalCarouselProps): number =>
  pick(approvals).length * (holdFrames + slideFrames);

type Layout = {width: number; height: number; centerY: number; boxW: number; boxH: number; spacing: number};

const WIDE: Layout = {width: 1920, height: 1080, centerY: 540, boxW: 720, boxH: 900, spacing: 800};
// Vertical: the whole card sits inside the text safe zone (y 269 to 1248).
const TALL: Layout = {width: FRAME.width, height: FRAME.height, centerY: SAFE.top + SAFE_HEIGHT / 2, boxW: 620, boxH: SAFE_HEIGHT - 40, spacing: 640};

/** Position along the list: holds on a whole number, then eases to the next. */
const usePosition = (holdFrames: number, slideFrames: number): number => {
  const frame = useCurrentFrame();
  // No hold: one steady, continuous glide (owner, 2026-10-03: "it should be a
  // continuous thing. It should move pretty quickly").
  if (holdFrames <= 0) return frame / slideFrames;
  const step = holdFrames + slideFrames;
  const k = Math.floor(frame / step);
  return (
    k +
    interpolate(frame - k * step, [holdFrames, step], [0, 1], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
      // A soft sine-like ease: no snap at either end of the glide.
      easing: Easing.bezier(0.45, 0, 0.55, 1),
    })
  );
};

const Carousel: React.FC<ApprovalCarouselProps & {layout: Layout}> = ({approvals, holdFrames, slideFrames, layout}) => {
  const list = pick(approvals);
  const n = list.length;
  const p = usePosition(holdFrames, slideFrames);

  const cards: React.ReactNode[] = [];
  for (let i = Math.floor(p) - 3; i <= Math.floor(p) + 4; i++) {
    const a = list[((i % n) + n) % n];
    const d = i - p;
    const ad = Math.abs(d);
    const scale = interpolate(ad, [0, 1, 2], [1, 0.84, 0.72], {extrapolateRight: 'clamp'});
    const opacity = interpolate(ad, [0, 1, 2, 2.6], [1, 0.5, 0.18, 0], {extrapolateRight: 'clamp'});
    if (opacity <= 0) continue;
    // Fit the picture inside the box without cropping it.
    const fit = Math.min(layout.boxW / a.width, layout.boxH / a.height);
    const w = a.width * fit;
    const h = a.height * fit;
    const x = layout.width / 2 + d * layout.spacing;
    cards.push(
      <div
        key={i}
        style={{
          position: 'absolute',
          left: x - w / 2,
          top: layout.centerY - h / 2,
          width: w,
          height: h,
          transform: `scale(${scale})`,
          opacity,
          zIndex: 100 - Math.round(ad * 10),
          borderRadius: 48 * fit,
          boxShadow: `0 ${Math.round(24 * (1 - Math.min(ad, 1)))}px ${Math.round(60 * (1 - Math.min(ad, 1)))}px rgba(10,10,10,${(0.12 * (1 - Math.min(ad, 1))).toFixed(3)})`,
          overflow: 'hidden',
        }}
      >
        <Img src={staticFile(`approval-cards/${a.id}.png`)} style={{display: 'block', width: '100%', height: '100%'}} />
      </div>,
    );
  }

  return (
    <div style={{position: 'absolute', inset: 0, overflow: 'hidden'}}>
      <Grid />
      {cards}
    </div>
  );
};

type RingLayout = {width: number; height: number; centerY: number; boxW: number; boxH: number; radius: number; stepDeg: number; perspective: number};

const WIDE_RING: RingLayout = {width: 1920, height: 1080, centerY: 530, boxW: 660, boxH: 840, radius: 1050, stepDeg: 37, perspective: 2400};
// Vertical: the front card stays inside the text safe zone (y 269 to 1248).
const TALL_RING: RingLayout = {width: FRAME.width, height: FRAME.height, centerY: SAFE.top + SAFE_HEIGHT / 2 - 20, boxW: 640, boxH: SAFE_HEIGHT - 100, radius: 1000, stepDeg: 40, perspective: 2400};

/** The same cards on a curved ring: the front one faces the camera, the rest turn away and dim. */
const Ring: React.FC<ApprovalCarouselProps & {layout: RingLayout}> = ({approvals, holdFrames, slideFrames, layout}) => {
  const list = pick(approvals);
  const n = list.length;
  const p = usePosition(holdFrames, slideFrames);
  const cards: React.ReactNode[] = [];
  // Height of the card in front (blended mid-slide), so the floor shadow sits right under it.
  let frontH = 0;
  let frontWeight = 0;
  for (let i = Math.floor(p) - 3; i <= Math.floor(p) + 4; i++) {
    const a = list[((i % n) + n) % n];
    const d = i - p;
    const ad = Math.abs(d);
    const opacity = interpolate(ad, [0, 2, 2.7], [1, 0.85, 0], {extrapolateRight: 'clamp'});
    if (opacity <= 0) continue;
    const fit = Math.min(layout.boxW / a.width, layout.boxH / a.height);
    const w = a.width * fit;
    const h = a.height * fit;
    // Side cards fall into shade as they turn away from the camera.
    const shade = interpolate(ad, [0, 1, 2], [0, 0.3, 0.5], {extrapolateRight: 'clamp'});
    if (ad < 1) {
      frontH += h * (1 - ad);
      frontWeight += 1 - ad;
    }
    cards.push(
      <div
        key={i}
        style={{
          position: 'absolute',
          left: layout.width / 2 - w / 2,
          top: layout.centerY - h / 2,
          width: w,
          height: h,
          transform: `rotateY(${d * layout.stepDeg}deg) translateZ(${layout.radius}px)`,
          backfaceVisibility: 'hidden',
          opacity,
          borderRadius: 48 * fit,
          overflow: 'hidden',
          boxShadow: `0 ${Math.round(30 - 18 * Math.min(ad, 1))}px ${Math.round(70 - 40 * Math.min(ad, 1))}px rgba(10,10,10,${(0.16 - 0.08 * Math.min(ad, 1)).toFixed(3)})`,
        }}
      >
        <Img src={staticFile(`approval-cards/${a.id}.png`)} style={{display: 'block', width: '100%', height: '100%'}} />
        <div style={{position: 'absolute', inset: 0, background: `rgba(244,244,245,${shade.toFixed(3)})`}} />
      </div>,
    );
  }
  return (
    <div style={{position: 'absolute', inset: 0, overflow: 'hidden'}}>
      <Grid />
      {/* Soft floor shadow under the front card. */}
      <div
        style={{
          position: 'absolute',
          left: layout.width / 2 - layout.boxW * 0.55,
          width: layout.boxW * 1.1,
          top: layout.centerY + (frontWeight ? frontH / frontWeight : layout.boxH) / 2 + 18,
          height: 60,
          borderRadius: '50%',
          background: 'radial-gradient(ellipse at center, rgba(10,10,10,.16) 0%, rgba(10,10,10,0) 70%)',
          filter: 'blur(6px)',
        }}
      />
      <div style={{position: 'absolute', inset: 0, perspective: layout.perspective, perspectiveOrigin: `50% ${layout.centerY}px`}}>
        <div style={{position: 'absolute', inset: 0, transformStyle: 'preserve-3d', transform: `translateZ(${-layout.radius}px)`}}>{cards}</div>
      </div>
    </div>
  );
};

export const ApprovalCarousel3DWide: React.FC<ApprovalCarouselProps> = (props) => <Ring {...props} layout={WIDE_RING} />;
export const ApprovalCarousel3DTall: React.FC<ApprovalCarouselProps> = (props) => <Ring {...props} layout={TALL_RING} />;

export const ApprovalCarouselWide: React.FC<ApprovalCarouselProps> = (props) => <Carousel {...props} layout={WIDE} />;
export const ApprovalCarouselTall: React.FC<ApprovalCarouselProps> = (props) => <Carousel {...props} layout={TALL} />;

/** 60 fps, continuous: a new card reaches the middle every 0.6 s. 18 cards make a 10.8 s loop. */
const FPS = 60;
export const approvalCarouselDefaults: ApprovalCarouselProps = {approvals: [], holdFrames: 0, slideFrames: 36};

/** Registered in Root.tsx. */
export const ApprovalCarouselCompositions: React.FC = () => (
  <>
    <Composition
      id="ApprovalCarouselWide"
      component={ApprovalCarouselWide}
      durationInFrames={carouselLength(approvalCarouselDefaults)}
      fps={FPS}
      width={WIDE.width}
      height={WIDE.height}
      defaultProps={approvalCarouselDefaults}
      calculateMetadata={({props}) => ({durationInFrames: carouselLength(props)})}
    />
    <Composition
      id="ApprovalCarousel"
      component={ApprovalCarouselTall}
      durationInFrames={carouselLength(approvalCarouselDefaults)}
      fps={FPS}
      width={TALL.width}
      height={TALL.height}
      defaultProps={approvalCarouselDefaults}
      calculateMetadata={({props}) => ({durationInFrames: carouselLength(props)})}
    />
    <Composition
      id="ApprovalCarousel3DWide"
      component={ApprovalCarousel3DWide}
      durationInFrames={carouselLength(approvalCarouselDefaults)}
      fps={FPS}
      width={WIDE_RING.width}
      height={WIDE_RING.height}
      defaultProps={approvalCarouselDefaults}
      calculateMetadata={({props}) => ({durationInFrames: carouselLength(props)})}
    />
    <Composition
      id="ApprovalCarousel3D"
      component={ApprovalCarousel3DTall}
      durationInFrames={carouselLength(approvalCarouselDefaults)}
      fps={FPS}
      width={TALL_RING.width}
      height={TALL_RING.height}
      defaultProps={approvalCarouselDefaults}
      calculateMetadata={({props}) => ({durationInFrames: carouselLength(props)})}
    />
  </>
);
