import { AppState } from 'features/reducers';

const getEns = (state: AppState) => state.ens;

export const getCurrentAddress = (state: AppState) => getEns(state).addressSelector.currentAddress;
