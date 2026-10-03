// Entry point with only the approval carousels, so they render without loading
// the kit's web font (the carousel has no text). Render with:
//   npx remotion render src/approval-carousel.ts ApprovalCarouselWide out/approval-carousel-wide.mp4
import React from 'react';
import {registerRoot} from 'remotion';
import {ApprovalCarouselCompositions} from './templates/ApprovalCarousel';

registerRoot(() => React.createElement(ApprovalCarouselCompositions));
