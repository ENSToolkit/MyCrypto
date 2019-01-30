import React from 'react';
import { connect, MapStateToProps } from 'react-redux';
import { CopyToClipboard } from 'react-copy-to-clipboard';
import { bufferToHex, unpad, addHexPrefix } from 'ethereumjs-util';
import EthTx from 'ethereumjs-tx';
import BN from 'bn.js';

import { TransactionReceipt } from 'types/transactions';
import translate, { translateRaw } from 'translations';
import { notificationsActions } from 'features/notifications';
import * as derivedSelectors from 'features/selectors';
import { AppState } from 'features/reducers';
import { gasSelectors } from 'features/gas';
import {
  addressBookConstants,
  addressBookActions,
  addressBookSelectors
} from 'features/addressBook';
import {
  transactionSelectors,
  transactionFieldsActions,
  transactionNetworkActions,
  transactionNetworkSelectors,
  transactionSignSelectors,
  transactionSignActions,
  transactionBroadcastTypes
} from 'features/transaction';
import { transactionNetworkTypes } from 'features/transaction/network';
import { transactionsActions, transactionsSelectors } from 'features/transactions';
import { configSelectors, configMetaActions } from 'features/config';
import { configMetaSelectors } from 'features/config/meta';
import { ensActions, ensSelectors, ensAddressRequestsTypes } from 'features/ens';
import { walletSelectors, walletActions } from 'features/wallet';
import { IBaseAddressRequest } from 'libs/ens';
import ENS from 'libs/ens/contracts';
import Contract from 'libs/contracts';
import networkConfigs from 'libs/ens/networkConfigs';
import { Wei, fromWei, Address as Addr, gasPriceToBase, handleValues } from 'libs/units';
import { getTransactionFields } from 'libs/transaction/utils/ether';
import { Address, Identicon, Input, Spinner } from 'components/ui';
import { ConfirmationModal } from 'components/ConfirmationModal';

interface StateProps {
  entry: ReturnType<typeof addressBookSelectors.getAccountAddressEntry>;
  addressRequests: AppState['ens']['addressRequests'];
  networkConfig: ReturnType<typeof configSelectors.getNetworkConfig>;
  addressLabel: string;
  nonceStatus: AppState['transaction']['network']['getNonceStatus'];
  gasEstimation: AppState['transaction']['network']['gasEstimationStatus'];
  txDatas: AppState['transactions']['txData'];
  txBroadcasted: boolean | null;
  signaturePending: AppState['transaction']['sign']['pending'];
  signedTx: boolean;
  isFullTransaction: boolean;
  currentTxStatus: false | transactionBroadcastTypes.ITransactionStatus | null;
  transaction: EthTx;
  autoGasLimit: AppState['config']['meta']['autoGasLimit'];
  notifications: AppState['notifications'];
  etherBalance: AppState['wallet']['balance']['wei'];
  gasEstimates: AppState['gas']['estimates'];
}

interface DispatchProps {
  reverseResolve: ensActions.TReverseResolveAddressRequested;
  changeAddressLabelEntry: addressBookActions.TChangeAddressLabelEntry;
  saveAddressLabelEntry: addressBookActions.TSaveAddressLabelEntry;
  removeAddressLabelEntry: addressBookActions.TRemoveAddressLabelEntry;
  setToField: transactionFieldsActions.TSetToField;
  setValueField: transactionFieldsActions.TSetValueField;
  inputData: transactionFieldsActions.TInputData;
  inputGasLimit: transactionFieldsActions.TInputGasLimit;
  inputGasPrice: transactionFieldsActions.TInputGasPrice;
  getNonce: transactionNetworkActions.TGetNonceRequested;
  signTx: transactionSignActions.TSignTransactionRequested;
  toggleAutoGasLimit: configMetaActions.TToggleAutoGasLimit;
  showNotification: notificationsActions.TShowNotification;
  closeNotification: notificationsActions.TCloseNotification;
  fetchTxData: transactionsActions.TFetchTransactionData;
  refreshBalance: walletActions.TRefreshAccountBalance;
}

