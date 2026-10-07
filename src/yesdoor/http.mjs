// Small shared helpers for the api/yesdoor handlers. No SQL here, no Fundhub imports.

import { YD_API } from "./config.mjs";

/** An error a handler turns into a clean JSON refusal. */
export class YdError extends Error {
  constructor(status, code, message) {
    super(message || code);
    this.name = "YdError";
    this.status = status;
    this.code = code;
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v) => typeof v === "string" && UUID_RE.test(v);

/** Integer cents out of a pg bigint (which arrives as a string). NULL stays NULL. */
export const cents = (v) => (v === null || v === undefined ? null : Number(v));

/** pg returns count(*) as a string. */
export const num = (v) => (v === null || v === undefined ? 0 : Number(v));

/** First value of a query parameter (Netlify can hand back arrays). */
export function qs(req, name) {
  const v = req?.query?.[name];
  const one = Array.isArray(v) ? v[0] : v;
  return one === undefined || one === null || one === "" ? null : String(one);
}

/** A required-shape uuid query parameter, or a 400. */
export function uuidParam(req, name) {
  const v = qs(req, name);
  if (!v) throw new YdError(400, `${name}_required`);
  if (!isUuid(v)) throw new YdError(400, "invalid_parameter", `${name} is not a valid id`);
  return v;
}

/** An optional uuid query parameter. */
export function optUuidParam(req, name) {
  const v = qs(req, name);
  if (!v) return null;
  if (!isUuid(v)) throw new YdError(400, "invalid_parameter", `${name} is not a valid id`);
  return v;
}

/** limit= with a default and a ceiling. */
export function limitParam(req, name = "limit") {
  const v = qs(req, name);
  if (v === null) return YD_API.listLimitDefault;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1) throw new YdError(400, "invalid_parameter", `${name} must be a positive whole number`);
  return Math.min(n, YD_API.listLimitMax);
}

/** Allow only the listed methods; answers 405 with an `allow` header. Returns true to go on. */
export function allowMethods(req, res, allowed = ["GET"]) {
  if (allowed.includes(req.method)) return true;
  res.setHeader("allow", allowed.join(", "));
  res.status(405).json({ ok: false, error: "method_not_allowed" });
  return false;
}

/** The caller's address, first hop of x-forwarded-for. */
export function clientIp(req) {
  const xf = req.headers?.["x-forwarded-for"];
  if (typeof xf === "string" && xf.trim()) return xf.split(",")[0].trim();
  return req.socket?.remoteAddress || null;
}

/** Turn a thrown YdError (or a bad-input database error) into a response.
 *  Anything else is re-thrown so the Netlify adapter scrubs and logs it. */
export function sendError(res, e) {
  if (e instanceof YdError) {
    return res.status(e.status).json({ ok: false, error: e.code, ...(e.message !== e.code ? { message: e.message } : {}) });
  }
  // 22P02 invalid text representation, 22007/22008 bad date: the caller's input.
  if (e && (e.code === "22P02" || e.code === "22007" || e.code === "22008")) {
    return res.status(400).json({ ok: false, error: "invalid_parameter" });
  }
  throw e;
}

/** Parse a YYYY-MM-DD or ISO timestamp query parameter; a 400 on garbage. */
export function dateParam(req, name) {
  const v = qs(req, name);
  if (v === null) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) throw new YdError(400, "invalid_parameter", `${name} is not a date`);
  return d;
}
