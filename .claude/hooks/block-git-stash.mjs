/**
 * Refuse `git stash` in this checkout, and say what to do instead.
 *
 * ── Why a hook and not a note ────────────────────────────────────────────────
 * The rule was written down in todo.md, in detail, with recovery commands — and
 * then reached for anyway, twice on 2026-09-18, by someone who had read it. A
 * warning in a file you have to go looking in is not available at the moment the
 * command is typed. This is.
 *
 * ── Why stash is unsafe here ─────────────────────────────────────────────────
 * The repo lives inside OneDrive. The sync client holds file handles while git
 * is trying to move files, so `git stash push` half-completes: the stash entry
 * is created, the tracked modifications stay in the working tree, and untracked
 * files can be deleted from disk. Half-applied in the one direction that loses
 * work — the files it removes are the only copies.
 *
 * ── The contract ─────────────────────────────────────────────────────────────
 * Reads the PreToolUse payload on stdin, writes a `deny` decision when the Bash
 * command contains `git stash`, and writes NOTHING otherwise. Silence is how a
 * PreToolUse hook says "no opinion"; anything else here would be a hook that
 * interferes with every command in the repo to catch one.
 *
 * It fails OPEN by design. A crash, a bad payload or a missing file exits
 * non-zero without a `deny`, and the command proceeds — this is a guard rail,
 * not a permission system, and a guard rail that can wedge every Bash call in
 * the project is worse than the mistake it prevents.
 *
 * ── SO YOU MUST TEST IT, AND HERE IS HOW ────────────────────────────────────
 * Failing open has a cost that is easy to miss: **"this hook is not running"
 * and "this hook looked and was happy" are indistinguishable from outside.**
 * A missing node, a wrong path, a session that started before the hook was
 * registered — every one of them is silent, and the person typing the command
 * believes they are protected when they are not.
 *
 * That is not hypothetical. On 2026-09-20 a `git stash` ran in this repo, was
 * not blocked, and the script below was afterwards shown to deny that exact
 * command when fed it directly. The script was right the whole time; the
 * SESSION had no hooks registered. Claude Code captures hook configuration at
 * startup and requires it to be reviewed in `/hooks` before newly added config
 * takes effect, so a hook added mid-session does nothing until then.
 *
 * **Verify it, do not assume it:**
 *
 *   1. In the CLI, run `/hooks` and confirm the PreToolUse -> Bash entry is
 *      listed and approved. A fresh session also picks it up.
 *   2. Then run `git stash list`. It must be REFUSED with the message below.
 *      If it prints stash output, the hook is not active.
 *
 * Step 2 is the real check. Step 1 can look right while step 2 fails.
 *
 * The script itself can be tested without any of that:
 *
 *   echo '{"tool_input":{"command":"git stash list"}}' | node .claude/hooks/block-git-stash.mjs
 *
 * A `deny` payload on stdout means the script is fine and the problem is
 * registration. Silence means the script is the problem.
 *
 * ── The known false positive, stated rather than hidden ──────────────────────
 * It matches the TEXT of the command, so a command that merely mentions the
 * phrase is refused too — `grep -rn "git stash" todo.md` is blocked, and so is
 * anything echoing this message. That is deliberate: telling an invocation from
 * a mention needs a shell parser, and the failure directions are not equal. A
 * blocked grep costs one rephrasing; a missed stash costs the only copy of a
 * file. Rephrase the search — `grep -rn "git.stash"` — or read the file.
 */

const DENY_MESSAGE = `git stash is NOT safe in this checkout. Use a worktree instead:

    git worktree add ../bidrender-check HEAD

Why: this repo lives inside OneDrive, and the sync client holds file handles while git is trying to move files. stash half-completes here — the stash entry is created, tracked modifications stay in the working tree, and untracked files can be deleted from disk. That is half-applied in the one direction that loses work, and it has already happened.

A worktree is a separate directory, so nothing touches the files you are working in, and it answers the question stash is usually reached for: does this still happen without my changes?

If a stash has already been made, the work IS recoverable — an untracked file lives in the stash's third parent, which \`git stash show\` does not list. todo.md, "Working on this repo — traps", has the four commands and the check to run before dropping anything.`;

/**
 * `git stash` with either side bounded, so `git stashfoo` and a path like
 * `scripts/git-stash-notes.md` do not trip it, while `cd x && git stash -u`
 * does. Any amount of whitespace between the two words.
 */
const GIT_STASH = /(^|[^\w-])git\s+stash([^\w-]|$)/;

let raw = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", chunk => {
  raw += chunk;
});
process.stdin.on("end", () => {
  let command = "";
  try {
    command = JSON.parse(raw)?.tool_input?.command ?? "";
  } catch {
    // An unreadable payload is not a reason to block anything.
    return;
  }
  if (typeof command !== "string" || !GIT_STASH.test(command)) return;

  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: DENY_MESSAGE,
      },
    })
  );
});
