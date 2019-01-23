import { DomainRequest, AddressRequest } from 'libs/ens';
import * as types from './types';

export type TResolveDomainRequested = typeof resolveDomainRequested;
export const resolveDomainRequested = (
  domain: string,
  testnet?: boolean,
  refresh?: boolean
): types.ResolveDomainRequested => ({
  type: types.ENSActions.RESOLVE_DOMAIN_REQUESTED,
  payload: { domain, testnet, refresh }
});

export const resolveDomainCached = (
  payload: types.ResolveDomainCached['payload']
): types.ResolveDomainCached => ({
  type: types.ENSActions.RESOLVE_DOMAIN_CACHED,
  payload
});

export type TResolveDomainSucceeded = typeof resolveDomainSucceeded;
export const resolveDomainSucceeded = (
  domain: string,
  domainData: DomainRequest
): types.ResolveDomainSucceeded => ({
  type: types.ENSActions.RESOLVE_DOMAIN_SUCCEEDED,
  payload: { domain, domainData }
});

export type TResolveDomainFailed = typeof resolveDomainFailed;
export const resolveDomainFailed = (domain: string, error: Error): types.ResolveDomainFailed => ({
  type: types.ENSActions.RESOLVE_DOMAIN_FAILED,
  payload: { domain, error }
});

export type TReverseResolveAddressRequested = typeof reverseResolveAddressRequested;
export const reverseResolveAddressRequested = (
  address: string,
  refresh?: boolean
): types.ReverseResolveAddressRequested => ({
  type: types.ENSActions.REVERSE_RESOLVE_ADDRESS_REQUESTED,
  payload: { address, refresh }
});

export const reverseResolveAddressCached = (
  payload: types.ReverseResolveAddressCached['payload']
): types.ReverseResolveAddressCached => ({
  type: types.ENSActions.REVERSE_RESOLVE_ADDRESS_CACHED,
  payload
});

export type TReverseResolveAddressSucceeded = typeof reverseResolveAddressSucceeded;
export const reverseResolveAddressSucceeded = (
  address: string,
  addressData: AddressRequest
): types.ReverseResolveAddressSucceeded => ({
  type: types.ENSActions.REVERSE_RESOLVE_ADDRESS_SUCCEEDED,
  payload: { address, addressData }
});

export type TReverseResolveAddressFailed = typeof reverseResolveAddressFailed;
export const reverseResolveAddressFailed = (
  address: string,
  error: Error
): types.ReverseResolveAddressFailed => ({
  type: types.ENSActions.REVERSE_RESOLVE_ADDRESS_FAILED,
  payload: { address, error }
});
