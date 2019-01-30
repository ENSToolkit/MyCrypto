import React from 'react';
import { connect } from 'react-redux';
import BN from 'bn.js';

import { AppState } from 'features/reducers';
import { walletSelectors } from 'features/wallet';
import { gasSelectors } from 'features/gas';
import { Spinner } from 'components/ui';
import { translate, translateRaw } from 'translations';
import { gasPriceToBase, handleValues } from 'libs/units';

interface StateProps {
  etherBalance: AppState['wallet']['balance']['wei'];
  gasEstimates: AppState['gas']['estimates'];
}

interface OwnProps {
  editingPublicName: boolean;
  publicNameExists: boolean;
  publicNameError: boolean;
  setNameMode: boolean;
  showPurchase: boolean;
  setNameGasLimit: BN;
  startEditingPublicName(): void;
  stopEditingPublicName(): void;
}

type Props = StateProps & OwnProps;

class AccountPublicNameButtonClass extends React.Component<Props> {
  public render() {
    const {
      editingPublicName,
      publicNameExists,
      publicNameError,
      setNameMode,
      showPurchase,
      stopEditingPublicName,
      startEditingPublicName
    } = this.props;
    const publicNameButton = editingPublicName ? (
      publicNameError ? null : (
        <React.Fragment>
          <i className="fa fa-save" />
          <span
            role="button"
            title={translateRaw('SAVE_PUBLIC_NAME')}
            onClick={stopEditingPublicName}
          >
            {translate('SAVE_PUBLIC_NAME')}
          </span>
        </React.Fragment>
      )
    ) : setNameMode ? (
      <React.Fragment>
        <div className="fa">
          <Spinner />
        </div>
        <span title={translateRaw('ENS_PUBLIC_NAME_TX_WAIT')}>
          {translate('ENS_PUBLIC_NAME_TX_WAIT')}
        </span>
      </React.Fragment>
    ) : this.insufficientEtherBalance() ? null : showPurchase ? (
      <React.Fragment>
        <i className="fa fa-upload" />
        <span
          role="button"
          title={translateRaw('SET_PUBLIC_NAME')}
          onClick={startEditingPublicName}
        >
          {translateRaw('SET_PUBLIC_NAME')}
        </span>
      </React.Fragment>
    ) : publicNameExists ? (
      <React.Fragment>
        <i className="fa fa-pencil" />
        <span
          role="button"
          title={translateRaw('EDIT_PUBLIC_NAME')}
          onClick={startEditingPublicName}
        >
          {translate('EDIT_PUBLIC_NAME')}
        </span>
      </React.Fragment>
    ) : (
      <React.Fragment>
        <i className="fa fa-upload" />
        <span
          role="button"
          title={translateRaw('ADD_PUBLIC_NAME')}
          onClick={startEditingPublicName}
        >
          {translate('ADD_PUBLIC_NAME')}
        </span>
      </React.Fragment>
    );

    return (
      <div className="AccountInfo-public-name-button" title={translateRaw('EDIT_PUBLIC_NAME')}>
        {publicNameButton}
      </div>
    );
  }

  /**
   *
   * @desc Calculates the cost of the setName transaction and compares that to the available
   * balance in the user's wallet. Returns true if the balance is insufficient to make the purchase
   * @returns {boolean}
   */
  private insufficientEtherBalance = (): boolean => {
    const { gasEstimates, etherBalance } = this.props;
    const txCost = gasPriceToBase(!!gasEstimates ? gasEstimates.fast : 20).mul(
      handleValues(this.props.setNameGasLimit)
    );
    return !!etherBalance && txCost.gt(etherBalance);
  };
}

function mapStateToProps(state: AppState): StateProps {
  return {
    etherBalance: walletSelectors.getEtherBalance(state),
    gasEstimates: gasSelectors.getEstimates(state)
  };
}

export default connect(mapStateToProps)(AccountPublicNameButtonClass);