interface OwnProps {
  address: string;
  purchasedSubdomainLabel: string | null;
}

type Props = StateProps & DispatchProps & OwnProps;

interface State {
  copied: boolean;
  editingLabel: boolean;
  editingPublicName: boolean;
  labelInputTouched: boolean;
  publicNameInputTouched: boolean;
  publicNameExists: boolean;
  publicName: string;
  publicNameError: boolean;
  temporaryPublicName: string;
  reverseRegistrarInstance: Contract;
  showModal: boolean;
  setNameMode: boolean;
  pollInitiated: boolean;
  pollTimeout: boolean;
  broadcastedHash: string;
  isComplete: boolean;
  showPurchase: boolean;
  setNameGasLimit: BN;
}

class AccountAddress extends React.Component<Props, State> {
  public state = {
    copied: false,
    editingLabel: false,
    editingPublicName: false,
    labelInputTouched: false,
    publicNameInputTouched: false,
    publicNameExists: false,
    publicName: '',
    publicNameError: false,
    temporaryPublicName: '',
    reverseRegistrarInstance: ENS.reverse,
    showModal: false,
    setNameMode: false,
    pollInitiated: false,
    pollTimeout: false,
    broadcastedHash: '',
    isComplete: false,
    showPurchase: false,
    setNameGasLimit: new BN('105875')
  };

  private goingToClearCopied: number | null = null;

  private labelInput: HTMLInputElement | null = null;

  private publicNameInput: HTMLInputElement | null = null;

  public handleCopy = () =>
    this.setState(
      (prevState: State) => ({
        copied: !prevState.copied
      }),
      this.clearCopied
    );

  public componentWillUnmount() {
    if (this.goingToClearCopied) {
      window.clearTimeout(this.goingToClearCopied);
    }
  }

  public componentDidUpdate(prevProps: Props) {
    const {
      address,
      networkConfig,
      reverseResolve,
      addressRequests,
      currentTxStatus,
      txDatas,
      purchasedSubdomainLabel
    } = this.props;
    const { setNameMode, pollTimeout, publicNameExists } = this.state;
    if (address !== prevProps.address && networkConfig.chainId === 1) {
      reverseResolve(address);
    }
    if (purchasedSubdomainLabel !== prevProps.purchasedSubdomainLabel) {
      if (!publicNameExists && !!purchasedSubdomainLabel && purchasedSubdomainLabel.length > 0) {
        this.setState({ temporaryPublicName: purchasedSubdomainLabel, showPurchase: true });
      }
    }
    if (addressRequests !== prevProps.addressRequests) {
      const req = addressRequests[address];
      const isComplete =
        !!req && !!req.data && req.state === ensAddressRequestsTypes.RequestStates.success;
      this.setState({
        isComplete,
        publicNameExists: !!req && !!req.data && req.data.name.length > 0
      });
      if (!!req && !!req.data && req.data.name.length > 0) {
        this.setState({ publicName: req.data.name });
      }
    }
    if (setNameMode) {
      if (this.txFieldsValid() && this.signTxIntended()) {
        this.signTx();
      }
      if (currentTxStatus !== prevProps.currentTxStatus) {
        if (this.txBroadcastSuccessful()) {
          this.setState({
            broadcastedHash: (currentTxStatus as any).broadcastedHash,
            pollInitiated: true
          });
          this.pollForTxReceipt();
        } else if (this.txBroadcastFailed(prevProps)) {
          this.setState({ setNameMode: false });
        }
      }
      if (txDatas !== prevProps.txDatas) {
        if (this.txConfirmed()) {
          this.setNameComplete();
        } else if (!pollTimeout) {
          this.setState({ pollTimeout: true }, () => this.pollForTxReceipt());
        }
      }
    }
  }

