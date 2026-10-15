---
name: test-value
description: Read before writing or changing automated tests, test fixtures, snapshots, or verification harnesses, including tests proposed by TDD, refactoring, or bug-fix workflows. Decide whether new coverage earns its maintenance cost. Not needed just to run existing tests.
---

# Test value

Read the [shared test-value rules](../../../CODING.md#tests)
(TEST-01 through TEST-05) before drafting test code or building its setup. They
apply even when another skill or plugin asks for a test or verification harness.

## Decide before writing

Inspect the affected production behavior and the nearest existing tests. Answer:

1. What concrete, plausible incorrect behavior would this test catch?
2. Which assertion against production behavior would fail in that case?
3. Why do existing tests, compiler checks, or required browser checks leave a gap
   worth the test's setup and maintenance cost?

If there is no concrete answer, skip the new test. Running existing checks or
using a temporary reproduction can be sufficient. Do not invent edge cases,
build a harness, or extract production code just to justify adding coverage.

If coverage is warranted, extend the nearest suitable test or add the smallest
focused case. For a bug fix, demonstrate the failing behavior before the fix
when practical. Keep assertions independent of the implementation and retain
meaningful existing coverage.

## Review before keeping

Recheck the three answers against the actual test. Remove redundant new cases
and assertions that only confirm fixture setup, mock wiring, or implementation
details. Report the protected behavior with the validation results; no separate
planning document or user approval is needed. Stop when the relevant checks
pass unless new evidence identifies an unresolved risk.
