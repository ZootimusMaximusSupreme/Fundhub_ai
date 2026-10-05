// Inngest client — Master Rebuild Spec §2/§6: the 140 CRM workflows become Inngest
// functions (durable steps, waits, branches), ~60 of which actually survive.
// One client for the whole platform; each workflow file in this directory registers
// exactly one function against it.
//
// The heartbeat add-on (2026-10-05, MB2): every SCHEDULED run writes one row to
// job_heartbeats when it finishes, so the daily pulse can tell a job that ran
// from one that silently stopped. It lives here, on the one client, so a job
// file cannot forget it. It writes a receipt and nothing else; it never changes
// what a job does or returns. See src/pulse/heartbeats.mjs.
import { Inngest, InngestMiddleware } from "inngest";
import { db } from "../db.mjs";
import { heartbeatHooks } from "../pulse/heartbeats.mjs";

const heartbeat = new InngestMiddleware({
  name: "Job heartbeat",
  init: () => heartbeatHooks({ getDb: () => db })
});

export const inngest = new Inngest({ id: "fundhub-platform", middleware: [heartbeat] });