  public render() {
    const { address, addressLabel } = this.props;
    const { copied, publicNameExists, showPurchase, editingPublicName } = this.state;
    const content =
      publicNameExists || showPurchase || editingPublicName
        ? this.generatePublicNameContent()
        : this.generateLabelContent();
    const labelButton = this.generateLabelButton();
    const publicNameButton = this.generatePublicNameButton();
    const modal = this.generateModal();
    const addressClassName = `AccountInfo-address-addr ${
      addressLabel || publicNameExists || showPurchase ? 'AccountInfo-address-addr--small' : ''
    }`;

    return (
      <div className="AccountInfo">
        <h5 className="AccountInfo-section-header">{translate('SIDEBAR_ACCOUNTADDR')}</h5>
        <div className="AccountInfo-section AccountInfo-address-section">
          <div className="AccountInfo-address-icon">
            <Identicon address={address} size="100%" />
          </div>
          <div className="AccountInfo-address-wrapper">
            {content}
            <div className={addressClassName}>
              <Address address={address} />
            </div>
            <CopyToClipboard onCopy={this.handleCopy} text={address}>
              <div
                className={`AccountInfo-copy ${copied ? 'is-copied' : ''}`}
                title={translateRaw('COPY_TO_CLIPBOARD')}
              >
                <i className="fa fa-copy" />
                <span>{translateRaw(copied ? 'COPIED' : 'COPY_ADDRESS')}</span>
              </div>
            </CopyToClipboard>
            {labelButton}
            {publicNameButton}
            {modal}
          </div>
        </div>
      </div>
    );
  }

  public UNSAFE_componentWillReceiveProps(nextProps: Props) {
    if (nextProps.txBroadcasted && this.state.showModal) {
      this.closeModal(false);
    }
  }

  private clearCopied = () =>
    (this.goingToClearCopied = window.setTimeout(() => this.setState({ copied: false }), 2000));

  private startEditingLabel = () =>
    this.setState({ editingLabel: true }, () => {
      if (this.labelInput) {
        this.labelInput.focus();
        this.labelInput.select();
      }
    });

  private startEditingPublicName = () =>
    this.setState({ editingPublicName: true }, () => {
      if (this.publicNameInput) {
        this.publicNameInput.focus();
        this.publicNameInput.select();
      }
    });

  private stopEditingLabel = () => this.setState({ editingLabel: false });

  private stopEditingPublicName = () => this.setState({ editingPublicName: false });

  private setLabelInputRef = (node: HTMLInputElement) => (this.labelInput = node);

  private setPublicNameRef = (node: HTMLInputElement) => (this.publicNameInput = node);

  private generateLabelContent = () => {
    const { addressLabel, entry: { temporaryLabel, labelError } } = this.props;
    const { editingLabel, labelInputTouched } = this.state;
    const newLabelSameAsPrevious = temporaryLabel === addressLabel;
    const labelInputTouchedWithError = labelInputTouched && !newLabelSameAsPrevious && labelError;

    let labelContent = null;

    if (editingLabel) {
      labelContent = (
        <React.Fragment>
          <Input
            title={translateRaw('ADD_LABEL')}
            placeholder={translateRaw('NEW_LABEL')}
            defaultValue={addressLabel}
            onChange={this.handleLabelChange}
            onKeyDown={this.handleKeyDown}
            onFocus={this.setTemporaryLabelTouched}
            onBlur={this.handleBlur}
            showInvalidBeforeBlur={true}
            setInnerRef={this.setLabelInputRef}
            isValid={!labelInputTouchedWithError}
          />
          {labelInputTouchedWithError && (
            <label className="AccountInfo-address-wrapper-error">{labelError}</label>
          )}
        </React.Fragment>
      );
    } else {
      labelContent = (
        <React.Fragment>
          {addressLabel.length > 0 && (
            <label className="AccountInfo-address-label">{addressLabel}</label>
          )}
        </React.Fragment>
      );
    }

    return labelContent;
  };

