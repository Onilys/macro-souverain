set -euo pipefail
# The $WORKFLOW workflow runs on `pull_request` events. GitHub delivers none
# for a PR that conflicts with its base, and the release job skips fork PRs;
# either way the label did nothing and nobody was told. Say so on the PR and
# take the label off: a release label with no release behind it misleads the
# drift and watch workflows. When the PR is mergeable there is nothing to do
# here — the release workflow itself reports on the PR.
if [[ "$HEAD_REPO" != "$GH_REPO" ]]; then
  why="this PR comes from a fork (\`${HEAD_REPO}\`), and releases are only built from branches in this repository."
  next="Push the branch to this repository, open a PR from it, and add the \`${LABEL}\` label there."
elif merge=$(pr_merge_commit); then
  echo "PR #${PR_NUMBER} is mergeable (merge result ${merge:0:10}); the ${WORKFLOW} workflow runs and reports on the PR itself."
  exit 0
elif [[ "$(gh pr view "$PR_NUMBER" --repo "$GH_REPO" --json mergeable --jq '.mergeable')" == "CONFLICTING" ]]; then
  why="this PR has merge conflicts with its base branch, and GitHub does not run \`pull_request\` workflows (the **${WORKFLOW}** workflow among them) on a conflicting PR."
  next="Resolve the conflicts, wait for the checks, then re-add the \`${LABEL}\` label."
else
  # Still UNKNOWN after the helper's polling: GitHub may or may not have run
  # the release. Say so without touching the label — removing it under a
  # release that did start would hide that release from the drift and watch
  # workflows.
  gh pr comment "$PR_NUMBER" --repo "$GH_REPO" --body "⚠️ GitHub has not worked out whether this PR is mergeable, so it is unclear whether the **${WORKFLOW}** workflow started. If no **${WORKFLOW}** run appears in this PR's checks within a few minutes, remove and re-add the \`${LABEL}\` label."
  exit 0
fi
gh pr edit "$PR_NUMBER" --repo "$GH_REPO" --remove-label "$LABEL"
gh pr comment "$PR_NUMBER" --repo "$GH_REPO" --body "⚠️ The ${PLATFORM} release did not start: ${why} The \`${LABEL}\` label was removed.

${next}"
echo "PR #${PR_NUMBER}: ${why}"
