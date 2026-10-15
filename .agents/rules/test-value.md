---
description: "Read the test-value skill before writing tests, fixtures, snapshots, or verification harnesses."
alwaysApply: true
---

# Decide whether a test earns its place

Before writing or changing automated tests, test fixtures, snapshots, or
verification harnesses, read the [test-value skill](../skills/test-value/SKILL.md)
and follow [TEST-01 through TEST-05](../../CODING.md#tests). This applies even
when another skill or plugin requests TDD or a test for every change. Running
existing tests alone does not require the skill.

Check: review changed tests against TEST-01 through TEST-05; each new test must
protect against a concrete failure that existing checks miss, with setup
proportional to the risk. Do not require new tests when no such gap exists.
