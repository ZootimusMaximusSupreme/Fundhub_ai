// The naming scheme, and the one rule inside it that costs real money.
//
// THE FOLDER PADS. THE LINK DOES NOT.
//
// Pad a link once and that ad's results split in half forever — half of the
// spend reported under "43" and half under "043" — because fundhub_ad_id()
// returns TEXT and does no arithmetic (286_client_ad_attribution.sql:81-84).
// Neither number looks wrong on its own, so nothing would ever surface it.
// Most of this file is that one rule, checked from both directions.
//
// PURE — no database, no clock. Every name is a function of its inputs.

import { test, describe } from "node:test";
import assert from "node:assert";

import {
  FOLDER_PAD, TAKE_PAD, PAUL_ROOT, RAW_ROOT, AD_ID_RE, AdVideoNamingError,
  normalizeAdId, normalizeTakeNo, folderNumber, linkNumber, takeTag, versionTag,
  paulFolderName, finalFileName, briefFileName,
  rawFileName, storageRawKey, storageFinalKey,
  utmContent, landingLink, parseVideoName
} from "./naming.mjs";

describe("naming — the worked example from the plan", () => {
  // docs/video-pipeline-plan.md §4, copied character for character.
  test("Paul's folder is exactly what §4 draws", () => {
    assert.equal(PAUL_ROOT, "Fundhub Ads");
    assert.equal(paulFolderName("43"), "043");
    assert.equal(finalFileName("43", 2, 1), "043_t02_final_v1.mp4");
    assert.equal(briefFileName("43"), "043_brief.pdf");
  });

  test("our Raw folder is exactly what §4 draws", () => {
    assert.equal(RAW_ROOT, "Fundhub Raw");
    assert.equal(rawFileName("43", 1, "2026-09-23"), "043_t01_raw_2026-09-23.mp4");
    assert.equal(rawFileName("43", 2, "2026-09-23"), "043_t02_raw_2026-09-23.mp4");
  });

  test("the storage keys are what §3 draws", () => {
    assert.equal(storageRawKey("43", 2, "2026-09-23"), "raw/2026/09/043_t02.mp4");
    assert.equal(storageFinalKey("43", 2, 1), "final/043_t02_v1.mp4");
  });
});

describe("naming — *** THE LINK IS NEVER PADDED ***", () => {
  test("linkNumber hands back the number the database stores, unpadded", () => {
    assert.equal(linkNumber("43"), "43");
    assert.equal(linkNumber("7"), "7");
    assert.equal(linkNumber("0"), "0");
    assert.equal(linkNumber("123456789"), "123456789");
  });

  test("utm_content carries the unpadded number and nothing else", () => {
    assert.equal(utmContent("43"), "43");
    assert.equal(utmContent("7"), "7");
  });

  test("the landing link's utm_content is unpadded, even though the folder is not", () => {
    // The two halves side by side. This is the assertion the whole file is for.
    const adId = "43";
    assert.equal(paulFolderName(adId), "043", "the folder pads so folders sort");
    const link = landingLink("https://fundhub.ai/roadmap", adId);
    assert.equal(new URL(link).searchParams.get("utm_content"), "43");
    assert.ok(!link.includes("043"), `a padded number reached the link: ${link}`);
  });

  test("no link-shaped output anywhere in this module contains the padding", () => {
    for (const adId of ["1", "7", "43", "99"]) {
      assert.ok(!utmContent(adId).startsWith("0"), adId);
      assert.ok(!utmContent(adId, "phase").startsWith("0"), adId);
      const link = landingLink("https://fundhub.ai/roadmap", adId, { slug: "phase" });
      assert.equal(new URL(link).searchParams.get("utm_content"), `${adId}-phase`);
    }
  });

  test("a padded number handed in is REFUSED, not quietly trimmed", () => {
    // Trimming "043" to "43" would hide the bug that produced it. The whole
    // point is that the two forms never get mixed up silently.
    for (const bad of ["043", "007", "00", "01"]) {
      assert.throws(() => normalizeAdId(bad), (err) => {
        assert.ok(err instanceof AdVideoNamingError);
        assert.equal(err.code, "bad_ad_id");
        assert.match(err.message, /leading zeros/);
        return true;
      }, bad);
      assert.throws(() => linkNumber(bad), /leading zeros/, bad);
      assert.throws(() => folderNumber(bad), /leading zeros/, bad);
    }
  });

  test("the module's regex is the same shape as 389's CHECK and fundhub_ad_id()", () => {
    // ad_videos_ad_id_ck: '^(0|[1-9][0-9]{0,8})$'. fundhub_ad_id reads 1-9 digits.
    assert.equal(AD_ID_RE.source, "^(0|[1-9][0-9]{0,8})$");
    assert.equal(AD_ID_RE.test("0"), true, "ad number 0 is legal");
    assert.equal(AD_ID_RE.test("043"), false);
    assert.equal(AD_ID_RE.test("1234567890"), false, "ten digits is past what fundhub_ad_id reads");
    assert.equal(AD_ID_RE.test("123456789"), true);
  });
});

