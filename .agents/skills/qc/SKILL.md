---
name: qc
description: Quality gate. 5 parallel agents review changes. All must pass.
allowed-tools: Task, Bash, Read, Grep, Glob
---

# QC Gate

## Setup
```bash
DIFF=$(git diff main)
FILES=$(git diff main --name-only)
TASK="{task description or 'general changes'}"
```

Read 1-2 unmodified files from same directories for pattern context.
For changes to tests, read the [test-value rules](../../../CODING.md#tests)
and include TEST-01 through TEST-05 in the Consistency and Scope reviews.

## Agents

Spawn all 5 in parallel. All output raw JSON only, no markdown.

### 1: Code Review (sonnet)
```
DIFF: ${DIFF}

- Descriptive naming?
- Errors caught with useful messages?
- No hardcoded values, commented code, debug statements?
- No TODO without ticket ref?
- No obvious bugs?
- No useless comments?

{"pass": bool, "issues": [...]}
```

### 2: Simplification (sonnet)
```
DIFF: ${DIFF}

- Is this overcomplicated? Can I solve the same problem in a simpler manner?
- Can I reduce indirection?
- Can I reduce surface area?
- Premature abstraction? Premature Optimization? YAGNI violations?
- Dead code?
- Three similar lines > one abstraction

{"pass": bool, "issues": [...]}
```

### 3: Consistency (sonnet)
```
DIFF: ${DIFF}
PATTERNS: ${PATTERN_FILES}

- Matches existing codebase patterns?
- Proper types, no any, no unsafe casts?
- Idiomatic error handling?
- Changes internally consistent?
- Is logic isolated and composable?
- Does each added test catch a concrete, plausible failure that existing coverage
  misses (TEST-01), while exercising production behavior (TEST-02)?
- Do tests preserve meaningful coverage without merely restating implementation,
  fixtures, mocks, or type-system guarantees (TEST-03, TEST-04)?

{"pass": bool, "issues": [...]}
```

### 4: Robustness (sonnet)
```
TASK: ${TASK}
DIFF: ${DIFF}

- Actually solves the problem?
- Edge cases: empty, null, zero, negative, boundaries, concurrency?
- Regression risk: changed signatures, shared state, removed exports?
- Maintains API contracts?

{"pass": bool, "issues": [...]}
```

### 5: Scope (haiku)
```
TASK: ${TASK}
FILES: ${FILES}
DIFF: ${DIFF}

- Solved the problem or just the symptom?
- Changes unrelated to task?
- Unnecessary refactoring?
- Unnecessary tests, duplicate coverage, or test setup disproportionate to the
  change's risk (TEST-01, TEST-04, TEST-05)?

{"pass": bool, "issues": [...]}
```

## Results

| Check | Verdict | Issues |
|-------|---------|--------|
| Code Review | ✓/✗ | ... |
| Simplification | ✓/✗ | ... |
| Consistency | ✓/✗ | ... |
| Robustness | ✓/✗ | ... |
| Scope | ✓/✗ | ... |

**ALL PASS:** Ready to commit.

**ANY FAIL:** List issues, fix them, run `/qc` again.

**Same issue 3x:** Escalate to user.

## Notes

- Invalid JSON? Retry once. Still broken? Mark fail.
- Large diffs (>500 lines): run simplification file-by-file.
