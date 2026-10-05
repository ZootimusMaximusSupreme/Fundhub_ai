// Edits to shared files (spec M0 step 2, mode 'edit').
//
// RULES.md, VOICE.md, registry.json, banned-live.json and angles.json are shared:
// two saves can touch the same file. So an outbox row for one of them stores the
// EDIT, not the file, and the drain applies it to the newest copy it reads from
// GitHub. A retry after a lost race therefore re-applies the same edit to fresh
// text instead of overwriting someone else's change.
//
// Pure functions. No I/O. applyEdit returns the new file text and throws
// EditError when the edit cannot apply (so the outbox shows the reason instead
// of writing a wrong file).
//
// Edit shapes (the `edit` jsonb column):
//   { kind: "append", text }                              add text at the end
//   { kind: "replace_text", find, with, all? }            swap one passage (error if `find` is absent)
//   { kind: "json_set", path: [..], value }               set a value inside a JSON file
//   { kind: "json_array_upsert", path: [..], key, item }  replace the item whose [key] matches, else add it
//   { kind: "json_array_remove", path: [..], key, value } drop the item whose [key] equals value

export class EditError extends Error {
  constructor(message) { super(message); this.name = "EditError"; }
}

export const EDIT_KINDS = Object.freeze([
  "append", "replace_text", "json_set", "json_array_upsert", "json_array_remove"
]);

const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

/** Throws EditError when `edit` is not one of the shapes above. Used at enqueue time. */
export function validateEdit(edit) {
  if (!isObj(edit) || !EDIT_KINDS.includes(edit.kind)) throw new EditError(`unknown edit kind: ${edit && edit.kind}`);
  const pathOk = Array.isArray(edit.path) && edit.path.every((s) => typeof s === "string" || Number.isInteger(s));
  switch (edit.kind) {
    case "append":
      if (typeof edit.text !== "string" || !edit.text) throw new EditError("append needs text");
      break;
    case "replace_text":
      if (typeof edit.find !== "string" || !edit.find || typeof edit.with !== "string") throw new EditError("replace_text needs find and with");
      break;
    case "json_set":
      if (!pathOk || edit.path.length === 0 || !("value" in edit)) throw new EditError("json_set needs a path and a value");
      break;
    case "json_array_upsert":
      if (!pathOk || typeof edit.key !== "string" || !isObj(edit.item) || !(edit.key in edit.item)) {
        throw new EditError("json_array_upsert needs path, key and an item that has that key");
      }
      break;
    case "json_array_remove":
      if (!pathOk || typeof edit.key !== "string" || !("value" in edit)) throw new EditError("json_array_remove needs path, key and value");
      break;
  }
}

function detectIndent(text) {
  const m = /^[{[]\r?\n([ \t]+)\S/.exec(text);
  return m ? m[1] : 2;
}

function walk(root, segs, { create }) {
  let node = root;
  for (const seg of segs) {
    if (node === null || typeof node !== "object") throw new EditError(`path ${JSON.stringify(segs)} runs into a non-object`);
    if (!(seg in node)) {
      if (!create) throw new EditError(`path ${JSON.stringify(segs)} not found`);
      node[seg] = {};
    }
    node = node[seg];
  }
  return node;
}

function withJson(text, fn) {
  if (text === null) throw new EditError("file does not exist yet; JSON edits need an existing file");
  let doc;
  try { doc = JSON.parse(text); } catch (e) { throw new EditError(`current file is not valid JSON: ${e.message}`); }
  fn(doc);
  return JSON.stringify(doc, null, detectIndent(text)) + "\n";
}

/** Apply one edit to the current text (null = the file does not exist). */
export function applyEdit(text, edit) {
  validateEdit(edit);
  switch (edit.kind) {
    case "append": {
      const base = text ?? "";
      const sep = base === "" || base.endsWith("\n") ? "" : "\n";
      return base + sep + edit.text + (edit.text.endsWith("\n") ? "" : "\n");
    }
    case "replace_text": {
      if (text === null || !text.includes(edit.find)) throw new EditError("text to replace was not found in the current file");
      return edit.all ? text.split(edit.find).join(edit.with) : text.replace(edit.find, () => edit.with);
    }
    case "json_set":
      return withJson(text, (doc) => {
        const parent = walk(doc, edit.path.slice(0, -1), { create: true });
        if (parent === null || typeof parent !== "object") throw new EditError("json_set parent is not an object");
        parent[edit.path[edit.path.length - 1]] = edit.value;
      });
    case "json_array_upsert":
      return withJson(text, (doc) => {
        const arr = walk(doc, edit.path, { create: false });
        if (!Array.isArray(arr)) throw new EditError("json_array_upsert target is not an array");
        const i = arr.findIndex((x) => isObj(x) && x[edit.key] === edit.item[edit.key]);
        if (i >= 0) arr[i] = edit.item; else arr.push(edit.item);
      });
    case "json_array_remove":
      return withJson(text, (doc) => {
        const arr = walk(doc, edit.path, { create: false });
        if (!Array.isArray(arr)) throw new EditError("json_array_remove target is not an array");
        const kept = arr.filter((x) => !(isObj(x) && x[edit.key] === edit.value));
        arr.length = 0;
        arr.push(...kept);
      });
  }
  throw new EditError(`unknown edit kind: ${edit.kind}`);
}
