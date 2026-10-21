import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@solidjs/testing-library';
import {
  createSignal,
  ErrorBoundary,
  type JSX,
  type ParentProps,
  Show,
} from 'solid-js';
import { afterEach, expect, it, vi } from 'vitest';
import type { CrmCommentTarget } from '../context/workspace-context';
import type { CrmContact } from '../core/contact';
import type { CrmRecordRef, CrmRecordSection } from '../core/record';
import { CrmRecordDetail } from './record-detail';

vi.mock('@ui', async () => ({
  ...(await import('../../../components/ui/utils/classname')),
  Tooltip: (props: ParentProps) => <>{props.children}</>,
  Button: (props: JSX.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props} />
  ),
}));
vi.mock('@components/app/side-panel', () => ({
  SidePanel: {
    Root: (props: ParentProps) => <>{props.children}</>,
    Toggle: () => null,
  },
}));
vi.mock('@core/component/EntityIcon', () => ({ EntityIcon: () => null }));
vi.mock('./copy-link-button', () => ({ CrmCopyLinkButton: () => null }));
vi.mock('../components/record-tabs', () => ({
  RecordTabs: (props: { onChange(section: CrmRecordSection): void }) => (
    <button type="button" onClick={() => props.onChange('emails')}>
      Show emails
    </button>
  ),
}));
vi.mock('./use-crm', () => ({
  useCompanyQuery: () => ({
    query: { isError: false },
    company: () => undefined,
  }),
  useContactQuery: () => ({ isSuccess: false, isError: false }),
}));
vi.mock('@solidjs/router', () => ({ useSearchParams: () => [{}] }));
vi.mock('./company-detail', async () => {
  const { useParamNavigationCount, useUrlParams } = await import(
    '@core/component/ParamsProvider'
  );
  return {
    // Reads its linked message the way the Discussion does.
    Company: (props: { onOpenContact(contact: CrmContact): void }) => {
      const params = useUrlParams({ commentId: 'comment_id' });
      const navigations = useParamNavigationCount('comment_id');
      return (
        <>
          <p data-testid="linked-message">
            {`${params.commentId() ?? '-'}:${navigations()}`}
          </p>
          <button
            onClick={() =>
              props.onOpenContact({
                id: 'contact-1',
                companyId: 'company-1',
                name: 'Maya',
                email: 'maya@company.com',
                hidden: false,
                firstInteraction: '',
                lastInteraction: '',
                createdAt: '',
                updatedAt: '',
              })
            }
          >
            Open Maya
          </button>
        </>
      );
    },
  };
});
vi.mock('./contact-detail', () => ({
  Contact: (props: {
    contactId: string;
    onOpenCompany(companyId: string): boolean;
  }) => (
    <div>
      Contact content: {props.contactId}
      <button onClick={() => props.onOpenCompany('company-1')}>
        Open contact company
      </button>
    </div>
  ),
}));
afterEach(cleanup);

/** Stands in for the route: each open hands the detail a new trail. */
function renderDetail(record: CrmRecordRef, viewName: string) {
  const [records, setRecords] = createSignal<readonly CrmRecordRef[]>([record]);
  const [section, setSection] = createSignal<CrmRecordSection>();
  const [commentTarget, setCommentTarget] = createSignal<CrmCommentTarget>();
  const open = (trail: readonly CrmRecordRef[]) =>
    setRecords(trail.map((entry) => ({ ...entry })));
  const close = vi.fn(() => setRecords([]));
  const failed = vi.fn(() => <div>Navigation failed</div>);
  render(() => (
    <ErrorBoundary fallback={failed}>
      <Show
        when={records().length > 0}
        fallback={
          <button onClick={() => setRecords([record])}>
            Reopen {record.name}
          </button>
        }
      >
        <CrmRecordDetail
          records={records()}
          section={section()}
          commentTarget={commentTarget()}
          viewName={viewName}
          onOpen={open}
          onSectionChange={(next) => {
            setSection(next);
            open(records());
          }}
          onClose={close}
          navigation={null}
        />
      </Show>
    </ErrorBoundary>
  ));
  return { close, records, failed, setCommentTarget };
}

const crumbs = () =>
  within(screen.getByRole('navigation', { name: 'CRM record location' }))
    .getAllByRole('button')
    .map((button) => button.textContent);

it('removes contact breadcrumbs safely when returning to the company and reopening details', () => {
  const { failed } = renderDetail(
    { type: 'company', id: 'company-1', name: 'Northstar' },
    'Pipeline'
  );
  for (let round = 0; round < 2; round++) {
    fireEvent.click(screen.getByRole('button', { name: 'Open Maya' }));
    expect(crumbs()).toEqual(['Pipeline', 'Northstar', 'Maya']);
    expect(screen.getByText('Contact content: contact-1')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Northstar' }));
    expect(crumbs()).toEqual(['Pipeline', 'Northstar']);
    expect(screen.getByRole('button', { name: 'Open Maya' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Pipeline' }));
    expect(
      screen.queryByRole('navigation', { name: 'CRM record location' })
    ).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Reopen Northstar' }));
  }
  expect(failed).not.toHaveBeenCalled();
});

it('opens a People contact in place and follows its company without duplicating the trail', () => {
  const { close, records } = renderDetail(
    { type: 'contact', id: 'contact-1', name: 'Maya' },
    'People'
  );
  expect(crumbs()).toEqual(['People', 'Maya']);
  expect(screen.getByText('Contact content: contact-1')).toBeTruthy();

  fireEvent.click(screen.getByRole('button', { name: 'Open contact company' }));
  expect(crumbs()).toEqual(['People', 'Maya', 'Company']);
  expect(records().map((record) => record.id)).toEqual([
    'contact-1',
    'company-1',
  ]);

  // The company's contact is already in the trail, so opening it returns there.
  fireEvent.click(screen.getByRole('button', { name: 'Open Maya' }));
  expect(crumbs()).toEqual(['People', 'Maya']);

  fireEvent.click(screen.getByRole('button', { name: 'People' }));
  expect(close).toHaveBeenCalledOnce();
});

it('keeps the shown record mounted while the route only changes its tab', () => {
  renderDetail({ type: 'contact', id: 'contact-1', name: 'Maya' }, 'People');
  const content = screen.getByText('Contact content: contact-1');
  fireEvent.click(screen.getByRole('button', { name: 'Show emails' }));
  expect(screen.getByText('Contact content: contact-1')).toBe(content);
  expect(crumbs()).toEqual(['People', 'Maya']);
});

it('hands the Discussion each request for a linked message', () => {
  const { setCommentTarget } = renderDetail(
    { type: 'company', id: 'company-1', name: 'Northstar' },
    'Companies'
  );
  const linked = () => screen.getByTestId('linked-message').textContent;
  expect(linked()).toBe('-:0');
  setCommentTarget({ commentId: 'message-1', seek: 'first' });
  expect(linked()).toBe('message-1:1');
  // The same message asked for again scrolls again.
  setCommentTarget({ commentId: 'message-1', seek: 'second' });
  expect(linked()).toBe('message-1:2');
  // Leaving the target, as another tab of the record does, forgets it.
  setCommentTarget(undefined);
  expect(linked()).toBe('-:2');
});
