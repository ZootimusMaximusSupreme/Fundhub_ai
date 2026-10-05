import React from 'react';
import {Composition} from 'remotion';
import {FRAME, clampDuration} from '../brand';
import {FILE_ITEMS_BASE, FILE_ITEMS_HERO, FileItems, fileItemsDefaults} from './FileItems';
import {HIDDEN_DATA_POINTS_BASE, HIDDEN_DATA_POINTS_HERO, HiddenDataPoints, hiddenDataPointsDefaults} from './HiddenDataPoints';
import {INQUIRIES_OFF_BASE, INQUIRIES_OFF_HERO, InquiriesOff, inquiriesOffDefaults} from './InquiriesOff';
import {LENDER_LIST_BASE, LENDER_LIST_HERO, LenderList, lenderListDefaults} from './LenderList';
import {QUALIFY_TODAY_BASE, QUALIFY_TODAY_HERO, QualifyToday, qualifyTodayDefaults} from './QualifyToday';
import {RATES_RISING_BASE, RATES_RISING_HERO, RatesRising, ratesRisingDefaults} from './RatesRising';
import {SOFT_PULL_BASE, SOFT_PULL_HERO, SoftPull, softPullDefaults} from './SoftPull';
import {STEP_PATH_BASE, STEP_PATH_HERO, StepPath, stepPathDefaults} from './StepPath';
import {ITEM_COUNT_BASE, ITEM_COUNT_HERO, ItemCount, itemCountDefaults} from './ItemCount';
import {PICK_YOUR_PATH_BASE, PICK_YOUR_PATH_HERO, PickYourPath, pickYourPathDefaults} from './PickYourPath';
import {LETTERS_WRITTEN_BASE, LETTERS_WRITTEN_HERO, LettersWritten, lettersWrittenDefaults} from './LettersWritten';
import {PROOF_CHIPS_BASE, PROOF_CHIPS_HERO, ProofChips, proofChipsDefaults} from './ProofChips';
import {SHOTGUN_APPLY_BASE, SHOTGUN_APPLY_HERO, ShotgunApply, shotgunApplyDefaults} from './ShotgunApply';
import {TASK_BY_TASK_BASE, TASK_BY_TASK_HERO, TaskByTask, taskByTaskDefaults} from './TaskByTask';
import {REFUND_PROMISE_BASE, REFUND_PROMISE_HERO, RefundPromise, refundPromiseDefaults} from './RefundPromise';
import {TEN_SECONDS_BASE, TEN_SECONDS_HERO, TenSeconds, tenSecondsDefaults} from './TenSeconds';

export type TemplateEntry = {
  /** Composition id for the CLI. */
  id: string;
  /** Preview file name in previews/. */
  file: string;
  title: string;
  what: string;
  /** Default length in frames (30 fps). Props can ask for 60 to 90. */
  base: number;
  /** The frame where the idea is fully on screen; used for the preview still. */
  hero: number;
  composition: () => React.ReactElement;
  preview: () => React.ReactElement;
};

const entry = <P extends {durationInFrames?: number} & Record<string, unknown>>(e: {
  id: string;
  file: string;
  title: string;
  what: string;
  base: number;
  hero: number;
  component: React.ComponentType<P>;
  defaultProps: P;
}): TemplateEntry => ({
  id: e.id,
  file: e.file,
  title: e.title,
  what: e.what,
  base: e.base,
  hero: e.hero,
  composition: () => (
    <Composition
      key={e.id}
      id={e.id}
      component={e.component}
      durationInFrames={e.base}
      fps={FRAME.fps}
      width={FRAME.width}
      height={FRAME.height}
      defaultProps={e.defaultProps}
      calculateMetadata={({props}) => ({
        durationInFrames: clampDuration(typeof props.durationInFrames === 'number' ? props.durationInFrames : undefined, e.base),
      })}
    />
  ),
  preview: () => React.createElement(e.component, e.defaultProps),
});

