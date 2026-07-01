import type { JSX } from 'react';
import type { SearchPayload } from '../resultTypes';
import { LinkCards } from '../../../components/LinkCards';

export function SearchCard({ payload }: { payload: SearchPayload }): JSX.Element {
  return <LinkCards links={payload.results} />;
}
export default SearchCard;
