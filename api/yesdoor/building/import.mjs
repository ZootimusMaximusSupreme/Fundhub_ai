// POST /api/yesdoor/building/import — load units from a spreadsheet or a listing feed.
//
// Building-user session only. {buildingId?, format: "csv" | "mits", content (the file's
// text), mapping? (csv column names), propertyExternalId? (mits), replace? (also turn off
// this building's other units that came from the same kind of source)}.
// Every row that parses becomes a unit (created, or updated if the label exists); every
// row that does not is an error with its row number, and never sinks the file.
//   200 {ok, imported, created, updated, deactivated, errors: [...], skipped: [...]}
//   422 {ok: false, error: "nothing_imported", errors}   when no row could be used
import { db } from "../../../src/db.mjs";
import { requireYdAccount } from "../../../src/yesdoor/auth/principal.mjs";
import { allowMethods, sendError } from "../../../src/yesdoor/http.mjs";
import { bodyOf } from "../../../src/yesdoor/validate.mjs";
import { importListings } from "../../../src/yesdoor/store/building-writes.mjs";

export default async function handler(req, res) {
  const who = await requireYdAccount(req, res, ["building_user"], { db });
  if (!who) return;
  if (!allowMethods(req, res, ["POST"])) return;
  try {
    const out = await importListings(db, who, bodyOf(req));
    if (out.imported === 0 && out.errors.length > 0) {
      return res.status(422).json({ ok: false, error: "nothing_imported", imported: 0, errors: out.errors, skipped: out.skipped });
    }
    return res.status(200).json({ ok: true, ...out });
  } catch (e) {
    return sendError(res, e);
  }
}
