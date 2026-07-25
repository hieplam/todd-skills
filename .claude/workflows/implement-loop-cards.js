export const meta = {
  name: 'implement-loop-cards',
  description: 'Implement all 10 loop-improvement cards serially, each with a 3-lens adversarial review panel and merged PR',
  phases: [
    { title: 'Ground', detail: 'extract the 10 cards verbatim from the merged spec' },
    { title: 'Card 2', detail: 'heartbeat staleness threshold' },
    { title: 'Card 1', detail: 'cap Warchief audit loop' },
    { title: 'Card 6', detail: 'repo-wide eval harness' },
    { title: 'Card 3', detail: 'Tracker model routing' },
    { title: 'Card 4', detail: 'Skinner /goal-compatible verdict' },
    { title: 'Card 5', detail: 'Warchief CI-wait via gh run watch' },
    { title: 'Card 7', detail: 'deterministic validator scripts' },
    { title: 'Card 8', detail: 'verify-shipped skill' },
    { title: 'Card 9', detail: 'tribe campaign-routine mode' },
    { title: 'Card 10', detail: 'workflow orchestration + nesting smoke test' },
  ],
}

const REPO = '/Users/home/repos/todd-skills'
const SPEC = 'docs/superpowers/specs/2026-07-07-loops-applied-to-todd-skills.md'
const SCRATCH = '/private/tmp/claude-501/-Users-home-repos-todd-skills/a9b3a56b-06a5-4af7-a993-65c72459afb6/scratchpad'
const ORDER = [2, 1, 6, 3, 4, 5, 7, 8, 9, 10]

const GIT_RULES = `GIT PROTOCOL (mandatory):
- NEVER commit on master or touch the main checkout at ${REPO} (a wtguard hook protects master anyway).
- Work in your own worktree: cd ${REPO} && git fetch origin && git worktree add <WTPATH> -b <BRANCH> origin/master
- Conventional commit messages. ABSOLUTELY NO Co-authored-by trailers.
- When done: push with git push -u origin <BRANCH>, then git worktree remove <WTPATH> --force.
- Do NOT open or merge a PR yourself — a later step does that.`

const CARDS_SCHEMA = {
  type: 'object', required: ['cards'],
  properties: { cards: { type: 'array', items: {
    type: 'object', required: ['id', 'title', 'text'],
    properties: { id: {type:'number'}, title: {type:'string'}, text: {type:'string'} } } } }
}

const IMPL_SCHEMA = {
  type: 'object', required: ['branch', 'summary', 'filesChanged', 'evidence', 'blocked'],
  properties: {
    branch: {type:'string'}, summary: {type:'string'},
    filesChanged: {type:'array', items:{type:'string'}},
    evidence: {type:'string', description:'proof you RAN (commands + output excerpts), not claims'},
    blocked: {type:'boolean'}, blockReason: {type:'string'}
  }
}

const VERDICT_SCHEMA = {
  type: 'object', required: ['verdict', 'findings', 'proof'],
  properties: {
    verdict: {enum:['PASS','FAIL']},
    findings: {type:'array', items:{type:'object', required:['severity','issue'],
      properties:{severity:{enum:['must-fix','suggestion']}, file:{type:'string'}, issue:{type:'string'}}}},
    proof: {type:'string', description:'what you actually ran/checked'}
  }
}

const MERGE_SCHEMA = {
  type: 'object', required: ['merged'],
  properties: {
    merged: {type:'boolean'}, prUrl: {type:'string'}, prNumber: {type:'number'},
    masterSha: {type:'string'}, notes: {type:'string'}
  }
}

const LENSES = [
  { key: 'spec', name: 'Spec-conformance prover', brief: `You are a Skinner-style adversarial done-ness auditor. Build a numbered requirement inventory from the card text (every Goal / Scope-fence clause). Map the diff to each requirement BIDIRECTIONALLY: requirements with no evidence (under-delivery) AND changes with no requirement (scope creep beyond the fence). RUN the actual proof — do not trust the implementer's claims: execute any new/changed scripts (bash -n at minimum, real invocation where safe and read-only), verify quoted line references exist, verify cross-file consistency (e.g. a threshold stated in one agent file must match every other file that states it). Bias toward FAIL on any uncertainty.` },
  { key: 'governance', name: 'Governance auditor', brief: `You audit repo rules and conventions. Check: (1) git log of the branch — conventional commit format, ZERO Co-authored-by trailers; (2) if any NEW plugin/skill/agent dir was added: it must be registered in .claude-plugin/marketplace.json AND be installable by the root install.sh (only agents/, skills/, claude-md/, .claude-plugin component dirs are supported — anything else triggers install warnings); (3) no hardcoded personal absolute paths (/Users/...) in shipped skill/agent content; (4) doc style matches existing files in the same dir (frontmatter shape, tone, section conventions — read a sibling file and compare); (5) changes stay inside the card's scope fence. Bias toward FAIL on violations.` },
  { key: 'refuter', name: 'Refuter', brief: `Your ONLY job is to try to REFUTE that this change works and is safe. Attack it: contradictions with other files in the repo that were NOT updated (grep for stale references to the old behavior/values); shell scripts that break on macOS bash 3.2 (no assoc arrays, no mapfile) or when git state is unusual (detached HEAD, no upstream, spaces in paths); instructions an LLM agent could misread (ambiguous thresholds, conflicting stop conditions); edge cases where the new stop-condition/threshold deadlocks or fires wrongly. If after genuine effort you cannot refute it, PASS. Every refutation you CAN demonstrate (by running something or quoting contradicting lines) is a must-fix finding.` },
]

