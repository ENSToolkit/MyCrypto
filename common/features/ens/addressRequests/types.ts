import { AddressRequest } from 'libs/ens';

export enum RequestStates {
  pending = 'PENDING',
  success = 'SUCCESS',
  failed = 'FAILED'
}

export interface ENSAddressRequestsState {
  [key: string]: {
    state: RequestStates;
    data?: AddressRequest;
    error?: boolean;
    errorMsg?: string;
  };
}
