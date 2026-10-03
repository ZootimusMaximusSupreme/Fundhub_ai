import React from 'react';
import {interpolate} from 'remotion';
import {BrandFrame, CARD_EDGE, COLORS, Eyebrow, P3D, Stage3D, TRACK, cardShadow, enter, progressBetween, useTimeline} from '../brand';

export type TaskByTaskProps = {
  eyebrow: string;
  /** Header of the month that gets done, e.g. "Month 1 · Launch". The part before " · " is set in blue. */
  month: string;
  /** Three to five roadmap tasks, word for word. They check off one after another. */
  tasks: string[];
  /** Header of the month that slides in after, to show the plan keeps going. Empty hides the second card. */
  nextMonth: string;
  /** That month's first task, shown waiting. Empty shows the header alone. */
  nextTask: string;
  durationInFrames?: number;
  showSafeZones?: boolean;
};

export const TASK_BY_TASK_BASE = 90;
export const TASK_BY_TASK_HERO = 84;

// Tasks are the /roadmap sample client's real Month 1 and Month 2 lines, word
// for word: marketing/landing-pages/slo/slo-01-sales.html, the `roadmap` entry
// of `var P={` (engine output on the made-up "Sample Client"; see
// ops/workflows/2026-10-02-roadmap-sample-content.md). Left out on purpose:
// "Apply for personal loan pre-approval NOW" and the score-movement sentence.
// Eyebrow from the script line: "The order to do it in, month by month."
export const taskByTaskDefaults: TaskByTaskProps = {
  eyebrow: 'Month by month',
  month: 'Month 1 · Launch',
  tasks: [
    'Pay American Express Blue Business Cash from $4,800 down to $2,500',
    'Send inquiry removal letters for duplicate pulls',
    'File LLC in TX',
    'Open business checking account',
  ],
  nextMonth: 'Month 2 · Results',
  nextTask: 'Check dispute results (30-45 days after sending)',
};

const CARD_TILT = {rx: 5, ry: -6};
const THICKNESS = 16;
const EDGE_COLORS = ['#ECECEF', '#E5E5E9', '#DEDEE3', '#D7D7DD', '#D1D1D7'];
const CHECK = 52;
const FIRST_CHECK = 20; // frame the first task checks
const CHECK_GAP = 9; // frames between checks

/**
 * A white card with real thickness: edge layers stacked behind the face show
 * as a slab on the tilt. Fades go on each layer (a wrapper fade would flatten
 * the slab).
 */
const ThickCard: React.FC<{
  progress: number;
  z: number;
  radius?: number;
  thickness?: number;
  elevation?: number;
  padding: React.CSSProperties['padding'];
  children: React.ReactNode;
}> = ({progress, z, radius = 34, thickness = THICKNESS, elevation = 1.2, padding, children}) => {
  const q = 1 - progress;
  // The face turns opaque first and the slab follows, so the grey edge layers never show through a half-clear face.
  const faceIn = Math.min(1, progress / 0.6);
  const slabIn = Math.max(0, Math.min(1, (progress - 0.45) / 0.55));
  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        ...P3D,
        transform: `translate3d(0, ${q * 40}px, ${z - q * 360}px) rotateX(${CARD_TILT.rx + q * 14}deg) rotateY(${CARD_TILT.ry}deg)`,
      }}
    >
      {/* the soft shadow sits on the wall well behind the card, so it can never sort in front of a neighbour */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: radius,
          boxShadow: cardShadow(elevation),
          opacity: slabIn,
          transform: 'translateZ(-90px)',
        }}
      />
      {EDGE_COLORS.map((c, i) => (
        <div
          key={c}
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: radius,
            background: c,
            opacity: slabIn,
            transform: `translateZ(${-((i + 1) * thickness) / EDGE_COLORS.length}px)`,
          }}
        />
      ))}
      <div
        style={{
          position: 'relative',
          background: 'linear-gradient(165deg, #FFFFFF 0%, #FFFFFF 60%, #FAFAFB 100%)',
          ...CARD_EDGE,
          borderRadius: radius,
          padding,
          opacity: faceIn,
        }}
      >
        {children}
      </div>
    </div>
  );
};