function implPrompt(card) {
  return `You are implementing EXACTLY ONE improvement card in the todd-skills repo at ${REPO}. Read the full spec first for shared context: ${REPO}/${SPEC} (your card plus the provenance/refuted-claim/drift warnings at top).

## Your card (verbatim from the spec)
CARD ${card.id}: ${card.title}
${card.text}

## Rules
- Implement ONLY this card. Stay inside its scope fence. If a previous card's merge already made part of this change (check current file state on origin/master), reconcile — do not duplicate or contradict it.
- READ every file you will touch before editing; match its existing conventions, tone, and structure exactly.
- Shell scripts: bash-3.2 compatible (macOS default — no mapfile, no associative arrays), executable bit set, pass bash -n, handle missing-tool cases gracefully.
- Agent/skill .md edits: keep frontmatter valid; keep edits surgical — do not rewrite sections the card does not name.
- ${GIT_RULES}
- Worktree path: ${SCRATCH}/wt-card${card.id} ; branch name: cards/card-${card.id}
- Before pushing, RUN your proof: bash -n on scripts, actually execute read-only scripts against the repo, grep the repo for now-stale references your change creates and fix them if inside your fence (report them if outside).

Return: branch, filesChanged, summary, evidence (commands you ran + key output), blocked=false. If the card cannot be completed as specified (e.g. a prerequisite fails), set blocked=true with blockReason and still push whatever partial work is coherent — for card 10 specifically: attempt the nesting smoke test in a cheap, bounded way (e.g. a headless claude -p invocation with a trivial 2-level Task dispatch, timeout ~8 min); if the environment cannot support it, document the smoke-test procedure + gate the new orchestration docs on it, and say so honestly in evidence.`
}

function reviewPrompt(card, branch, lens) {
  return `ADVERSARIAL REVIEW — lens: ${lens.name}. Repo: ${REPO}. Branch under review: ${branch} (pushed to origin).

## The card this branch must implement (verbatim)
CARD ${card.id}: ${card.title}
${card.text}

## How to review
- cd ${REPO} && git fetch origin, then review with: git diff origin/master...origin/${branch} and git log origin/master..origin/${branch}
- You may create a READ-ONLY throwaway worktree to run proofs: git worktree add ${SCRATCH}/rv-card${card.id}-${lens.key} origin/${branch} (remove it when done: git worktree remove --force). NEVER modify the branch, master, or the main checkout.
- Also read the spec header for standing constraints: ${REPO}/${SPEC}

## Your lens
${lens.brief}

Return verdict PASS or FAIL, findings (each severity must-fix or suggestion, with file), and proof of what you actually ran/checked. FAIL requires at least one must-fix finding.`
}

function fixPrompt(card, branch, fails, round) {
  return `FIX ROUND ${round}: an adversarial review panel found must-fix issues on branch ${branch} in ${REPO}, which implements this card:

CARD ${card.id}: ${card.title}
${card.text}

## Must-fix findings (address EVERY one; if you believe a finding is factually wrong, refute it in your evidence with proof instead of changing code)
${fails.map((f, i) => `${i + 1}. [${f.lens}] ${f.file ? f.file + ': ' : ''}${f.issue}`).join('\n')}

## Protocol
- cd ${REPO} && git fetch origin && git worktree add ${SCRATCH}/wt-card${card.id}-fix${round} ${branch} (existing branch, NOT -b)
- Fix, commit (conventional message, NO Co-authored-by), push origin ${branch}, then git worktree remove ${SCRATCH}/wt-card${card.id}-fix${round} --force
- Stay inside the card's scope fence. RUN proofs for your fixes.

Return branch, filesChanged, summary, evidence, blocked=false (or blocked=true + blockReason if a finding cannot be satisfied inside the fence).`
}

