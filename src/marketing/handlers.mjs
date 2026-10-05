// Job handlers the marketing worker runs, by job kind. Empty in M0: the batch
// writer arrives with M1 (spec §7) and registers `write_batch` here. A job whose
// kind has no handler fails at once with that reason, so nothing waits forever.

export const JOB_HANDLERS = Object.freeze({});

export default JOB_HANDLERS;