  private generatePublicNameContent = () => {
    const { editingPublicName, publicName, publicNameError, isComplete, showPurchase } = this.state;
    return editingPublicName ? (
      <React.Fragment>
        <Input
          title={translateRaw('ADD_PUBLIC_NAME')}
          placeholder={translateRaw('NEW_PUBLIC_NAME')}
          defaultValue={
            showPurchase && !!this.props.purchasedSubdomainLabel
              ? this.props.purchasedSubdomainLabel
              : publicName
          }
          onChange={this.handlePublicNameChange}
          onKeyDown={this.handlePublicNameKeyDown}
          onFocus={this.setTemporaryPublicNameTouched}
          onBlur={this.handlePublicNameBlur}
          showInvalidBeforeBlur={true}
          setInnerRef={this.setPublicNameRef}
          isValid={!publicNameError}
        />
        {publicNameError && (
          <label className="AccountInfo-address-wrapper-error">
            {translateRaw('ENS_SUBDOMAIN_INVALID_INPUT')}
          </label>
        )}
      </React.Fragment>
    ) : (
      <div className="AccountInfo-public-name-wrapper">
        <label className="AccountInfo-public-name-label">
          {showPurchase ? (
            <React.Fragment>
              {this.props.purchasedSubdomainLabel}
              <div className="AccountInfo-public-name-status">
                <i className="AccountInfo-public-name-status-icon fa fa-remove is-invalid help-block" />
                <span className="AccountInfo-public-name-status-label is-invalid help-block">
                  {translate('ENS_PUBLIC_NAME_EMPTY')}
                </span>
              </div>
            </React.Fragment>
          ) : isComplete ? (
            <React.Fragment>
              {publicName}
              <div className="AccountInfo-public-name-status">
                <i className="AccountInfo-public-name-status-icon fa fa-check is-valid help-block" />
                <span className="AccountInfo-public-name-status-label is-valid help-block">
                  {translate('ENS_PUBLIC_NAME_PUBLIC')}
                </span>
                <i
                  className="AccountInfo-public-name-status-refresh fa fa-refresh is-valid help-block"
                  onClick={this.refreshAddressResolution}
                />
              </div>
            </React.Fragment>
          ) : (
            <React.Fragment>
              {publicName}
              <div className="AccountInfo-public-name-status">
                <div className="AccountInfo-public-name-status-icon-resolving is-semivalid help-block">
                  <Spinner />
                </div>
                <span className="AccountInfo-public-name-status-label-resolving is-semivalid help-block">
                  {translate('ENS_PUBLIC_NAME_RESOLVING')}
                </span>
              </div>
            </React.Fragment>
          )}
        </label>
      </div>
    );
  };

  private generateLabelButton = () => {
    const { addressLabel } = this.props;
    const { editingLabel } = this.state;
    const labelButton = editingLabel ? (
      <React.Fragment>
        <i className="fa fa-save" />
        <span role="button" title={translateRaw('SAVE_LABEL')} onClick={this.stopEditingLabel}>
          {translate('SAVE_LABEL')}
        </span>
      </React.Fragment>
    ) : (
      <React.Fragment>
        <i className="fa fa-pencil" />
        <span
          role="button"
          title={addressLabel ? translateRaw('EDIT_LABEL') : translateRaw('ADD_LABEL_9')}
          onClick={this.startEditingLabel}
        >
          {addressLabel ? translate('EDIT_LABEL') : translate('ADD_LABEL_9')}
        </span>
      </React.Fragment>
    );

    return (
      <div className="AccountInfo-label" title={translateRaw('EDIT_LABEL_2')}>
        {labelButton}
      </div>
    );
  };

