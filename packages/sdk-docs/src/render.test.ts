import { readFile } from 'node:fs/promises';
import { expect, test } from 'vitest';

const output = new URL('../dist/docs/', import.meta.url);
const reference = new URL('../reference/', import.meta.url);

test('public SDK pages preserve signatures and linked wire contracts in both formats', async () => {
  const markdown = await readFile(
    new URL(
      'src/entities/workspace/namespace/classes/WorkspaceNamespace.md',
      reference
    ),
    'utf8'
  );
  expect(markdown).toContain('# Class: WorkspaceNamespace');
  expect(markdown).toContain('page()');
  expect(markdown).toContain('list()');
  expect(markdown).toContain('WorkspacePageOptions');
  expect(markdown).not.toContain('property-client');
  expect(markdown).not.toContain('/home/');
  const wire = await readFile(
    new URL(
      'generated/storage/types.gen/type-aliases/ApiEntityFilterAst.md',
      reference
    ),
    'utf8'
  );
  expect(wire).toContain('ApiEntityFilterAst');
  const html = await readFile(
    new URL(
      'html/classes/src_entities_workspace_namespace.WorkspaceNamespace.html',
      output
    ),
    'utf8'
  );
  expect(html).toContain('WorkspacePageOptions');
  expect(html).toContain('list');
});

test('document content and AI contracts come from the SDK source', async () => {
  const document = await readFile(
    new URL('src/entities/documents/document/classes/Document.md', reference),
    'utf8'
  );
  expect(document).toContain('content()');
  expect(document).not.toContain('property-client');
  const ai = await readFile(
    new URL('src/entities/ai/namespace/classes/AiNamespace.md', reference),
    'utf8'
  );
  expect(ai).toContain('structuredCompletion');
  expect(ai).toContain('decide');
});

test('object aliases expose concrete fields while retaining linked types and descriptions', async () => {
  const patch = await readFile(
    new URL(
      'generated/agent-harness/types.gen/type-aliases/AgentSessionChangesPatchResponse.md',
      reference
    ),
    'utf8'
  );
  expect(patch).toMatch(/^> .*`patch`: `string`/m);
  expect(patch).not.toContain('= `object`');
  expect(patch).toContain(
    'The git-style unified diff of the current changeset.'
  );
  const request = await readFile(
    new URL(
      'generated/cognition/types.gen/type-aliases/StructuredCompletionRequest.md',
      reference
    ),
    'utf8'
  );
  expect(request).toMatch(/^> .*\[`DynamicSchema`\]\(DynamicSchema\.md\)/m);
  expect(request).toContain('## Properties');
});