describe("naming — the slug is decoration and never a blocker", () => {
  test("an ad with no name still gets a working utm_content", () => {
    // CLAUDE.md §3c, owner-set 2026-09-06: ads are identified by id, not name.
    // fundhub_ad_id ignores the slug entirely, so an untitled ad is not a defect.
    assert.equal(utmContent("43", null), "43");
    assert.equal(utmContent("43", ""), "43");
    assert.equal(utmContent("43", "   "), "43");
  });

  test("a slug is appended in the shape fundhub_ad_id skips over", () => {
    assert.equal(utmContent("43", "phase"), "43-phase");
    assert.equal(utmContent("43", "The Order You Apply In"), "43-the-order-you-apply-in");
    assert.equal(utmContent("43", "wrong!!order??"), "43-wrong-order");
  });

  test("a slug can never change which ad the number resolves to", () => {
    // Everything after the leading digits is ignored by fundhub_ad_id, so the
    // digits must survive whatever the slug does.
    for (const slug of ["phase", "a-b-c", "---", "___", "99", "0"]) {
      assert.match(utmContent("43", slug), /^43(-.*)?$/, slug);
    }
  });
});

describe("naming — padding, both numbers", () => {
  test("three digits is a minimum, not a cap", () => {
    assert.equal(FOLDER_PAD, 3);
    assert.equal(folderNumber("7"), "007");
    assert.equal(folderNumber("43"), "043");
    assert.equal(folderNumber("430"), "430");
    // Truncating 1234 to fit would put two ads in one folder — the same
    // accident as padding a link, from the other direction.
    assert.equal(folderNumber("1234"), "1234");
    assert.equal(folderNumber("123456789"), "123456789");
  });

  test("two digits for a take, and the same minimum rule", () => {
    assert.equal(TAKE_PAD, 2);
    assert.equal(takeTag(1), "t01");
    assert.equal(takeTag(9), "t09");
    assert.equal(takeTag(10), "t10");
    assert.equal(takeTag(100), "t100");
  });

  test("a version is not padded — there is no sorting problem", () => {
    assert.equal(versionTag(1), "v1");
    assert.equal(versionTag(12), "v12");
  });
});

describe("naming — versions and takes tell different stories", () => {
  test("a re-EDIT of the same take bumps the version and keeps the take", () => {
    assert.equal(finalFileName("43", 2, 1), "043_t02_final_v1.mp4");
    assert.equal(finalFileName("43", 2, 2), "043_t02_final_v2.mp4");
  });

  test("a re-FILM bumps the take and goes back to v1", () => {
    assert.equal(finalFileName("43", 3, 1), "043_t03_final_v1.mp4");
  });

  test("one brief per ad number, not per take — only one video ever ships", () => {
    assert.equal(briefFileName("43"), "043_brief.pdf");
  });
});