  private generatePublicNameButton = () => {
    const {
      editingPublicName,
      publicNameExists,
      publicNameError,
      setNameMode,
      showPurchase
    } = this.state;
    const publicNameButton = editingPublicName ? (
      publicNameError ? null : (
        <React.Fragment>
          <i className="fa fa-save" />
          <span
            role="button"
            title={translateRaw('SAVE_PUBLIC_NAME')}
            onClick={this.stopEditingPublicName}
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
          onClick={this.startEditingPublicName}
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
          onClick={this.startEditingPublicName}
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
          onClick={this.startEditingPublicName}
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
  };

  private generateModal = (): React.ReactElement<any> => {
    const { signaturePending, signedTx } = this.props;
    return (
      <ConfirmationModal
        isOpen={!signaturePending && signedTx && this.state.showModal}
        onClose={this.cancelModal}
      />
    );
  };

  private handleBlur = () => {
    const { address, addressLabel, entry: { id, label, temporaryLabel, labelError } } = this.props;

    this.clearTemporaryLabelTouched();
    this.stopEditingLabel();

    if (temporaryLabel === addressLabel) {
      return;
    }

    if (temporaryLabel && temporaryLabel.length > 0) {
      this.props.saveAddressLabelEntry(id);

      if (labelError) {
        // If the new changes aren't valid, undo them.
        this.props.changeAddressLabelEntry({
          id,
          address,
          temporaryAddress: address,
          label,
          temporaryLabel: label,
          overrideValidation: true
        });
      }
    } else {
      this.props.removeAddressLabelEntry(id);
    }
  };

  private handlePublicNameBlur = () => {
    const { publicName, temporaryPublicName } = this.state;
    this.clearTemporaryPublicNameTouched();
    this.stopEditingPublicName();
    if (temporaryPublicName === publicName) {
      return;
    }
    if (temporaryPublicName && temporaryPublicName.length > 0) {
      this.setName();
    }
  };

  private handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    switch (e.key) {
      case 'Enter':
        return this.handleBlur();
      case 'Escape':
        return this.stopEditingLabel();
    }
  };

  private handlePublicNameKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    switch (e.key) {
      case 'Enter':
        return this.handlePublicNameBlur();
      case 'Escape':
        return this.stopEditingPublicName();
    }
  };

  private handleLabelChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { address } = this.props;
    const label = e.target.value;

    this.props.changeAddressLabelEntry({
      id: addressBookConstants.ACCOUNT_ADDRESS_ID,
      address,
      label,
      isEditing: true
    });

