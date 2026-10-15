import type { TagSetResponse } from '../../../generated/properties/types.gen';
import type { PostSoupAstRequest } from '../../../generated/storage/types.gen';
import { unwrap } from '../../utils';
import type { MacroClient } from '../../utils/client';
import type {
  WorkspaceListOptions,
  WorkspaceTag,
  WorkspaceType,
} from './types';

const nil = '00000000-0000-0000-0000-000000000000';
const excludedFilters = {
  document: ['df', 'id'],
  project: ['pf', 'pid'],
  ai_chat: ['cf', 'cid'],
  email: ['ef', 'ThreadId'],
  channel: ['chanf', 'ChannelId'],
  channel_thread: ['cthf', 'ThreadId'],
  call: ['callf', 'CallId'],
  calendar_event: ['calf', 'id'],
  foreign_entity: ['fef', 'id'],
} as const;

/** Match Rust eq_ignore_ascii_case without changing non-ASCII labels. */
const fold = (text: string) =>
  text.replace(/[A-Z]/g, (letter) => letter.toLowerCase());
const and = (left: unknown, right: unknown) =>
  left == null ? right : { '&': [left, right] };

/** @internal */
export class WorkspaceQuery {
  private tagSets?: Promise<TagSetResponse[]>;
  constructor(private readonly client: MacroClient) {}

  private sets(): Promise<TagSetResponse[]> {
    this.tagSets ??= this.client.properties.listTags({}).then(unwrap);
    return this.tagSets;
  }

  async tagMap(): Promise<Map<string, WorkspaceTag>> {
    const result = new Map<string, WorkspaceTag>();
    for (const set of await this.sets()) {
      for (const option of set.options) {
        if (option.value.type === 'string')
          result.set(option.id, {
            label: option.value.value,
            scope:
              set.scope === 'user' ? ('personal' as const) : ('team' as const),
          });
      }
    }
    return result;
  }

  async body(options: WorkspaceListOptions): Promise<PostSoupAstRequest> {
    for (const [name, value, allowed] of [
      [
        'sortBy',
        options.sortBy,
        ['recently_viewed', 'recently_updated', 'recently_created'],
      ],
      ['emailPreset', options.emailPreset, ['signal']],
      ['tagsMatch', options.tagsMatch, ['any', 'all']],
    ] as const) {
      if (
        value !== undefined &&
        !(allowed as readonly string[]).includes(value)
      )
        throw new Error(`Invalid workspace ${name}: ${value}`);
    }
    if (
      options.includeTypes !== undefined &&
      (!Array.isArray(options.includeTypes) ||
        options.includeTypes.some(
          (type) => !Object.hasOwn(excludedFilters, type),
        ))
    )
      throw new Error('Invalid workspace includeTypes');
    if (
      options.tags?.some(
        (tag) =>
          tag.scope !== undefined &&
          tag.scope !== 'personal' &&
          tag.scope !== 'team',
      )
    )
      throw new Error('Invalid workspace tag scope');
    if (options.limit !== undefined && !Number.isFinite(options.limit))
      throw new Error('Workspace limit must be finite');
    const body: PostSoupAstRequest = {
      df: options.df,
      pf: options.pf,
      cf: options.cf,
      ef: options.ef,
      chanf: options.chanf,
      cthf: options.cthf,
      callf: options.callf,
      fef: options.fef,
      calf: options.calf,
      propf: options.propf,
      ccf: { l: { id: nil } },
      favorites_only: options.favoritesOnly,
      expand: true,
      limit: Math.max(1, Math.min(500, Math.trunc(options.limit ?? 50))),
      sort_method:
        options.sortBy === 'recently_viewed'
          ? 'viewed_at'
          : options.sortBy === 'recently_created'
            ? 'created_at'
            : 'updated_at',
      sort_direction: 'desc',
      emailView: options.emailView ?? 'inbox',
    };
    if (options.emailPreset === 'signal')
      body.ef = {
        '&': [{ l: { Importance: true } }, { l: { Shared: 'exclude' } }],
      };
    const inbox = options.inbox?.trim();
    if (inbox) {
      const { links } = unwrap(await this.client.email.listLinks());
      const matches = links.filter(
        (link) => fold(link.email_address) === fold(inbox),
      );
      const match = matches[0];
      if (!match)
        throw new Error(
          `No connected inbox matches "${inbox}". Connected inboxes: ${links.map((link) => link.email_address).join(', ')}.`,
        );
      if (matches.length > 1)
        throw new Error(
          `Multiple connected inboxes match "${inbox}"; cannot pick one.`,
        );
      body.ef = and(body.ef, { l: { Owner: match.id } });
    }
    const includeTypes =
      options.includeTypes ??
      (options.emailPreset === 'signal' ? ['email'] : undefined);
    if (includeTypes?.length) {
      for (const [type, [field, literal]] of Object.entries(excludedFilters)) {
        if (!includeTypes.includes(type as WorkspaceType))
          body[field] = { l: { [literal]: nil } };
      }
    }
    if (options.tags?.length) {
      const available = (await this.sets()).flatMap((set) => {
        const definition = set.definition;
        if (!definition) return [];
        return set.options.flatMap((option) =>
          option.value.type === 'string'
            ? [
                {
                  id: option.id,
                  definitionId: definition.id,
                  label: option.value.value,
                  scope:
                    set.scope === 'user'
                      ? ('personal' as const)
                      : ('team' as const),
                },
              ]
            : [],
        );
      });
      const selected = new Map<string, (typeof available)[number]>();
      for (const filter of options.tags) {
        const matches = available.filter(
          (tag) =>
            fold(tag.label) === fold(filter.label.trim()) &&
            (!filter.scope || tag.scope === filter.scope),
        );
        if (!matches.length)
          throw new Error(
            `Unknown tag "${filter.label}". Available tags: ${available.map((tag) => `${tag.label} (${tag.scope})`).join(', ')}.`,
          );
        if (options.tagsMatch === 'all' && matches.length > 1)
          throw new Error(
            `Tag "${filter.label}" is ambiguous; specify personal or team scope.`,
          );
        for (const tag of matches) selected.set(tag.id, tag);
      }
      const expressions = [...selected.values()].map((tag) => ({
        l: { pd: tag.definitionId, v: { so: tag.id } },
      }));
      const combined = expressions.reduce<unknown>(
        (previous, expr) =>
          previous === undefined
            ? expr
            : { [options.tagsMatch === 'all' ? '&' : '|']: [previous, expr] },
        undefined,
      );
      body.propf = and(body.propf, combined);
    }
    return body;
  }
}
