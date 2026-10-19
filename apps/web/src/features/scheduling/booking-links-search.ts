import { z } from 'zod';

export const bookingLinksSearch = {
  namespace: 'scheduling',
  schema: z.object({
    tab: z.enum(['links', 'availability', 'bookings', 'insights', 'page']),
    owner: z.string(),
    createBookingLink: z.boolean().optional(),
  }),
  defaults: { tab: 'links' as const, owner: '', createBookingLink: false },
};

export type BookingLinksState = z.infer<typeof bookingLinksSearch.schema>;
