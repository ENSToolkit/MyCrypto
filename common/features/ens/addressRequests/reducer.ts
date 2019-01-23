import * as ensTypes from '../types';
import * as types from './types';

const REQUESTS_INITIAL_STATE: types.ENSAddressRequestsState = {};

const reverseResolveAddressRequested = (
  state: types.ENSAddressRequestsState,
  action: ensTypes.ReverseResolveAddressRequested
): types.ENSAddressRequestsState => {
  const { address } = action.payload;
  const nextAddress = {
    ...state[address],
    state: types.RequestStates.pending
  };

  return { ...state, [address]: nextAddress };
};

const reverseResolveAddressSuccess = (
  state: types.ENSAddressRequestsState,
  action: ensTypes.ReverseResolveAddressSucceeded
): types.ENSAddressRequestsState => {
  const { address, addressData } = action.payload;
  const nextAddress = {
    data: addressData,
    state: types.RequestStates.success
  };

  return { ...state, [address]: nextAddress };
};

const reverseResolveAddressCached = (
  state: types.ENSAddressRequestsState,
  action: ensTypes.ReverseResolveAddressCached
): types.ENSAddressRequestsState => {
  const { address } = action.payload;
  const nextAddress = {
    ...state[address],
    state: types.RequestStates.success
  };

  return { ...state, [address]: nextAddress };
};

const reverseResolveAddressFailed = (
  state: types.ENSAddressRequestsState,
  action: ensTypes.ReverseResolveAddressFailed
): types.ENSAddressRequestsState => {
  const { address, error } = action.payload;
  const nextAddress = {
    error: true,
    errorMsg: error.message,
    state: types.RequestStates.failed
  };

  return { ...state, [address]: nextAddress };
};

export function ensAddressRequestsReducer(
  state: types.ENSAddressRequestsState = REQUESTS_INITIAL_STATE,
  action: ensTypes.ReverseResolveAddressAction
): types.ENSAddressRequestsState {
  switch (action.type) {
    case ensTypes.ENSActions.REVERSE_RESOLVE_ADDRESS_REQUESTED:
      return reverseResolveAddressRequested(state, action);
    case ensTypes.ENSActions.REVERSE_RESOLVE_ADDRESS_SUCCEEDED:
      return reverseResolveAddressSuccess(state, action);
    case ensTypes.ENSActions.REVERSE_RESOLVE_ADDRESS_FAILED:
      return reverseResolveAddressFailed(state, action);
    case ensTypes.ENSActions.REVERSE_RESOLVE_ADDRESS_CACHED:
      return reverseResolveAddressCached(state, action);
    default:
      return state;
  }
}
