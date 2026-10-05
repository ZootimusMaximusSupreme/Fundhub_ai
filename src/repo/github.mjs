// Re-exports the GitHub client helpers (spec M0 step 2). The client itself, and
// every outbound call, lives in src/messaging/providers/github-repo.mjs.
export {
  repoConfig, getRef, getCommit, readFile, recentCommits, createTree, createCommit, updateRef,
  COMMIT_AUTHOR, DEFAULT_BRANCH
} from "../messaging/providers/github-repo.mjs";
