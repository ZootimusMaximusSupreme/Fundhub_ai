import test from "node:test";
import assert from "node:assert/strict";
import {
  filenameMentionsPerson,
  uniqueNameMatch,
  attachDriveRecording,
  listRecentRecordings,
  stampCallTranscript
} from "./recordings.mjs";

const ORG = "00000000-0000-4000-8000-000000000001";
const CLIENT = "550e8400-e29b-41d4-a716-446655440000";

test("filenameMentionsPerson needs both first and last", () => {
  assert.equal(
    filenameMentionsPerson("Strategy session - Jane Doe - 2026-08-15", "Jane", "Doe"),
    true
  );
  assert.equal(filenameMentionsPerson("Meeting with Jane", "Jane", "Doe"), false);
  assert.equal(filenameMentionsPerson("orphan.mp4", "Jane", "Doe"), false);
});

test("uniqueNameMatch attaches only when one client matches", () => {
  const clients = [
    { id: "a", first_name: "Jane", last_name: "Doe" },
    { id: "b", first_name: "John", last_name: "Smith" }
  ];
  assert.equal(
    uniqueNameMatch(clients, "Meet - Jane Doe").id,
    "a"
  );
  assert.equal(
    uniqueNameMatch(
      [{ id: "a", first_name: "Jane", last_name: "Doe" },
       { id: "c", first_name: "Jane", last_name: "Doe" }],
      "Meet - Jane Doe"
    ),
    null
  );
});

function stampDb() {
  const seen = [];
  return {
    seen,
    async query(sql, params) {
      seen.push({ sql, params });
      if (/UPDATE call_outcomes/i.test(sql)) return { rows: [{ id: "co-1" }] };
      if (/UPDATE customer_insights/i.test(sql)) return { rows: [{ id: "ci-1" }] };
      return { rows: [] };
    }
  };
}

test("attachDriveRecording puts a sales meeting's link on the call logged at that time", async () => {
  const db = stampDb();
  const out = await attachDriveRecording(db, {
    orgId: ORG,
    clientId: CLIENT,
    fileName: "Funding Call - Jane Doe (2026-08-24 15:00 GMT-7) - Recording.mp4",
    url: "https://drive.google.com/file/d/abc"
  });
  assert.equal(out.attached, true);
  assert.equal(out.clientId, CLIENT);
  assert.equal(out.stamp.matched, "call");
  assert.equal(db.seen.length, 1);
  assert.match(db.seen[0].sql, /UPDATE call_outcomes SET recording_url/);
  assert.match(db.seen[0].sql, /logged_at BETWEEN/);
  assert.doesNotMatch(db.seen[0].sql, /ORDER BY logged_at DESC/);
  assert.deepEqual(db.seen[0].params.slice(3), [
    "2026-08-24T22:00:00.000Z", "2026-08-24T21:00:00.000Z", "2026-08-25T04:00:00.000Z"
  ]);
});

test("attachDriveRecording puts a CSM meeting's link on the CSM answer, never on a sales call", async () => {
  const db = stampDb();
  const out = await attachDriveRecording(db, {
    orgId: ORG,
    clientId: CLIENT,
    fileName: "CSM Check-in - Jane Doe (2026-08-24 15:00 GMT-7) - Recording.mp4",
    url: "https://drive.google.com/file/d/csm"
  });
  assert.equal(out.stamp.matched, "csm_insight");
  assert.equal(db.seen.length, 1);
  assert.match(db.seen[0].sql, /UPDATE customer_insights SET recording_url/);
  assert.ok(!db.seen.some((q) => /UPDATE call_outcomes/i.test(q.sql)));
});

