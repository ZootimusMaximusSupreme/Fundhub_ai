import test from "node:test";
import assert from "node:assert/strict";
import {
  meetTitleStem,
  looksLikeTranscriptName,
  looksLikeRecordingMime,
  looksLikeMeetRecordingName,
  meetStartFromName,
  meetKindFromName
} from "./meet-title.mjs";

test("Meet recording and transcript files share a stem", () => {
  const rec = "Funding Call - Jane Doe (2026-08-24 15:00 GMT-7) - Recording.mp4";
  const doc = "Funding Call - Jane Doe (2026-08-24 15:00 GMT-7) - Transcript";
  assert.equal(meetTitleStem(rec), meetTitleStem(doc));
  assert.equal(looksLikeTranscriptName(doc), true);
  assert.equal(looksLikeTranscriptName(rec), false);
  assert.equal(looksLikeRecordingMime("video/mp4"), true);
});

test("Gemini notes count as a transcript sibling", () => {
  assert.equal(looksLikeTranscriptName("Strategy - Gemini notes"), true);
  assert.ok(meetTitleStem("Strategy - Gemini notes"));
});

test("only Google Meet names count as recordings to Whisper", () => {
  assert.equal(looksLikeMeetRecordingName("Meet Recording 2026-08-24"), true);
  assert.equal(looksLikeMeetRecordingName("Meeting Recording - Funding Call"), true);
  assert.equal(looksLikeMeetRecordingName("Google Meet - closer"), true);
  assert.equal(looksLikeMeetRecordingName("GMT20260824-funding"), true);
  assert.equal(looksLikeMeetRecordingName("1. Intro to funding.mp4"), false);
  assert.equal(looksLikeMeetRecordingName("VSL - offer.mp4"), false);
  assert.equal(looksLikeMeetRecordingName("Screen Recording 2026-08-24.mov"), false);
});

test("meetStartFromName reads the start time written in the file name", () => {
  assert.equal(
    meetStartFromName("Funding Call - Jane Doe (2026-08-24 15:00 GMT-7) - Recording.mp4"),
    "2026-08-24T22:00:00.000Z"
  );
  assert.equal(meetStartFromName("Call (2026-08-24 at 09:30 GMT+05:30)"), "2026-08-24T04:00:00.000Z");
  assert.equal(meetStartFromName("GMT20260824-150000_Recording.mp4"), "2026-08-24T15:00:00.000Z");
  assert.equal(meetStartFromName("Funding Call - Jane Doe - Recording.mp4"), null);
  assert.equal(meetStartFromName("Meet Recording 2026-08-24"), null);
});

test("meetKindFromName tells a sales meeting from a CSM meeting, and says null when unsure", () => {
  assert.equal(meetKindFromName("Funding Call - Jane Doe (2026-08-24 15:00 GMT-7)"), "sales");
  assert.equal(meetKindFromName("Strategy Session - Jane Doe"), "sales");
  assert.equal(meetKindFromName("CSM Check-in - Jane Doe"), "csm");
  assert.equal(meetKindFromName("Onboarding - Jane Doe"), "csm");
  assert.equal(meetKindFromName("Meet Recording - Call A.mp4"), null);
  assert.equal(meetKindFromName("Sales onboarding"), null);
});
