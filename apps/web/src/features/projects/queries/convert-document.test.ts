import { err, ok } from 'neverthrow';
import { afterEach, expect, it, vi } from 'vitest';
import { convertDocumentToProject } from './convert-document';

const mock = vi.hoisted(() => ({ refetch: vi.fn() }));
vi.mock('@queries/soup/cache', () => ({ refetchSoupEntity: mock.refetch }));
afterEach(() => vi.clearAllMocks());

const document = {
  id: 'doc-1',
  name: 'Launch plan',
  markdown: '# Goals\n\nShip it\n',
};
const created = {
  id: 'project-1',
  name: 'Launch plan',
  updatedAt: '2026-10-20T12:00:00Z',
  userAccessLevel: 'owner' as const,
  taskCount: 0,
  completedTaskCount: 0,
  properties: [],
  ownerId: 'viewer',
  memberIds: [],
  taskIds: [],
  createdAt: '2026-10-20T12:00:00Z',
  sharePermission: {} as never,
};

it('creates an unshared project from the document, then trashes the document', async () => {
  const create = vi.fn(async () => ok(created));
  const trash = vi.fn(async () => true);

  const result = await convertDocumentToProject({ create }, trash, document);

  expect(create).toHaveBeenCalledWith({
    name: 'Launch plan',
    description: '# Goals\n\nShip it',
    shareWithTeam: false,
  });
  expect(trash).toHaveBeenCalledWith('doc-1');
  expect(result._unsafeUnwrap()).toEqual({
    projectId: 'project-1',
    documentTrashed: true,
  });
});

it('leaves the document alone when the project is not created', async () => {
  const trash = vi.fn(async () => true);

  const result = await convertDocumentToProject(
    { create: async () => err([{ code: 'UNKNOWN', message: 'down' }]) },
    trash,
    document
  );

  expect(result._unsafeUnwrapErr()).toEqual({ kind: 'create-failed' });
  expect(trash).not.toHaveBeenCalled();
});

it('reports a project whose document could not be trashed', async () => {
  const result = await convertDocumentToProject(
    { create: async () => ok(created) },
    async () => false,
    document
  );

  expect(result._unsafeUnwrap()).toEqual({
    projectId: 'project-1',
    documentTrashed: false,
  });
});
