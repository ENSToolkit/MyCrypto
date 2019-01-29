import React from 'react';
import { connect } from 'react-redux';

import { AppState } from 'features/reducers';
import { configSelectors } from 'features/config';
import { translate } from 'translations';
const constants = require('./ETHSimpleConstants.json');

interface StateProps {
  network: ReturnType<typeof configSelectors.getNetworkConfig>;
}

interface OwnProps {
  address: string;
  subdomain: string;
}

type Props = StateProps & OwnProps;

class ETHSimpleDescriptionClass extends React.Component<Props> {
  public render() {
    const { address, subdomain, network } = this.props;
    const { supportedNetworks, esFullDomain, placeholderDomain, defaultDescAddr } = constants;
    const domainName =
      (subdomain.length > 0 ? subdomain : placeholderDomain) +
      (subdomain.length > 25 ? ' ' : '') +
      esFullDomain;
    const displayAddr = address.length > 0 ? address : defaultDescAddr;
    const charCount = domainName.length;
    const cutoff =
      charCount < 19 ? 30 : charCount < 23 ? 20 : charCount < 27 ? 25 : charCount < 32 ? 20 : 17;
    const addr = displayAddr.substr(0, cutoff) + (cutoff < displayAddr.length ? '...' : '');
    const supportedNetwork = (supportedNetworks as string[]).includes(network.id);
    const descriptionText = supportedNetwork ? 'ETHSIMPLE_DESC' : 'ETHSIMPLE_UNSUPPORTED_NETWORK';
    const textVariables = supportedNetwork
      ? { $domain: domainName, $addr: addr }
      : { $network: network.id };
    return (
      <div className="ETHSimple-description">
        {translate(descriptionText, textVariables as any)}
      </div>
    );
  }
}

function mapStateToProps(state: AppState): StateProps {
  return {
    network: configSelectors.getNetworkConfig(state)
  };
}

export default connect(mapStateToProps)(ETHSimpleDescriptionClass);