describe("naming — what it refuses", () => {
  test("a take number must be a whole number from 1", () => {
    for (const bad of [0, -1, 1.5, "two", null, undefined, NaN, Infinity]) {
      assert.throws(() => normalizeTakeNo(bad), (err) => {
        assert.equal(err.code, "bad_take_no");
        return true;
      }, String(bad));
    }
    assert.equal(normalizeTakeNo(1), 1);
    assert.equal(normalizeTakeNo("2"), 2);
  });

  test("a version must be a whole number from 1", () => {
    for (const bad of [0, -1, 1.5, "x"]) {
      assert.throws(() => versionTag(bad), /finished version/, String(bad));
    }
  });

  test("a take date must be YYYY-MM-DD, and a Date is read in UTC", () => {
    for (const bad of ["23-09-2026", "2026/09/23", "2026-9-3", "", null, "yesterday"]) {
      assert.throws(() => rawFileName("43", 1, bad), (err) => {
        assert.equal(err.code, "bad_take_date");
        return true;
      }, String(bad));
    }
    // A local reading would give two machines two different names for one take.
    assert.equal(
      rawFileName("43", 1, new Date("2026-09-23T23:30:00Z")),
      "043_t01_raw_2026-09-23.mp4"
    );
    assert.throws(() => rawFileName("43", 1, new Date("nope")), /invalid Date/);
  });

  test("an extension is letters and digits, so a name cannot carry a path", () => {
    assert.equal(finalFileName("43", 1, 1, ".MOV"), "043_t01_final_v1.mov");
    for (const bad of ["../../etc", "mp4/x", "", "mp 4", "toolongextension"]) {
      assert.throws(() => finalFileName("43", 1, 1, bad), /file extension/, bad);
    }
  });

  test("a landing link needs a real URL", () => {
    for (const bad of ["/roadmap", "roadmap", "", null]) {
      assert.throws(() => landingLink(bad, "43"), (err) => {
        assert.equal(err.code, "bad_base_url");
        return true;
      }, String(bad));
    }
  });

  test("a landing link keeps the query it already had and adds the ad number", () => {
    const link = landingLink("https://fundhub.ai/roadmap?a=1", "43", { extra: { utm_source: "fb" } });
    const u = new URL(link);
    assert.equal(u.searchParams.get("a"), "1");
    assert.equal(u.searchParams.get("utm_content"), "43");
    assert.equal(u.searchParams.get("utm_source"), "fb");
  });

  test("an empty extra value is left off rather than sent as an empty parameter", () => {
    const u = new URL(landingLink("https://fundhub.ai/roadmap", "43", { extra: { utm_term: "", utm_source: null } }));
    assert.equal(u.searchParams.has("utm_term"), false);
    assert.equal(u.searchParams.has("utm_source"), false);
  });
});

describe("naming — reading a name back", () => {
  test("every name this module makes can be read back to the unpadded number", () => {
    // The round trip is the real assertion: a name goes out padded and comes
    // back as the number a link may carry.
    for (const adId of ["0", "7", "43", "430", "1234"]) {
      for (const takeNo of [1, 2, 10, 100]) {
        const raw = rawFileName(adId, takeNo, "2026-09-23");
        assert.deepEqual(parseVideoName(raw), {
          adId, takeNo, kind: "raw", version: null, takeDate: "2026-09-23"
        }, raw);

        const fin = finalFileName(adId, takeNo, 2);
        assert.deepEqual(parseVideoName(fin), {
          adId, takeNo, kind: "final", version: 2, takeDate: null
        }, fin);
      }
    }
  });

  test("a name we did not make reads back as null, never as a guess", () => {
    // "This file has not been renamed yet" is information the Drive poll needs.
    for (const junk of [
      "IMG_4471.mov", "video.mp4", "043.mp4", "43_t01_raw_2026-09-23.mp4",
      "043_t1_raw.mp4", "", null, undefined, "043_t01_raw_2026-09-23", "final/043_t02_v1.mp4"
    ]) {
      assert.equal(parseVideoName(junk), null, String(junk));
    }
  });

  test("a name read back never carries the folder padding into the row", () => {
    const got = parseVideoName("043_t02_final_v1.mp4");
    assert.equal(got.adId, "43");
    assert.equal(AD_ID_RE.test(got.adId), true);
    // And straight back out as a link, unpadded.
    assert.equal(utmContent(got.adId), "43");
  });

  test("ad number zero survives the whole round trip", () => {
    assert.equal(folderNumber("0"), "000");
    assert.equal(parseVideoName("000_t01_raw_2026-09-23.mp4").adId, "0");
    assert.equal(utmContent("0"), "0");
  });
});
