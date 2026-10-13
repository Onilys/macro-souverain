import { fetchCompany, fetchContact } from '@queries/storage/requests';
import {
  fetchCrmContactPreviews as fetchContacts,
  fetchCrmCompanyPreviews as fetchPreviews,
} from './queries/previews';
export function fetchCrmCompanyPreviews(ids: string[]) {
  return fetchPreviews(fetchCompany, ids);
}

export function fetchCrmContactPreviews(ids: string[]) {
  return fetchContacts(fetchContact, ids);
}
