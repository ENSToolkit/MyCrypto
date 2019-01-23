import { AppState } from 'features/reducers';

const getEns = (state: AppState) => state.ens;

export const getAddressRequests = (state: AppState) => getEns(state).addressRequests;
