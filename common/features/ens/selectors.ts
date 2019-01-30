import { IOwnedDomainRequest, IBaseDomainRequest, IBaseSubdomainRequest } from 'libs/ens';
import { isCreationAddress } from 'libs/validators';
import { AppState } from 'features/reducers';
import { ensAddressRequestsTypes, ensAddressRequestsSelectors } from './addressRequests';
import { ensDomainRequestsTypes, ensDomainRequestsSelectors } from './domainRequests';
import { ensDomainSelectorSelectors } from './domainSelector';
import { getNetworkChainId } from 'features/config/selectors';
import { getENSTLDForChain, getENSAddressesForChain } from 'libs/ens/networkConfigs';
import { ensAddressSelectorSelectors } from './addressSelector';

const isOwned = (data: IBaseDomainRequest | IBaseSubdomainRequest): data is IOwnedDomainRequest => {
  return !!(data as IOwnedDomainRequest).ownerAddress;
};

export const getEns = (state: AppState) => state.ens;

export const getCurrentDomainData = (state: AppState) => {
  const currentDomain = ensDomainSelectorSelectors.getCurrentDomainName(state);
  const domainRequests = ensDomainRequestsSelectors.getDomainRequests(state);

  if (!currentDomain || !domainRequests[currentDomain] || domainRequests[currentDomain].error) {
    return null;
  }

  const domainData = domainRequests[currentDomain].data || null;

  return domainData;
};

export const getResolvedAddress = (state: AppState, noGenesisAddress: boolean = false) => {
  const data = getCurrentDomainData(state);
  if (!data) {
    return null;
  }

  if (isOwned(data)) {
    const { resolvedAddress } = data;
    if (noGenesisAddress) {
      return !isCreationAddress(resolvedAddress) ? resolvedAddress : null;
    }
    return data.resolvedAddress;
  }
  return null;
};

export const getResolvingDomain = (state: AppState) => {
  const currentDomain = ensDomainSelectorSelectors.getCurrentDomainName(state);
  const domainRequests = ensDomainRequestsSelectors.getDomainRequests(state);

  if (!currentDomain || !domainRequests[currentDomain]) {
    return null;
  }

  return domainRequests[currentDomain].state === ensDomainRequestsTypes.RequestStates.pending;
};

export const getENSTLD = (state: AppState) => {
  const chainId = getNetworkChainId(state);
  return getENSTLDForChain(chainId);
};

export const getENSAddresses = (state: AppState) => {
  const chainId = getNetworkChainId(state);
  return getENSAddressesForChain(chainId);
};

export const getCurrentAddressData = (state: AppState) => {
  const currentAddress = ensAddressSelectorSelectors.getCurrentAddress(state);
  const addressRequests = ensAddressRequestsSelectors.getAddressRequests(state);

  if (
    !currentAddress ||
    !addressRequests[currentAddress] ||
    addressRequests[currentAddress].error
  ) {
    return null;
  }

  const addressData = addressRequests[currentAddress].data || null;

  return addressData;
};

export const getResolvingAddress = (state: AppState) => {
  const currentAddress = ensAddressSelectorSelectors.getCurrentAddress(state);
  const addressRequests = ensAddressRequestsSelectors.getAddressRequests(state);

  if (
    !currentAddress ||
    !addressRequests[currentAddress] ||
    addressRequests[currentAddress].error
  ) {
    return null;
  }

  return addressRequests[currentAddress].state === ensAddressRequestsTypes.RequestStates.pending;
};
