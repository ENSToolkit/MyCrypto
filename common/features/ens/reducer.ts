import { combineReducers } from 'redux';

import { ensDomainRequestsReducer } from './domainRequests';
import { ensDomainSelectorReducer } from './domainSelector';
import { ensAddressRequestsReducer } from './addressRequests';
import { ensAddressSelectorReducer } from './addressSelector';
import * as types from './types';

export const ensReducer = combineReducers<types.ENSState>({
  domainSelector: ensDomainSelectorReducer.ensDomainSelectorReducer,
  domainRequests: ensDomainRequestsReducer.ensDomainRequestsReducer,
  addressSelector: ensAddressSelectorReducer.ensAddressSelectorReducer,
  addressRequests: ensAddressRequestsReducer.ensAddressRequestsReducer
});