    this.setState(
      {
        labelInputTouched: true
      },
      () => label.length === 0 && this.clearTemporaryLabelTouched()
    );
  };

  private handlePublicNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const temporaryPublicName = e.target.value;
    const err = typeof temporaryPublicName !== 'string';
    this.setState({
      publicNameError: err,
      temporaryPublicName
    });
  };

  private setTemporaryLabelTouched = () => {
    const { labelInputTouched } = this.state;

    if (!labelInputTouched) {
      this.setState({ labelInputTouched: true });
    }
  };

  private setTemporaryPublicNameTouched = () => {
    const { publicNameInputTouched } = this.state;
    if (!publicNameInputTouched) {
      this.setState({ publicNameInputTouched: true });
    }
  };

  private clearTemporaryLabelTouched = () => this.setState({ labelInputTouched: false });

  private clearTemporaryPublicNameTouched = () => this.setState({ publicNameInputTouched: false });

  /**
   *
   * @desc Calculates the cost of the setName transaction and compares that to the available
   * balance in the user's wallet. Returns true if the balance is insufficient to make the purchase
   * @returns {boolean}
   */
  private insufficientEtherBalance = (): boolean => {
    const { gasEstimates, etherBalance } = this.props;
    const txCost = gasPriceToBase(!!gasEstimates ? gasEstimates.fast : 20).mul(
      handleValues(this.state.setNameGasLimit)
    );
    return !!etherBalance && txCost.gt(etherBalance);
  };

  /**
   *
   * @desc Sets the tx fields after user clicks button or presses enter
   */
  private setName = () => {
    const { autoGasLimit, toggleAutoGasLimit, gasEstimation } = this.props;
    const gasEstimateRequested = gasEstimation === transactionNetworkTypes.RequestStatus.REQUESTED;
    if (autoGasLimit) {
      toggleAutoGasLimit();
    }
    if (gasEstimateRequested) {
      return;
    }
    this.setState(
      {
        setNameMode: true,
        pollInitiated: false
      },
      () => this.setTxFields()
    );
  };

  /**
   *
   * @desc Sets the fields of the tx singleton with the desired parameters of
   * a new setName tx and requests the nonce if needed
   */
  private setTxFields = () => {
    const {
      nonceStatus,
      getNonce,
      setToField,
      setValueField,
      inputData,
      inputGasPrice,
      inputGasLimit
    } = this.props;
    const txAddress = this.getTxAddress();
    const txValue = this.getTxValue();
    const txData = this.getTxData();
    const txGasPrice = this.getTxGasPrice();
    const txGasLimit = this.getTxGasLimit();
    const status = transactionNetworkTypes.RequestStatus;
    if (nonceStatus !== status.SUCCEEDED && nonceStatus !== status.REQUESTED) {
      getNonce();
    }
    setToField({ raw: txAddress, value: Addr(txAddress) });
    setValueField({ raw: fromWei(txValue, 'ether'), value: txValue });
    inputData(txData);
    inputGasPrice(txGasPrice);
    inputGasLimit(txGasLimit);
  };

  /**
   *
   * @desc Returns the address of the ENS reverse registrar
   * @returns {string}
   */
  private getTxAddress = (): string => {
    return networkConfigs.main.public.reverse;
  };

  /**
   *
   * @desc Returns the value parameter for a setName() tx
   * @returns {Wei}
   */
  private getTxValue = (): Wei => {
    return Wei('0');
  };

  /**
   *
   * @desc Returns the encoded data parameter for a setName() tx
   * @returns {string}
   */
  private getTxData = (): string => {
    const { reverseRegistrarInstance, temporaryPublicName } = this.state;
    return reverseRegistrarInstance.setName.encodeInput({ name: temporaryPublicName });
  };

  /**
   *
   * @desc Returns the gas price parameter for a setName() tx
   * @returns {string}
   */
  private getTxGasPrice = (): string => {
    const { gasEstimates } = this.props;
    return !!gasEstimates ? gasEstimates.fast.toString() : '20';
  };

  /**
   *
   * @desc Returns the hex-encoded gas limit parameter for a setName() tx
   * @returns {string}
   */
  private getTxGasLimit = (): string => {
    return bufferToHex(this.state.setNameGasLimit);
  };

  /**
   *
   * @desc Returns true if the set public name button has been clicked, a signature is not
   * pending, the tx has not been signed, and gas estimation has not been requested
   * @returns {boolean}
   */
  private signTxIntended = (): boolean => {
    const { signaturePending, signedTx, gasEstimation } = this.props;
    const gasEstimateRequested = gasEstimation === transactionNetworkTypes.RequestStatus.REQUESTED;
    return this.state.setNameMode && !signaturePending && !signedTx && !gasEstimateRequested;
  };

  /**
   *
   * @desc Returns true if each of the tx parameters have been correctly set
   * @returns {boolean}
   */
  private txFieldsValid = (): boolean => {
    const { isFullTransaction, transaction, nonceStatus } = this.props;
    const txFields = getTransactionFields(transaction);
    const txAddress = this.getTxAddress().toString();
    const txValue = this.cleanHex(this.getTxValue());
    const txData = this.getTxData();
    const txGasPrice = this.cleanHex(gasPriceToBase(Number(this.getTxGasPrice())));
    const txGasLimit = addHexPrefix(unpad(this.getTxGasLimit()));
    const isValidNonce = nonceStatus === transactionNetworkTypes.RequestStatus.SUCCEEDED;
    return (
      isFullTransaction &&
      txFields.to === txAddress &&
      txFields.data === txData &&
      (txFields.value === txValue ||
        txFields.value === txValue.substring(0, txValue.length - 1) ||
        txFields.value === txValue + '0') &&
      txFields.gasPrice === txGasPrice &&
      txFields.gasLimit === txGasLimit &&
      isValidNonce
    );
  };

  private cleanHex = (input: BN): string => {
    return addHexPrefix(unpad(bufferToHex(input)));
  };

  /**
   *
   * @desc Sign the tx and open the confirmation modal
   */
  private signTx = () => {
    const { signTx, transaction } = this.props;
    signTx(transaction);
    this.openModal();
  };

  /**
   *
   * @desc Returns true if the recent tx was successfully broadcasted
   * and the tx confirmation poll has not been started
   * @returns {boolean}
   */
  private txBroadcastSuccessful = (): boolean => {
    const { currentTxStatus } = this.props;
    const { setNameMode, pollInitiated } = this.state;
    return (
      setNameMode &&
      !pollInitiated &&
      !!currentTxStatus &&
      currentTxStatus &&
      currentTxStatus.broadcastSuccessful &&
      !!currentTxStatus.broadcastedHash
    );
  };

  /**
   *
   * @desc Returns true if the recent tx attempted to broadcast and the broadcast failed
   * @param {Props}
   * @returns {boolean}
   */
  private txBroadcastFailed = (prevProps: Props): boolean => {
    const { currentTxStatus } = this.props;
    return (
      this.state.setNameMode &&
      !!currentTxStatus &&
      !!prevProps.currentTxStatus &&
      !prevProps.currentTxStatus.broadcastSuccessful &&
      prevProps.currentTxStatus.isBroadcasting &&
      !currentTxStatus.broadcastSuccessful &&
      !currentTxStatus.isBroadcasting
    );
  };

  /**
   *
   * @desc Returns true if the recent tx was successfully broadcasted
   * and the tx receipt has been retrieved and shows a success status
   * @returns {boolean}
   */
  private txConfirmed = (): boolean => {
    const { setNameMode, pollInitiated, broadcastedHash } = this.state;
    const { txDatas } = this.props;
    return (
      setNameMode &&
      pollInitiated &&
      !!txDatas[broadcastedHash] &&
      !!txDatas[broadcastedHash].receipt &&
      !!(txDatas[broadcastedHash].receipt as TransactionReceipt).status &&
      (txDatas[broadcastedHash].receipt as TransactionReceipt).status === 1
    );
  };

  /**
   *
   * @desc Close the tx broadcasted notification, show the tx confirmed notification,
   * refresh the account's balance, and refresh the address' reverse resolved data
   */
  private setNameComplete = () => {
    const { refreshBalance, address } = this.props;
    this.closeTxBroadcastedNotification();
    this.showTxConfirmedNotification();
    this.setState({ showPurchase: false, setNameMode: false }, () => {
      refreshBalance();
      this.resolveNameUpdate(address, this.state.temporaryPublicName);
    });
  };

  /**
   *
   * @desc continually refreshes the reverse resolution data until the data shows ownership or the ttl has been reached.
   */
  private resolveNameUpdate = (addressToCheck: string, name: string, ttl: number = 35) => {
    const req = this.props.addressRequests[addressToCheck];
    const requestSuccessful =
      !!req && !!req.data && req.state === ensAddressRequestsTypes.RequestStates.success;
    const nameUpdated = requestSuccessful ? (req.data as IBaseAddressRequest).name === name : false;

    if (ttl > 0) {
      if (!requestSuccessful) {
        setTimeout(() => this.resolveNameUpdate(addressToCheck, name, ttl - 1), 250);
      } else if (!nameUpdated) {
        this.refreshAddressResolution();
        setTimeout(() => this.resolveNameUpdate(addressToCheck, name, ttl - 1), 350);
      }
    } else {
      setTimeout(this.refreshAddressResolution, 3000);
    }
  };

  /**
   *
   * @desc Refresh the reverse resolution data for the address
   */
  private refreshAddressResolution = () => {
    const { reverseResolve, address } = this.props;
    reverseResolve(address, true);
  };

  /**
   *
   * @desc Find the tx broadcasted notification and closes it
   */
  private closeTxBroadcastedNotification = () => {
    const { notifications, closeNotification } = this.props;
    const { broadcastedHash } = this.state;
    const txBroadcastedNotification = notifications.find(notif => {
      return !!notif.componentConfig && notif.componentConfig.txHash === broadcastedHash;
    });
    if (!!txBroadcastedNotification) {
      closeNotification(txBroadcastedNotification);
    }
  };

  /**
   *
   * @desc Build a success notification for a confirmed tx and show it for 10 seconds
   */
  private showTxConfirmedNotification = () => {
    this.props.showNotification(
      'success',
      translateRaw('ENS_PUBLIC_NAME_TX_CONFIRMED_NOTIF_MSG', {
        $publicName: this.state.temporaryPublicName
      }),
      10000
    );
  };

  private openModal = () => {
    const { currentTxStatus, showNotification } = this.props;
    !!currentTxStatus && (currentTxStatus.broadcastSuccessful || currentTxStatus.isBroadcasting)
      ? showNotification(
          'warning',
          'The current transaction is already broadcasting or has been successfully broadcasted'
        )
      : this.setState({ showModal: true });
  };

  private cancelModal = () => this.closeModal(true);

  /**
   *
   * @desc Close the tx confirmation modal, if closedByUser then
   * enable the set public name button. Toggle auto gas estimation
   */
  private closeModal = (closedByUser: boolean) => {
    const { autoGasLimit, toggleAutoGasLimit } = this.props;
    this.setState(
      {
        showModal: false,
        setNameMode: !closedByUser
      },
      () => {
        if (!autoGasLimit) {
          toggleAutoGasLimit();
        }
      }
    );
  };

  private pollForTxReceipt = () => setTimeout(this.fetchTxReceipt, 10000);

  /**
   *
   * @desc Fetch the receipt of the broadcasted tx
   */
  private fetchTxReceipt = () => {
    this.setState({ pollTimeout: false }, () => {
      const { fetchTxData } = this.props;
      const { setNameMode, broadcastedHash } = this.state;
      if (setNameMode && !!broadcastedHash) {
        fetchTxData(broadcastedHash);
      }
    });
  };
}

