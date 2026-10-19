import { ViewSidebar } from '@app/components/view-shell';
import { CreateMenuItem } from '@app/components/view-shell/CreateMenuItem';
import { SidebarCreateAction } from '@app/components/view-shell/SidebarCreateAction';
import BuildingsIcon from '@icon/system/regular/buildings.svg';
import CaretDownIcon from '@icon/system/regular/caret-down.svg';
import PlusIcon from '@icon/system/regular/plus.svg';
import TableIcon from '@icon/system/regular/table.svg';
import UserIcon from '@icon/system/regular/user.svg';
import { Dropdown } from '@ui';
import { Show } from 'solid-js';

/** Create actions for every CRM record type. */
export function CrmCreateMenu(props: {
  presentation?: 'sidebar' | 'toolbar';
  record?: 'company' | 'contact';
  onCreateCompany(): void;
  onCreateContact(): void;
  /** Omitted while pipelines are unavailable to the viewer. */
  pipeline?: { disabled: boolean; onCreate(): void };
}) {
  return (
    <Dropdown placement="bottom-start">
      <Show
        when={props.presentation === 'toolbar'}
        fallback={
          <Dropdown.Trigger
            as={ViewSidebar.Action}
            aria-label="Create CRM record"
          >
            <ViewSidebar.Icon>
              <PlusIcon class="size-4" />
            </ViewSidebar.Icon>
            <span class="truncate">New</span>
            <ViewSidebar.Trailing>
              <CaretDownIcon class="size-3 shrink-0" />
            </ViewSidebar.Trailing>
          </Dropdown.Trigger>
        }
      >
        <Dropdown.Trigger
          as={SidebarCreateAction}
          aria-label="Create CRM record"
        >
          <span>New</span>
          <CaretDownIcon aria-hidden="true" class="size-3 shrink-0" />
        </Dropdown.Trigger>
      </Show>
      <Dropdown.Content class="w-80 max-w-[calc(100vw-2rem)]">
        <Dropdown.Group>
          <CreateMenuItem
            icon={BuildingsIcon}
            title="Company"
            description="Track an organization, its people, and your relationship with it."
            onSelect={props.onCreateCompany}
          />
          <CreateMenuItem
            icon={UserIcon}
            title="Contact"
            description="Keep a person's details and activity connected to their company."
            onSelect={props.onCreateContact}
          />
          <Show when={props.pipeline}>
            {(pipeline) => (
              <CreateMenuItem
                icon={TableIcon}
                title="Pipeline"
                description="Move records through stages to track deals or another repeatable process."
                disabled={pipeline().disabled}
                onSelect={() => pipeline().onCreate()}
              />
            )}
          </Show>
        </Dropdown.Group>
      </Dropdown.Content>
    </Dropdown>
  );
}