test("attachDriveRecording stamps no row when the meeting type or time is unknown", async () => {
  for (const [fileName, reason] of [
    ["Meet Recording - Call A.mp4", "meeting_type_unknown"],
    ["Funding Call - Jane Doe - Recording.mp4", "meeting_time_unknown"]
  ]) {
    const db = stampDb();
    const out = await attachDriveRecording(db, {
      orgId: ORG, clientId: CLIENT, fileName, url: "https://drive.google.com/file/d/x"
    });
    assert.equal(out.stamp.stamped, 0);
    assert.equal(out.stamp.reason, reason);
    assert.ok(!db.seen.some((q) => /^\s*UPDATE/i.test(q.sql)), fileName);
  }
});

test("listRecentRecordings is honest when Drive is off and files are empty", async () => {
  const db = {
    async query(sql) {
      if (/brain_drive_sync/i.test(sql)) return { rows: [] };
      if (/brain_files/i.test(sql)) return { rows: [] };
      if (/call_outcomes/i.test(sql)) return { rows: [] };
      if (/FROM clients/i.test(sql)) return { rows: [] };
      return { rows: [] };
    }
  };
  const out = await listRecentRecordings(db, { orgId: ORG, env: {}, now: new Date("2026-08-15T18:00:00Z") });
  assert.equal(out.drive_ready, false);
  assert.ok(out.missing.includes("GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON"));
  assert.equal(out.items.length, 0);
  assert.match(out.reason, /not connected/i);
});

test("listRecentRecordings returns today's Drive file and name-matches a client", async () => {
  const now = new Date("2026-08-15T18:00:00Z");
  const updates = [];
  const db = {
    async query(sql, params) {
      if (/brain_drive_sync/i.test(sql)) {
        return { rows: [{ last_sync_at: "2026-08-15T17:00:00Z", last_error: null }] };
      }
      if (/FROM brain_files/i.test(sql)) {
        return {
          rows: [{
            id: "bf-1",
            name: "Strategy session - Jane Doe",
            web_view_link: "https://drive.google.com/file/d/rec1",
            client_id: null,
            unattached: true,
            indexed_at: "2026-08-15T16:00:00Z",
            created_at: "2026-08-15T16:00:00Z",
            mime_type: "video/mp4",
            needs_transcription: true,
            first_name: null,
            last_name: null
          }]
        };
      }
      if (/FROM call_outcomes/i.test(sql) && /SELECT o.id/i.test(sql)) {
        return { rows: [] };
      }
      if (/FROM clients c/i.test(sql)) {
        return { rows: [{ id: CLIENT, first_name: "Jane", last_name: "Doe" }] };
      }
      if (/UPDATE brain_files/i.test(sql)) {
        updates.push(params);
        return { rows: [] };
      }
      if (/UPDATE call_outcomes/i.test(sql) || /UPDATE customer_insights/i.test(sql)) {
        return { rows: [{ id: "x" }] };
      }
      return { rows: [] };
    }
  };
  const env = {
    GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON: JSON.stringify({
      client_email: "sa@test.iam.gserviceaccount.com",
      private_key: "-----BEGIN PRIVATE KEY-----\nfake\n-----END PRIVATE KEY-----\n"
    }),
    GOOGLE_DRIVE_DELEGATE_EMAIL: "owner@fundhub.test"
  };
  const out = await listRecentRecordings(db, { orgId: ORG, now, env });
  assert.equal(out.drive_ready, true);
  assert.equal(out.items.length, 1);
  assert.equal(out.items[0].client_id, CLIENT);
  assert.equal(out.items[0].is_today, true);
  assert.equal(out.items[0].url, "https://drive.google.com/file/d/rec1");
  assert.equal(out.items[0].has_words, false);
  assert.equal(updates.length, 1);
});

function transcriptDb() {
  const seen = [];
  return {
    seen,
    async query(sql, params) {
      seen.push({ sql, params });
      if (/recording_url = \$4/i.test(sql)) return { rows: [] };
      if (/UPDATE call_outcomes/i.test(sql)) return { rows: [{ id: "co-1" }] };
      return { rows: [] };
    }
  };
}