const mapStateToProps: MapStateToProps<StateProps, {}, AppState> = (
  state: AppState,
  ownProps: OwnProps
) => {
  const labelEntry = addressBookSelectors.getAddressLabelEntryFromAddress(state, ownProps.address);
  return {
    etherBalance: walletSelectors.getEtherBalance(state),
    gasEstimates: gasSelectors.getEstimates(state),
    addressRequests: state.ens.addressRequests,
    isResolving: ensSelectors.getResolvedAddress(state),
    networkConfig: configSelectors.getNetworkConfig(state),
    entry: addressBookSelectors.getAccountAddressEntry(state),
    addressLabel: labelEntry ? labelEntry.label : '',
    nonceStatus: transactionNetworkSelectors.getNetworkStatus(state).getNonceStatus,
    gasEstimation: transactionNetworkSelectors.getNetworkStatus(state).gasEstimationStatus,
    autoGasLimit: configMetaSelectors.getAutoGasLimitEnabled(state),
    notifications: state.notifications,
    ...derivedSelectors.getTransaction(state),
    txDatas: transactionsSelectors.getTransactionDatas(state),
    currentTxStatus: transactionSelectors.getCurrentTransactionStatus(state),
    txBroadcasted: transactionSelectors.currentTransactionBroadcasted(state),
    signaturePending: derivedSelectors.signaturePending(state).isSignaturePending,
    signedTx:
      !!transactionSignSelectors.getSignedTx(state) || !!transactionSignSelectors.getWeb3Tx(state)
  };
};

const mapDispatchToProps: DispatchProps = {
  reverseResolve: ensActions.reverseResolveAddressRequested,
  changeAddressLabelEntry: addressBookActions.changeAddressLabelEntry,
  saveAddressLabelEntry: addressBookActions.saveAddressLabelEntry,
  removeAddressLabelEntry: addressBookActions.removeAddressLabelEntry,
  setToField: transactionFieldsActions.setToField,
  setValueField: transactionFieldsActions.setValueField,
  inputData: transactionFieldsActions.inputData,
  inputGasLimit: transactionFieldsActions.inputGasLimit,
  inputGasPrice: transactionFieldsActions.inputGasPrice,
  getNonce: transactionNetworkActions.getNonceRequested,
  signTx: transactionSignActions.signTransactionRequested,
  toggleAutoGasLimit: configMetaActions.toggleAutoGasLimit,
  showNotification: notificationsActions.showNotification,
  closeNotification: notificationsActions.closeNotification,
  fetchTxData: transactionsActions.fetchTransactionData,
  refreshBalance: walletActions.refreshAccountBalance
};

export default connect<StateProps, DispatchProps, OwnProps, AppState>(
  mapStateToProps,
  mapDispatchToProps
)(AccountAddress);
