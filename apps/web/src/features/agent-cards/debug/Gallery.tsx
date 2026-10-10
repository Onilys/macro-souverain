/**
 * Debug gallery for agent message cards: every card kind in each of its
 * states, from fixture data, in the current theme. Mounted at
 * `/component/agent-cards`. Switch the app theme to check light and dark.
 */

import {
  ActivityRows,
  RunSummary,
} from '@app/features/agent-activity/components/activity-rows';
import { EntityIcon } from '@core/component/EntityIcon';
import { createSignal, For, type JSX, type ParentProps } from 'solid-js';
import { AgendaView } from '../components/agenda';
import { EventCardView } from '../components/event-card';
import {
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  CardHiddenCount,
} from '../components/kit/card';
import { CardRow, SkeletonSingle, Tile } from '../components/kit/parts';
import { ReferenceCardView } from '../components/reference-card';

const noop = () => {};

function Section(props: ParentProps<{ title: string; note?: string }>) {
  return (
    <section class="flex flex-col gap-4">
      <div class="flex items-baseline gap-3 border-b border-edge-muted pb-2">
        <h2 class="text-lg font-semibold text-ink">{props.title}</h2>
        <span class="text-xs text-ink-subtle">{props.note}</span>
      </div>
      <div class="grid grid-cols-1 gap-x-8 gap-y-6 xl:grid-cols-2">
        {props.children}
      </div>
    </section>
  );
}

function Example(props: ParentProps<{ label: string }>) {
  return (
    <div class="flex min-w-0 flex-col gap-2">
      <div class="text-[11px] font-semibold tracking-wide text-ink-subtle uppercase">
        {props.label}
      </div>
      <div class="flex min-w-0 flex-col gap-2">{props.children}</div>
    </div>
  );
}

function icon(type: string): JSX.Element {
  return (
    <Tile>
      <EntityIcon targetType={type as 'md'} size="sm" />
    </Tile>
  );
}

const day = (offset: number) => {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return date;
};

const FILES = [
  ['Q4 launch plan', 'md', '2h ago'],
  ['Revenue by region FY26', 'spreadsheet', 'Yesterday'],
  ['Pricing review notes', 'md', 'Mon'],
  ['Vendor MSA (signed).pdf', 'pdf', 'Oct 2'],
  ['Onboarding flow', 'canvas', 'Sep 30'],
  ['churn_model.py', 'code', 'Sep 28'],
  ['Board update, September.docx', 'write', 'Sep 26'],
  ['Customer interviews', 'md', 'Sep 22'],
  ['Hiring plan 2027', 'spreadsheet', 'Sep 19'],
] as const;

function FixedHeightDemo() {
  const [height, setHeight] = createSignal<'auto' | 160 | 240 | 320>(240);
  return (
    <Example label="Fixed height: header and footer pin, the body fades">
      <div class="flex gap-1">
        <For each={['auto', 160, 240, 320] as const}>
          {(option) => (
            <button
              type="button"
              class="rounded-full px-2.5 py-0.5 text-xs text-ink-muted data-[on=true]:bg-active data-[on=true]:text-ink"
              data-on={height() === option}
              onClick={() => setHeight(option)}
            >
              {option === 'auto' ? 'Auto' : `Fixed ${option}`}
            </button>
          )}
        </For>
      </div>
      {/* Keyed on the height so each choice starts from a fresh card. */}
      <For each={[height()]}>
        {(fixed) => (
          <Card width="standard" height={fixed}>
            <CardHeader
              center
              tile={
                <Tile size={32}>
                  <EntityIcon targetType="files" size="sm" />
                </Tile>
              }
              title="Files touched this week"
              subtitle={`${FILES.length} files · last 7 days`}
            />
            <CardBody tight>
              <For each={FILES}>
                {([name, type, when]) => (
                  <CardRow onClick={noop}>
                    <EntityIcon targetType={type as 'md'} size="xs" />
                    <span class="min-w-0 flex-1 truncate text-sm">{name}</span>
                    <span class="text-xs text-ink-subtle tabular-nums">
                      {when}
                    </span>
                  </CardRow>
                )}
              </For>
            </CardBody>
            <CardFooter small>
              <CardHiddenCount total={FILES.length} noun="files" />
            </CardFooter>
          </Card>
        )}
      </For>
    </Example>
  );
}

