import { DomainRequest, AddressRequest } from 'libs/ens';
import { ensDomainRequestsTypes } from './domainRequests';
import { ensAddressRequestsTypes } from './addressRequests';
import { ensDomainSelectorTypes } from './domainSelector';
import { ensAddressSelectorTypes } from './addressSelector';

export interface ENSState {
  domainRequests: ensDomainRequestsTypes.ENSDomainRequestsState;
  domainSelector: ensDomainSelectorTypes.ENSDomainSelectorState;
  addressRequests: ensAddressRequestsTypes.ENSAddressRequestsState;
  addressSelector: ensAddressSelectorTypes.ENSAddressSelectorState;
}

export enum ENSActions {
  RESOLVE_DOMAIN_REQUESTED = 'ENS_RESOLVE_DOMAIN_REQUESTED',
  RESOLVE_DOMAIN_SUCCEEDED = 'ENS_RESOLVE_DOMAIN_SUCCEEDED',
  RESOLVE_DOMAIN_FAILED = 'ENS_RESOLVE_DOMAIN_FAILED',
  RESOLVE_DOMAIN_CACHED = 'ENS_RESOLVE_DOMAIN_CACHED',
  REVERSE_RESOLVE_ADDRESS_REQUESTED = 'REVERSE_RESOLVE_ADDRESS_REQUESTED',
  REVERSE_RESOLVE_ADDRESS_SUCCEEDED = 'REVERSE_RESOLVE_ADDRESS_SUCCEEDED',
  REVERSE_RESOLVE_ADDRESS_FAILED = 'REVERSE_RESOLVE_ADDRESS_FAILED',
  REVERSE_RESOLVE_ADDRESS_CACHED = 'REVERSE_RESOLVE_ADDRESS_CACHED'
}

export interface ResolveDomainRequested {
  type: ENSActions.RESOLVE_DOMAIN_REQUESTED;
  payload: { domain: string; testnet?: boolean; refresh?: boolean };
}

export interface ResolveDomainSucceeded {
  type: ENSActions.RESOLVE_DOMAIN_SUCCEEDED;
  payload: { domain: string; domainData: DomainRequest };
}

export interface ResolveDomainCached {
  type: ENSActions.RESOLVE_DOMAIN_CACHED;
  payload: { domain: string };
}

export interface ResolveDomainFailed {
  type: ENSActions.RESOLVE_DOMAIN_FAILED;
  payload: { domain: string; error: Error };
}

export interface ReverseResolveAddressRequested {
  type: ENSActions.REVERSE_RESOLVE_ADDRESS_REQUESTED;
  payload: { address: string; refresh?: boolean };
}

export interface ReverseResolveAddressSucceeded {
  type: ENSActions.REVERSE_RESOLVE_ADDRESS_SUCCEEDED;
  payload: { address: string; addressData: AddressRequest };
}

export interface ReverseResolveAddressCached {
  type: ENSActions.REVERSE_RESOLVE_ADDRESS_CACHED;
  payload: { address: string };
}

export interface ReverseResolveAddressFailed {
  type: ENSActions.REVERSE_RESOLVE_ADDRESS_FAILED;
  payload: { address: string; error: Error };
}

export type ResolveDomainAction =
  | ResolveDomainRequested
  | ResolveDomainSucceeded
  | ResolveDomainFailed
  | ResolveDomainCached;

export type ReverseResolveAddressAction =
  | ReverseResolveAddressRequested
  | ReverseResolveAddressSucceeded
  | ReverseResolveAddressFailed
  | ReverseResolveAddressCached;

export type EnsAction = ResolveDomainAction | ReverseResolveAddressAction;