/** A glossy check button: pale until its task is done, then it fills blue and the check draws on. */
const Check: React.FC<{p: number; size?: number}> = ({p, size = CHECK}) => {
  const fill = interpolate(p, [0, 0.45], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const draw = interpolate(p, [0.3, 1], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const ring = interpolate(p, [0.2, 1], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const len = 40;
  return (
    <div style={{position: 'relative', width: size, height: size, flex: '0 0 auto'}}>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: '50%',
          background: 'radial-gradient(circle at 34% 30%, #FFFFFF 0%, #F6F6F7 50%, #E7E7EA 100%)',
          border: `3px solid ${COLORS.track}`,
          boxShadow: '0 3px 6px rgba(10,10,10,.06)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: '50%',
          background: 'radial-gradient(circle at 34% 30%, #FFFFFF 0%, #A9C9F8 16%, #3D86F0 58%, #2C67C2 100%)',
          opacity: fill,
          transform: `scale(${0.7 + 0.3 * fill})`,
          boxShadow: `0 0 0 ${12 * ring}px rgba(61,134,240,${0.16 * (1 - ring)}), 0 6px 12px rgba(44,103,194,${0.28 * fill})`,
        }}
      />
      <svg width={size} height={size} viewBox="0 0 52 52" style={{position: 'absolute', inset: 0}}>
        <path
          d="M15.5 27 L23 34.5 L37 19.5"
          fill="none"
          stroke="#FFFFFF"
          strokeWidth={5}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={len}
          strokeDashoffset={len * (1 - draw)}
          opacity={draw > 0 ? 1 : 0}
        />
      </svg>
    </div>
  );
};

/** "Month 1 · Launch" with the month number part in blue. */
const MonthLabel: React.FC<{text: string; size: number}> = ({text, size}) => {
  const cut = text.indexOf(' · ');
  const lead = cut >= 0 ? text.slice(0, cut) : text;
  const rest = cut >= 0 ? text.slice(cut) : '';
  return (
    <div style={{fontSize: size, fontWeight: 800, letterSpacing: TRACK.h2, lineHeight: 1.1, whiteSpace: 'nowrap'}}>
      <span style={{color: COLORS.accent}}>{lead}</span>
      <span style={{color: COLORS.ink}}>{rest}</span>
    </div>
  );
};

export const TaskByTask: React.FC<TaskByTaskProps> = ({eyebrow, month, tasks, nextMonth, nextTask, durationInFrames, showSafeZones}) => {
  const {f, fps} = useTimeline(TASK_BY_TASK_BASE, durationInFrames);
  const L = TASK_BY_TASK_BASE;
  const list = tasks.slice(0, 5);
  const gap = list.length >= 5 ? 8 : CHECK_GAP;
  const checks = list.map((_, i) => progressBetween(f, FIRST_CHECK + i * gap, FIRST_CHECK + i * gap + 10));
  const done = checks.reduce((a, b) => a + b, 0) / Math.max(1, list.length);
  const card = enter(f, fps, 3, 18);
  const next = enter(f, fps, FIRST_CHECK + list.length * gap + 4, 18);
  const textSize = list.length >= 5 ? 32 : 36;

  return (
    <BrandFrame showSafeZones={showSafeZones}>
      <Stage3D f={f} length={L} drift={0.8}>
        <Eyebrow text={eyebrow} progress={enter(f, fps, 0, 14)} />
        <div style={{height: 46}} />
        <ThickCard progress={card} z={30} padding="30px 44px 14px">
          <MonthLabel text={month} size={46} />
          <div style={{position: 'relative', height: 8, borderRadius: 4, background: '#EEF0F3', marginTop: 18, marginBottom: 6}}>
            <div
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                bottom: 0,
                width: `${done * 100}%`,
                borderRadius: 4,
                background: COLORS.accent,
                boxShadow: '0 0 12px rgba(61,134,240,.35)',
              }}
            />
          </div>
          {list.map((task, i) => (
            <div
              key={task}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 26,
                padding: '18px 0',
                borderTop: i === 0 ? 'none' : `2px solid ${COLORS.soft}`,
              }}
            >
              <div style={{marginTop: (textSize * 1.22 - CHECK) / 2}}>
                <Check p={checks[i]} />
              </div>
              <span style={{fontSize: textSize, fontWeight: 600, letterSpacing: TRACK.body, lineHeight: 1.22, color: COLORS.ink, textWrap: 'pretty'}}>
                {task}
              </span>
            </div>
          ))}
        </ThickCard>
        {nextMonth ? (
          <>
            <div style={{height: 24}} />
            {/* a little nearer the camera than the first card, so the two slabs never share a depth */}
            <ThickCard progress={next} z={40} radius={30} thickness={12} elevation={0.5} padding="22px 44px">
              <MonthLabel text={nextMonth} size={36} />
              {nextTask ? (
                <div style={{display: 'flex', alignItems: 'center', gap: 20, marginTop: 14}}>
                  <Check p={0} size={38} />
                  <span style={{fontSize: 28, fontWeight: 600, letterSpacing: TRACK.body, lineHeight: 1.2, color: COLORS.gray, whiteSpace: 'nowrap'}}>
                    {nextTask}
                  </span>
                </div>
              ) : null}
            </ThickCard>
          </>
        ) : null}
        {/* lifts the centered column so the last card's soft shadow fades out above the y 1248 line */}
        <div style={{height: 36}} />
      </Stage3D>
    </BrandFrame>
  );
};