/** The kit, in contact-sheet order. */
export const TEMPLATES: TemplateEntry[] = [
  entry({
    id: 'QualifyToday',
    file: 'qualify-today',
    title: 'Qualify today vs once fixed',
    what: 'A floating card: today and once-fixed amounts roll up, each beside a 3D cash stack that grows with it (the gap stacks on top in blue). Bills rise behind.',
    base: QUALIFY_TODAY_BASE,
    hero: QUALIFY_TODAY_HERO,
    component: QualifyToday,
    defaultProps: qualifyTodayDefaults,
  }),
  entry({
    id: 'FileItems',
    file: 'file-items',
    title: 'Items on the credit report',
    what: 'The report floats on a stack of pages. Red chips: a bill flies off each one. Green chips: a gold coin flips in beside each.',
    base: FILE_ITEMS_BASE,
    hero: FILE_ITEMS_HERO,
    component: FileItems,
    defaultProps: fileItemsDefaults,
  }),
  entry({
    id: 'HiddenDataPoints',
    file: 'hidden-data-points',
    title: 'The 13 hidden data points',
    what: 'Thirteen glossy dots light up on a tilted orbit around the count; back dots pass behind it. Bills drift behind the ring. Dots never labeled.',
    base: HIDDEN_DATA_POINTS_BASE,
    hero: HIDDEN_DATA_POINTS_HERO,
    component: HiddenDataPoints,
    defaultProps: hiddenDataPointsDefaults,
  }),
  entry({
    id: 'InquiriesOff',
    file: 'inquiries-off',
    title: 'Inquiries off between rounds',
    what: 'Hard inquiries are struck off a floating card, then bills ride the line down into the next funding round.',
    base: INQUIRIES_OFF_BASE,
    hero: INQUIRIES_OFF_HERO,
    component: InquiriesOff,
    defaultProps: inquiriesOffDefaults,
  }),
  entry({
    id: 'LenderList',
    file: 'lender-list',
    title: 'The lender list, in order',
    what: 'Each lender row is its own floating slab; a gold coin flips in at the end of each. Names stay blank unless a shot list gives real ones.',
    base: LENDER_LIST_BASE,
    hero: LENDER_LIST_HERO,
    component: LenderList,
    defaultProps: lenderListDefaults,
  }),
  entry({
    id: 'StepPath',
    file: 'step-path',
    title: 'The step-by-step path',
    what: 'Thick numbered discs flip from gray to blue as the line runs down the steps. Bills rise up the sides as the path completes.',
    base: STEP_PATH_BASE,
    hero: STEP_PATH_HERO,
    component: StepPath,
    defaultProps: stepPathDefaults,
  }),
  entry({
    id: 'RatesRising',
    file: 'rates-rising',
    title: 'Interest rates going up',
    what: 'On a floating panel a thick line climbs to a Rates chip while a cash stack shrinks. No rate values or dates.',
    base: RATES_RISING_BASE,
    hero: RATES_RISING_HERO,
    component: RatesRising,
    defaultProps: ratesRisingDefaults,
  }),
  entry({
    id: 'SoftPull',
    file: 'soft-pull',
    title: 'Soft pull, score does not move',
    what: 'A scan passes over a thick 3D dial and the score stays put. Bills hang faint and still at the sides.',
    base: SOFT_PULL_BASE,
    hero: SOFT_PULL_HERO,
    component: SoftPull,
    defaultProps: softPullDefaults,
  }),
  // Batch 3 (2026-10-03): 3D allowed, no money anywhere. Board: ops/workflows/broll-v3-2026-10-03.md.
  entry({
    id: 'RefundPromise',
    file: 'refund-promise',
    title: 'Refund promise',
    what: 'A $297 receipt floats in, a blue email envelope lands on its corner, and a calm blue "We\'ll refund you" stamp presses onto it. Never a day count.',
    base: REFUND_PROMISE_BASE,
    hero: REFUND_PROMISE_HERO,
    component: RefundPromise,
    defaultProps: refundPromiseDefaults,
  }),
  entry({
    id: 'TenSeconds',
    file: 'ten-seconds',
    title: 'About ten seconds, all in your account',
    what: 'A blue ring ticks once around a big "10" on a floating dial while the account card settles in and the real deliverables drop into their slots.',
    base: TEN_SECONDS_BASE,
    hero: TEN_SECONDS_HERO,
    component: TenSeconds,
    defaultProps: tenSecondsDefaults,
  }),
  entry({
    id: 'LettersWritten',
    file: 'letters-written',
    title: 'Every letter written (real sample letters)',
    what: 'Six real sample letters stand in depth with tabs 1 to 6; the front page is the real Round 1 letter from the /roadmap sample, marked Sample.',
    base: LETTERS_WRITTEN_BASE,
    hero: LETTERS_WRITTEN_HERO,
    component: LettersWritten,
    defaultProps: lettersWrittenDefaults,
  }),
  entry({
    id: 'TaskByTask',
    file: 'task-by-task',
    title: 'Task by task, month by month',
    what: 'A thick roadmap card checks off the real Month 1 tasks from the sample roadmap one by one, then Month 2 slides in to show it keeps going.',
    base: TASK_BY_TASK_BASE,
    hero: TASK_BY_TASK_HERO,
    component: TaskByTask,
    defaultProps: taskByTaskDefaults,
  }),
  entry({
    id: 'PickYourPath',
    file: 'pick-your-path',
    title: 'Pick your path',
    what: 'The file sits at the start of a path that splits into two or three lanes; one lane lights blue up to its card while the others stay gray.',
    base: PICK_YOUR_PATH_BASE,
    hero: PICK_YOUR_PATH_HERO,
    component: PickYourPath,
    defaultProps: pickYourPathDefaults,
  }),
  entry({
    id: 'ShotgunApply',
    file: 'shotgun-apply',
    title: 'Sent to every lender',
    what: 'Copies of one file go out to nine blank bank slabs, a red hard-inquiry slot fills for each, and most slabs flip to a calm red Declined. No bank names, no amounts.',
    base: SHOTGUN_APPLY_BASE,
    hero: SHOTGUN_APPLY_HERO,
    component: ShotgunApply,
    defaultProps: shotgunApplyDefaults,
  }),
  entry({
    id: 'ProofChips',
    file: 'proof-chips',
    title: 'Proof chips (simple ProofWall)',
    what: 'Thick glossy proof pills come forward one at a time and stack in depth, then the lead line lands under them. No approvals, no money.',
    base: PROOF_CHIPS_BASE,
    hero: PROOF_CHIPS_HERO,
    component: ProofChips,
    defaultProps: proofChipsDefaults,
  }),
  entry({
    id: 'ItemCount',
    file: 'item-count',
    title: 'One item or twelve (simple count)',
    what: 'A thick white tile counts from 1 up to 12; a small raised blue block rises with each tick. No ring, no dots, no money.',
    base: ITEM_COUNT_BASE,
    hero: ITEM_COUNT_HERO,
    component: ItemCount,
    defaultProps: itemCountDefaults,
  }),
];
