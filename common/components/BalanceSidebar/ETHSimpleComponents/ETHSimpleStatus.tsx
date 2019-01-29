import React from 'react';
import { connect } from 'react-redux';

import { AppState } from 'features/reducers';
import { ensActions } from 'features/ens';
import { configSelectors } from 'features/config';
import { transactionFieldsSelectors } from 'features/transaction';
import { walletSelectors } from 'features/wallet';
import { Spinner } from 'components/ui';
import { translate } from 'translations';
const constants = require('./ETHSimpleConstants.json');

interface StateProps {
  etherBalance: AppState['wallet']['balance']['wei'];
  gasPrice: AppState['transaction']['fields']['gasPrice'];
  network: ReturnType<typeof configSelectors.getNetworkConfig>;
}

interface DispatchProps {
  resolveDomain: ensActions.TResolveDomainRequested;
}

interface OwnProps {
  isValidSubdomain: boolean;
  subdomain: string;
  insufficientEtherBalance: boolean;
  purchaseMode: boolean;
  pollInitiated: boolean;
  domainRequestIsComplete: boolean;
  domainIsAvailable: boolean;
  domainIsOwnedByCurrentAddress: boolean;
}

type Props = StateProps & DispatchProps & OwnProps;

class ETHSimpleStatusClass extends React.Component<Props> {
  public render() {
    const {
      isValidSubdomain,
      subdomain,
      insufficientEtherBalance,
      purchaseMode,
      pollInitiated,
      domainRequestIsComplete,
      domainIsAvailable,
      domainIsOwnedByCurrentAddress
    } = this.props;
    const subdomainEntered = subdomain.length > 0;
    const spinnerIcon = <Spinner />;
    const checkIcon = <i className="fa fa-check" />;
    const xIcon = <i className="fa fa-remove" />;
    const refreshIcon = <i className="fa fa-refresh" />;
    const divBaseClass = 'ETHSimple-status help-block is-';
    const validClass = divBaseClass + 'valid';
    const warningClass = divBaseClass + 'semivalid';
    const invalidClass = divBaseClass + 'invalid';
    const refreshButton = (
      <button className="ETHSimple-section-refresh" onClick={this.refreshDomainResolution}>
        {refreshIcon}
      </button>
    );
    const domainName = {
      $domain: subdomain + (subdomain.length > 25 ? ' ' : '') + constants.esFullDomain
    };
    let className = '';
    let icon = null;
    let label = null;
    let button = null;

    if (purchaseMode) {
      className = warningClass;
      icon = spinnerIcon;
      label = pollInitiated
        ? translate('ETHSIMPLE_STATUS_WAIT_FOR_MINE')
        : translate('ETHSIMPLE_STATUS_WAIT_FOR_CONFIRM');
    } else if (!isValidSubdomain) {
      className = invalidClass;
      label = translate('ENS_SUBDOMAIN_INVALID_INPUT');
    } else if (domainRequestIsComplete) {
      if (domainIsAvailable) {
        button = refreshButton;
        if (insufficientEtherBalance) {
          className = warningClass;
          label = translate('ETHSIMPLE_STATUS_INSUFFICIENT_FUNDS', domainName);
        } else {
          className = validClass;
          icon = checkIcon;
          label = translate('ETHSIMPLE_STATUS_AVAILABLE', domainName);
        }
      } else {
        if (domainIsOwnedByCurrentAddress) {
          className = validClass;
          label = translate('ETHSIMPLE_STATUS_OWNED_BY_USER', domainName);
        } else {
          className = invalidClass;
          icon = xIcon;
          label = translate('ETHSIMPLE_STATUS_UNAVAILABLE', domainName);
        }
      }
    } else if (subdomainEntered) {
      className = warningClass;
      icon = spinnerIcon;
      label = translate('ETHSIMPLE_STATUS_RESOLVING_DOMAIN', domainName);
    }
    return (
      <div className={className}>
        {icon}
        {label}
        {button}
      </div>
    );
  }

  /**
   *
   * @desc Refresh the resolution data for a recently registered domain name
   */
  private refreshDomainResolution = () => {
    const { resolveDomain, network, subdomain } = this.props;
    resolveDomain(subdomain + constants.esDomain, network.isTestnet, true);
  };
}

function mapStateToProps(state: AppState): StateProps {
  return {
    etherBalance: walletSelectors.getEtherBalance(state),
    gasPrice: transactionFieldsSelectors.getGasPrice(state),
    network: configSelectors.getNetworkConfig(state)
  };
}

const mapDispatchToProps: DispatchProps = {
  resolveDomain: ensActions.resolveDomainRequested
};

export default connect(mapStateToProps, mapDispatchToProps)(ETHSimpleStatusClass);