export default function AgentCardsGallery() {
  return (
    <div class="h-full overflow-y-auto bg-page">
      <div class="mx-auto flex max-w-6xl flex-col gap-12 px-8 py-10">
        <header class="flex flex-col gap-2">
          <div class="text-xs font-semibold tracking-wide text-accent uppercase">
            Agent DMs · card system
          </div>
          <h1 class="text-2xl font-semibold text-ink">Agent message cards</h1>
          <p class="max-w-3xl text-sm text-ink-muted">
            Every card an agent can put in a conversation, from fixture data, in
            the current theme. Switch the theme to check light and dark.
          </p>
        </header>

        <Section title="Anatomy" note="One shell, two heights">
          <FixedHeightDemo />
          <Example label="States: loading, ready, no access, deleted">
            <Card width="compact" height={72}>
              <SkeletonSingle />
            </Card>
            <ReferenceCardView
              tile={icon('md')}
              title="Q4 launch plan"
              badge={{ label: 'Edited', tone: 'accent' }}
              meta="Document · Updated 2m ago"
              onOpen={noop}
            />
            <ReferenceCardView
              tile={icon('md')}
              title="Board deck draft"
              meta="Document · You don't have access"
              muted
            />
            <ReferenceCardView
              tile={icon('md')}
              title="Old pricing notes"
              meta="Document · Deleted"
              muted
              deleted
            />
          </Example>
        </Section>

        <Section title="Reference" note="One item the agent points at">
          <Example label="Cards · fixed 72">
            <ReferenceCardView
              tile={icon('md')}
              title="Q4 pricing proposal"
              meta="Document · Updated 2h ago"
              onOpen={noop}
            />
            <ReferenceCardView
              tile={icon('email')}
              title="Re: Q4 pricing"
              meta="Email · Ana Ruiz · Oct 8"
              onOpen={noop}
            />
            <EventCardView
              day={day(5)}
              title="Design crit: onboarding v3"
              meta="Thu 2:00 – 2:45 PM · 6 guests"
              onOpen={noop}
            />
            <ReferenceCardView
              tile={icon('project')}
              title="Q4 launch"
              meta="Project · Updated yesterday"
              onOpen={noop}
            />
            <ReferenceCardView
              tile={icon('channel')}
              title="#pricing"
              meta="Channel · 38 members"
              onOpen={noop}
            />
          </Example>
        </Section>

        <Section title="Receipt" note="What the agent did, so you can open it">
          <Example label="Single items · fixed 72">
            <ReferenceCardView
              tile={icon('md')}
              title="Q4 review outline"
              badge={{ label: 'Created', tone: 'accent' }}
              meta="Document · in Q4 launch"
              onOpen={noop}
            />
            <ReferenceCardView
              tile={icon('spreadsheet')}
              title="Revenue by region FY26"
              badge={{ label: 'Edited', tone: 'accent' }}
              meta="Spreadsheet · 12 cells in EMEA"
              onOpen={noop}
            />
            <ReferenceCardView
              tile={icon('email')}
              title="Re: Q4 pricing proposal"
              badge={{ label: 'Sent', tone: 'accent' }}
              meta="Email · to Ana Ruiz"
              onOpen={noop}
            />
            <EventCardView
              day={day(5)}
              title="Design crit: onboarding v3"
              badge={{ label: 'Scheduled', tone: 'accent' }}
              meta="Thu 2:00 – 2:45 PM · 6 guests"
              onOpen={noop}
            />
          </Example>
          <Example label="More actions">
            <ReferenceCardView
              tile={icon('channel')}
              title="#pricing"
              badge={{ label: 'Posted', tone: 'accent' }}
              meta="Channel · Pricing review moves to Thu 10:00"
              onOpen={noop}
            />
            <ReferenceCardView
              tile={icon('md')}
              title="Q4 pricing proposal"
              badge={{ label: 'Moved', tone: 'accent' }}
              meta="Document · to Q4 launch"
              onOpen={noop}
            />
            <ReferenceCardView
              tile={icon('routine')}
              title="Weekly pipeline digest"
              badge={{ label: 'Created', tone: 'accent' }}
              meta="Routine · Mondays at 8:00 AM"
              onOpen={noop}
            />
            <EventCardView
              day={day(2)}
              title="Vendor sync"
              badge={{ label: 'Canceled', tone: 'neutral' }}
              meta="Tue 11:00 – 11:30 AM"
              canceled
            />
          </Example>
        </Section>

        <Section title="Agenda" note="Events by day, live from the calendar">
          <Example label="Agenda, with the present and a clash">
            <AgendaView
              title="Today and tomorrow"
              state="ready"
              now={new Date()}
              days={[
                {
                  heading: 'Today',
                  now: 2,
                  rows: [
                    {
                      key: '1',
                      title: 'Standup',
                      time: '9:30 – 9:45 AM',
                      past: true,
                      onOpen: noop,
                    },
                    {
                      key: '2',
                      title: 'Pricing review',
                      time: '11:00 AM – 12:00 PM',
                      past: true,
                      detail: 'Maya, Leo +2',
                      onOpen: noop,
                    },
                    {
                      key: '3',
                      title: 'Globex check-in',
                      time: '2:30 – 3:15 PM',
                      past: false,
                      clash: 'Overlaps Hiring sync by 15 min',
                      onOpen: noop,
                    },
                    {
                      key: '4',
                      title: 'Hiring sync',
                      time: '3:00 – 3:30 PM',
                      past: false,
                      clash: 'Overlaps Globex check-in by 15 min',
                      onOpen: noop,
                    },
                  ],
                },
                {
                  heading: 'Tomorrow',
                  rows: [
                    {
                      key: '5',
                      title: 'Design crit: onboarding v3',
                      time: '10:00 – 10:45 AM',
                      past: false,
                      detail: '6 guests · Google Meet',
                      onOpen: noop,
                    },
                  ],
                },
              ]}
            />
          </Example>
          <Example label="Loading">
            <AgendaView title="Today" state="loading" days={[]} />
          </Example>
        </Section>

        <Section
          title="Activity"
          note="Steps live, then one line once the answer arrives"
        >
          <Example label="Live, with a card under the step that made it">
            <ActivityRows
              rows={[
                {
                  id: 'a',
                  label: 'Searched email',
                  detail: 'Globex',
                  status: 'completed',
                },
                {
                  id: 'b',
                  label: 'Read',
                  detail: 'Q4 pricing proposal',
                  status: 'completed',
                },
                {
                  id: 'c',
                  label: 'Created',
                  detail: 'Globex pricing summary',
                  status: 'completed',
                },
                {
                  id: 'd',
                  label: 'Comparing',
                  detail: 'Revenue by region FY26',
                  status: 'running',
                },
              ]}
              after={(row) =>
                row.id === 'c' ? (
                  <div class="my-1.5">
                    <ReferenceCardView
                      tile={icon('md')}
                      title="Globex pricing summary"
                      badge={{ label: 'Created', tone: 'accent' }}
                      meta="Document · just now"
                      onOpen={noop}
                    />
                  </div>
                ) : undefined
              }
            />
          </Example>
          <Example label="Done, folded into one line">
            <RunSummary
              steps={6}
              duration="1m 12s"
              open={false}
              onToggle={noop}
            />
            <ReferenceCardView
              tile={icon('md')}
              title="Globex pricing summary"
              badge={{ label: 'Created', tone: 'accent' }}
              meta="Document · just now"
              onOpen={noop}
            />
          </Example>
          <Example label="A failed step keeps the run open">
            <ActivityRows
              rows={[
                {
                  id: 'a',
                  label: 'Searched',
                  detail: 'Salesforce',
                  status: 'failed',
                },
                {
                  id: 'b',
                  label: 'Posted summary in',
                  detail: '#sales',
                  status: 'interrupted',
                },
              ]}
            />
          </Example>
        </Section>
      </div>
    </div>
  );
}
