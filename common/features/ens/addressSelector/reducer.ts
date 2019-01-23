import * as ensTypes from '../types';
import * as types from './types';

const SELECTOR_INITIAL_STATE: types.ENSAddressSelectorState = {
  currentAddress: null
};

const setCurrentAddress = (
  state: types.ENSAddressSelectorState,
  action:
    | ensTypes.ReverseResolveAddressSucceeded
    | ensTypes.ReverseResolveAddressCached
    | ensTypes.ReverseResolveAddressRequested
): types.ENSAddressSelectorState => {
  const { address: address } = action.payload;
  return { ...state, currentAddress: address };
};

const clearCurrentAddress = (): types.ENSAddressSelectorState => {
  return { currentAddress: null };
};

export function ensAddressSelectorReducer(
  state: types.ENSAddressSelectorState = SELECTOR_INITIAL_STATE,
  action: ensTypes.EnsAction
): types.ENSAddressSelectorState {
  switch (action.type) {
    case ensTypes.ENSActions.REVERSE_RESOLVE_ADDRESS_CACHED:
    case ensTypes.ENSActions.REVERSE_RESOLVE_ADDRESS_REQUESTED:
    case ensTypes.ENSActions.REVERSE_RESOLVE_ADDRESS_SUCCEEDED:
      return setCurrentAddress(state, action);
    case ensTypes.ENSActions.REVERSE_RESOLVE_ADDRESS_FAILED:
      return clearCurrentAddress();
    default:
      return state;
  }
}
