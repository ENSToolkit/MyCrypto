import React from 'react';
import { connect } from 'react-redux';

import { AppState } from 'features/reducers';
import { ensActions } from 'features/ens';
import { configSelectors } from 'features/config';
import { transactionFieldsActions } from 'features/transaction';
import { normalise } from 'libs/ens';
import { isValidENSName } from 'libs/validators';
import { Input } from 'components/ui';
const constants = require('./ETHSimpleConstants.json');

interface StateProps {
  network: ReturnType<typeof configSelectors.getNetworkConfig>;
}

interface DispatchProps {
  resolveDomain: ensActions.TResolveDomainRequested;
  resetTx: transactionFieldsActions.TResetTransactionRequested;
}

interface OwnProps {
  address: string;
  subdomainChanged(enteredSubdomain: string, subdomain: string): void;
  purchaseSubdomain(ev: React.FormEvent<HTMLElement>): void;
}

type Props = StateProps & DispatchProps & OwnProps;

interface State {
  enteredSubdomain: string;
  subdomain: string;
  lastKeystrokeTime: number;
  resolutionDelay: number;
}

class ETHSimpleSubdomainInputClass extends React.Component<Props, State> {
  public state = {
    enteredSubdomain: '',
    subdomain: '',
    lastKeystrokeTime: Date.now(),
    resolutionDelay: 500
  };

  public render() {
    return (
      <form className="ETHSimpleInput" onSubmit={this.props.purchaseSubdomain}>
        <div className="input-group-wrapper">
          <label className="input-group input-group-inline">
            <Input
              className="ETHSimple-name ETHSimple-name-input border-rad-right-0"
              value={this.state.enteredSubdomain}
              isValid={true}
              type="text"
              placeholder={constants.placeholderDomain}
              spellCheck={false}
              onChange={this.onChange}
            />
            <span className="ETHSimple-name input-group-addon">{constants.esFullDomain}</span>
          </label>
        </div>
      </form>
    );
  }

  /**
   *
   * @desc Called on changes to the subdomain input field. Checks the validity of
   * the entered subdomain, sets purchaseMode to false, and records the time of
   * the keystroke. On the setState callback it calls the keystroke handler
   */
  private onChange = (event: React.FormEvent<HTMLInputElement>) => {
    const { subdomainChanged, resetTx } = this.props;
    const enteredSubdomain = event.currentTarget.value.trim().toLowerCase();
    const subdomain = isValidENSName(enteredSubdomain + constants.esDomain)
      ? normalise(enteredSubdomain)
      : '';
    subdomainChanged(enteredSubdomain, subdomain);
    this.setState(
      {
        enteredSubdomain,
        subdomain,
        lastKeystrokeTime: Date.now()
      },
      () => {
        subdomain.length > 0
          ? setTimeout(this.processKeystroke, this.state.resolutionDelay)
          : resetTx();
      }
    );
  };

  /**
   *
   * @desc Called on a delay after a keystroke is recorded in onChange(). This
   * function checks if a more recent keystroke has occurred before requesting an
   * ENS lookup in order to reduce superfluous calls
   */
  private processKeystroke = () => {
    const { resolveDomain, network } = this.props;
    const { lastKeystrokeTime, resolutionDelay, subdomain } = this.state;
    if (lastKeystrokeTime < Date.now() - resolutionDelay && subdomain.length > 0) {
      resolveDomain(subdomain + constants.esDomain, network.isTestnet);
    }
  };
}

function mapStateToProps(state: AppState): StateProps {
  return {
    network: configSelectors.getNetworkConfig(state)
  };
}

const mapDispatchToProps: DispatchProps = {
  resolveDomain: ensActions.resolveDomainRequested,
  resetTx: transactionFieldsActions.resetTransactionRequested
};

export default connect(mapStateToProps, mapDispatchToProps)(ETHSimpleSubdomainInputClass);