test("stampCallTranscript matches a sales meeting to the call logged at that time", async () => {
  const db = transcriptDb();
  const out = await stampCallTranscript(db, {
    orgId: ORG,
    clientId: CLIENT,
    transcript: "the start is part of ten percent",
    meetingName: "Funding Call - Jane Doe (2026-08-24 15:00 GMT-7) - Recording.mp4"
  });
  assert.equal(out.stamped, 1);
  assert.equal(out.matched, "meeting_time");
  const update = db.seen.find((s) => /SET transcript/i.test(s.sql));
  assert.match(update.sql, /logged_at BETWEEN/);
  // 15:00 at GMT-7 is 22:00 UTC; the window is one hour before to six after.
  assert.equal(update.params[3], "2026-08-24T22:00:00.000Z");
  assert.equal(update.params[4], "2026-08-24T21:00:00.000Z");
  assert.equal(update.params[5], "2026-08-25T04:00:00.000Z");
});

test("stampCallTranscript leaves a CSM check-in on the brain file, never on a sales call", async () => {
  const db = transcriptDb();
  const out = await stampCallTranscript(db, {
    orgId: ORG,
    clientId: CLIENT,
    transcript: "how is the paydown going",
    meetingName: "CSM Check-in - Jane Doe (2026-08-24 15:00 GMT-7) - Recording.mp4"
  });
  assert.equal(out.stamped, 0);
  assert.equal(out.reason, "not_a_sales_meeting");
  assert.ok(!db.seen.some((s) => /SET transcript/i.test(s.sql) && !/recording_url = \$4/i.test(s.sql)));
});

test("stampCallTranscript stamps nothing when the meeting type or time is unknown", async () => {
  const noType = transcriptDb();
  const a = await stampCallTranscript(noType, {
    orgId: ORG, clientId: CLIENT, transcript: "words", meetingName: "Meet Recording - Call A.mp4"
  });
  assert.equal(a.stamped, 0);
  assert.equal(a.reason, "meeting_type_unknown");

  const noTime = transcriptDb();
  const b = await stampCallTranscript(noTime, {
    orgId: ORG, clientId: CLIENT, transcript: "words", meetingName: "Funding Call - Jane Doe - Recording.mp4"
  });
  assert.equal(b.stamped, 0);
  assert.equal(b.reason, "meeting_time_unknown");
});

test("stampCallTranscript still prefers the sales call that holds the recording link", async () => {
  const db = {
    async query(sql) {
      if (/recording_url = \$4/i.test(sql)) return { rows: [{ id: "co-url" }] };
      return { rows: [] };
    }
  };
  const out = await stampCallTranscript(db, {
    orgId: ORG, clientId: CLIENT, transcript: "words", url: "https://drive.google.com/file/d/rec",
    meetingName: "Funding Call - Jane Doe (2026-08-24 15:00 GMT-7) - Recording.mp4"
  });
  assert.equal(out.stamped, 1);
  assert.equal(out.matched, "recording_url");
});

test("stampCallTranscript never follows a link onto a call when the meeting is a CSM meeting", async () => {
  const seen = [];
  const db = {
    async query(sql) {
      seen.push(sql);
      // A call row DOES hold this link (stamped wrongly in the past): still refused.
      if (/recording_url = \$4/i.test(sql)) return { rows: [{ id: "co-url" }] };
      return { rows: [] };
    }
  };
  const out = await stampCallTranscript(db, {
    orgId: ORG, clientId: CLIENT, transcript: "check-in words", url: "https://drive.google.com/file/d/csm",
    meetingName: "CSM Check-in - Jane Doe (2026-08-24 15:00 GMT-7) - Recording.mp4"
  });
  assert.equal(out.stamped, 0);
  assert.equal(out.reason, "not_a_sales_meeting");
  assert.equal(seen.length, 0, "no query runs for a CSM meeting");
});