function mergePrompt(card, branch) {
  return `SHIP branch ${branch} of ${REPO} (implements improvement card ${card.id}: ${card.title}). The branch passed adversarial review.

Protocol:
1. cd ${REPO} && git fetch origin. Confirm the branch merges cleanly onto origin/master (git merge-tree or a throwaway check); if there are conflicts, rebase the branch onto origin/master in a temp worktree, resolve minimally, force-push-with-lease, and note it.
2. gh pr create --head ${branch} — conventional title, body: 2-4 sentence summary of the card + what the adversarial panel verified, ending with exactly:
🤖 Generated with [Claude Code](https://claude.com/claude-code)
3. Wait for CI: gh pr checks <num> --watch (if the repo has no required checks beyond GitGuardian, a green/empty check run is fine; do not wait more than ~10 minutes — report instead of hanging).
4. gh pr merge <num> --squash --delete-branch
5. Update the main checkout: cd ${REPO} && git checkout master && git pull, and prune: git worktree prune
6. NO Co-authored-by anywhere.

Return merged (bool), prUrl, prNumber, masterSha (git rev-parse HEAD after pull), notes.`
}

function collectMustFix(verdicts) {
  const out = []
  verdicts.filter(Boolean).forEach((v, i) => {
    if (v.verdict === 'FAIL') {
      v.findings.filter(f => f.severity === 'must-fix').forEach(f => out.push({ ...f, lens: LENSES[i] ? LENSES[i].key : 'panel' }))
    }
  })
  return out
}

phase('Ground')
const ground = await agent(`Read ${REPO}/${SPEC} and return ALL 10 improvement cards. For each: its number (1-10), its title, and its FULL VERBATIM text (goal, why/grounding, scope fence, priority — everything under that card's heading, unabridged). Also append to card text any doc-header constraints that apply to all cards (refuted-claim warning, drift warning) ONLY if they are stated as per-card constraints; otherwise ignore. Return exactly 10 cards.`, { label: 'extract-cards', phase: 'Ground', schema: CARDS_SCHEMA })

if (!ground || !ground.cards || !ground.cards.length) { return { error: 'could not extract cards from spec', results: [] } }
const byId = {}
ground.cards.forEach(c => { byId[c.id] = c })

const results = []
for (const id of ORDER) {
  const card = byId[id]
  const ph = `Card ${id}`
  if (!card) { results.push({ id, status: 'MISSING_FROM_SPEC' }); continue }
  log(`Card ${id} (${card.title}): implementing`)

  const impl = await agent(implPrompt(card), { label: `implement:card${id}`, phase: ph, schema: IMPL_SCHEMA })
  if (!impl) { results.push({ id, status: 'IMPLEMENTER_DIED' }); continue }
  if (impl.blocked) { results.push({ id, status: 'BLOCKED', detail: impl.blockReason, branch: impl.branch }); log(`Card ${id}: BLOCKED — ${impl.blockReason}`); continue }
  const branch = impl.branch

  let verdicts = await parallel(LENSES.map(l => () => agent(reviewPrompt(card, branch, l), { label: `review:card${id}:${l.key}`, phase: ph, schema: VERDICT_SCHEMA })))
  let fails = collectMustFix(verdicts)
  let round = 0
  while (fails.length && round < 2) {
    round++
    log(`Card ${id}: ${fails.length} must-fix findings — fix round ${round}`)
    const fix = await agent(fixPrompt(card, branch, fails, round), { label: `fix:card${id}:r${round}`, phase: ph, schema: IMPL_SCHEMA })
    if (!fix || fix.blocked) { fails = fails.map(f => ({ ...f, unresolvable: true })); break }
    verdicts = await parallel(LENSES.map(l => () => agent(reviewPrompt(card, branch, l), { label: `re-review:card${id}:${l.key}:r${round}`, phase: ph, schema: VERDICT_SCHEMA })))
    fails = collectMustFix(verdicts)
  }
  if (fails.length) {
    results.push({ id, status: 'REVIEW_FAILED', branch, unresolvedFindings: fails })
    log(`Card ${id}: REVIEW_FAILED after ${round} fix rounds — branch ${branch} left unmerged for human review`)
    continue
  }

  const merged = await agent(mergePrompt(card, branch), { label: `merge:card${id}`, phase: ph, schema: MERGE_SCHEMA })
  const ok = merged && merged.merged
  results.push({ id, status: ok ? 'SHIPPED' : 'MERGE_FAILED', pr: merged && merged.prUrl, prNumber: merged && merged.prNumber, masterSha: merged && merged.masterSha, branch, notes: merged && merged.notes })
  log(`Card ${id}: ${ok ? 'SHIPPED ' + (merged.prUrl || '') : 'MERGE_FAILED — branch ' + branch + ' left for human review'}`)
}

const shipped = results.filter(r => r.status === 'SHIPPED').length
log(`Done: ${shipped}/10 cards shipped`)
return { shipped, results }