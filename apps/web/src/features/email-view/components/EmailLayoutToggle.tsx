import { TabsInset } from '@core/component/TabsInset';
import { match } from 'ts-pattern';
import { useEmailView } from '../email-view-context';

/** Switches the desktop view between the Simple and Advanced layouts. */
export function EmailLayoutToggle() {
  const { layout, setLayout } = useEmailView();

  return (
    <TabsInset
      aria-label="Email layout"
      fullWidth
      class="h-auto"
      labelClass="py-1.5"
      list={[
        { value: 'simple', label: 'Simple' },
        { value: 'advanced', label: 'Advanced' },
      ]}
      value={layout()}
      onChange={(value) =>
        match(value)
          .with('simple', 'advanced', (next) => setLayout(next))
          .otherwise(() => undefined)
      }
    />
  );
}
