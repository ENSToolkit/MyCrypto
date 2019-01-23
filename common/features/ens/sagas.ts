import { SagaIterator, delay, buffers } from 'redux-saga';
import { call, put, select, all, actionChannel, take, fork, race } from 'redux-saga/effects';

import { INode } from 'libs/nodes/INode';
import { IBaseDomainRequest, IBaseSubdomainRequest, IBaseAddressRequest } from 'libs/ens';
import * as configNodesSelectors from 'features/config/nodes/selectors';
import { notificationsActions } from 'features/notifications';
import { ensDomainSelectorSelectors } from './domainSelector';
import { ensAddressSelectorSelectors } from './addressSelector';
import * as types from './types';
import * as actions from './actions';
import * as selectors from './selectors';
import * as helpers from './helpers';

function* shouldResolveDomain(domain: string) {
  const currentDomainName = yield select(ensDomainSelectorSelectors.getCurrentDomainName);
  if (currentDomainName === domain) {
    const currentDomainData = yield select(selectors.getCurrentDomainData);
    if (currentDomainData) {
      return false;
    }
  }
  return true;
}

function* resolveDomain(): SagaIterator {
  const requestChan = yield actionChannel(
    types.ENSActions.RESOLVE_DOMAIN_REQUESTED,
    buffers.sliding(1)
  );

  while (true) {
    const { payload }: types.ResolveDomainRequested = yield take(requestChan);

    const { domain, testnet, refresh } = payload;

    try {
      if (!refresh) {
        const shouldResolve = yield call(shouldResolveDomain, domain);

        if (!shouldResolve) {
          yield put(actions.resolveDomainCached({ domain }));
          continue;
        }
      }

      const node: INode = yield select(configNodesSelectors.getNodeLib);

      const result: {
        domainData: IBaseDomainRequest | IBaseSubdomainRequest;
        error: any;
      } = yield race({
        domainData: call(helpers.resolveDomainRequest, domain, testnet, node),
        err: call(delay, 10000)
      });

      const { domainData } = result;

      if (!domainData) {
        throw Error();
      }
      const domainSuccessAction = actions.resolveDomainSucceeded(domain, domainData);
      yield put(domainSuccessAction);
    } catch (e) {
      const domainFailAction = actions.resolveDomainFailed(domain, e);
      yield put(domainFailAction);
      yield put(
        notificationsActions.showNotification(
          'danger',
          e.message || 'Could not resolve ENS address',
          5000
        )
      );
    }
  }
}

function* shouldResolveAddress(address: string) {
  const currentAddress = yield select(ensAddressSelectorSelectors.getCurrentAddress);
  if (currentAddress === address) {
    const currentAddressData = yield select(selectors.getCurrentAddressData);
    if (currentAddressData) {
      return false;
    }
  }
  return true;
}

function* reverseResolveAddress(): SagaIterator {
  const requestChan = yield actionChannel(
    types.ENSActions.REVERSE_RESOLVE_ADDRESS_REQUESTED,
    buffers.sliding(1)
  );

  while (true) {
    const { payload }: types.ReverseResolveAddressRequested = yield take(requestChan);

    const { address, refresh } = payload;

    try {
      if (!refresh) {
        const shouldResolve = yield call(shouldResolveAddress, address);

        if (!shouldResolve) {
          yield put(actions.reverseResolveAddressCached({ address }));
          continue;
        }
      }

      const node: INode = yield select(configNodesSelectors.getNodeLib);

      const result: {
        addressData: IBaseAddressRequest;
        error: any;
      } = yield race({
        addressData: call(helpers.reverseResolveAddressRequest, address, node),
        err: call(delay, 10000)
      });

      const { addressData } = result;

      if (!addressData) {
        throw Error();
      }
      const addressSuccessAction = actions.reverseResolveAddressSucceeded(address, addressData);
      yield put(addressSuccessAction);
    } catch (e) {
      const addressFailAction = actions.reverseResolveAddressFailed(address, e);
      yield put(addressFailAction);
      yield put(
        notificationsActions.showNotification(
          'danger',
          e.message || 'Could not reverse resolve account address',
          5000
        )
      );
    }
  }
}

export function* ensSaga(): SagaIterator {
  yield all([fork(resolveDomain)]), yield all([fork(reverseResolveAddress)]);
}
