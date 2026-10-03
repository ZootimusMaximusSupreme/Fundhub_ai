import React from 'react';
import {Composition, Easing, Img, interpolate, staticFile, useCurrentFrame} from 'remotion';
// Imported file by file, not from '../brand', so this template never loads the
// web font: it has no text, and it renders where fonts.gstatic.com is blocked.
import {Grid} from '../brand/Grid';
import {FRAME, SAFE, SAFE_HEIGHT} from '../brand/tokens';
import {PROOF_APPROVALS, type ProofApproval} from './proofWallApprovals';

// ApprovalCarousel: the real client approvals rotate past on a flat carousel,
// one at a time. Nothing else on screen: no chips, no proof lines, no bills, no
// 3D. Each picture is the finished win card in public/proof-wall/ (amount,
// screenshot and wordmark are already on it). Owner ask 2026-10-03: ProofWall
// was too much for the VSL, "literally just rotate them on a carousel".
//
// Two sizes: ApprovalCarouselWide (1920x1080) for the VSLs and ApprovalCarousel
// (1080x1920) for vertical ads, where the cards stay inside the text safe zone.
// The length is the approval count times one step, so the clip loops cleanly.

export type ApprovalCarouselProps = {
  /** Approval ids from proofWallApprovals.ts, in order. Empty means all of them, biggest amount first. */
  approvals: string[];
  /** Frames each card sits still in the middle. */
  holdFrames: number;
  /** Frames the slide to the next card takes. */
  slideFrames: number;
};

/** Biggest known amount first, then the pictures with no amount on them. */
const DEFAULT_ORDER: ProofApproval[] = [...PROOF_APPROVALS].sort((a, b) => (b.amount ?? -1) - (a.amount ?? -1));

const pick = (ids: string[]): ProofApproval[] => {
  if (!ids.length) return DEFAULT_ORDER;
  const byId = new Map(PROOF_APPROVALS.map((a) => [a.id, a]));
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

const Carousel: React.FC<ApprovalCarouselProps & {layout: Layout}> = ({approvals, holdFrames, slideFrames, layout}) => {
  const frame = useCurrentFrame();
  const list = pick(approvals);
  const n = list.length;
  const step = holdFrames + slideFrames;
  const k = Math.floor(frame / step);
  const into = frame - k * step;
  // Position along the list: holds on a whole number, then eases to the next.
  const p =
    k +
    interpolate(into, [holdFrames, step], [0, 1], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
      easing: Easing.inOut(Easing.cubic),
    });

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
          borderRadius: 30 * fit,
          boxShadow: `0 ${Math.round(24 * (1 - Math.min(ad, 1)))}px ${Math.round(60 * (1 - Math.min(ad, 1)))}px rgba(10,10,10,${(0.12 * (1 - Math.min(ad, 1))).toFixed(3)})`,
          overflow: 'hidden',
        }}
      >
        <Img src={staticFile(`proof-wall/${a.id}.png`)} style={{display: 'block', width: '100%', height: '100%'}} />
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

export const ApprovalCarouselWide: React.FC<ApprovalCarouselProps> = (props) => <Carousel {...props} layout={WIDE} />;
export const ApprovalCarouselTall: React.FC<ApprovalCarouselProps> = (props) => <Carousel {...props} layout={TALL} />;

export const approvalCarouselDefaults: ApprovalCarouselProps = {approvals: [], holdFrames: 20, slideFrames: 10};

/** Registered in Root.tsx. */
export const ApprovalCarouselCompositions: React.FC = () => (
  <>
    <Composition
      id="ApprovalCarouselWide"
      component={ApprovalCarouselWide}
      durationInFrames={carouselLength(approvalCarouselDefaults)}
      fps={FRAME.fps}
      width={WIDE.width}
      height={WIDE.height}
      defaultProps={approvalCarouselDefaults}
      calculateMetadata={({props}) => ({durationInFrames: carouselLength(props)})}
    />
    <Composition
      id="ApprovalCarousel"
      component={ApprovalCarouselTall}
      durationInFrames={carouselLength(approvalCarouselDefaults)}
      fps={FRAME.fps}
      width={TALL.width}
      height={TALL.height}
      defaultProps={approvalCarouselDefaults}
      calculateMetadata={({props}) => ({durationInFrames: carouselLength(props)})}
    />
  </>
);
