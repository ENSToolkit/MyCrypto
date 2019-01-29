import React from 'react';
import { connect } from 'react-redux';
import { sha3, bufferToHex, unpad, addHexPrefix } from 'ethereumjs-util';
import EthTx from 'ethereumjs-tx';
import BN from 'bn.js';

import { TransactionReceipt } from 'types/transactions';
import { AppState } from 'features/reducers';
import { ensActions, ensDomainRequestsTypes } from 'features/ens';
import { gasSelectors } from 'features/gas';
import { configSelectors, configMetaActions } from 'features/config';
import { configMetaSelectors } from 'features/config/meta';
import { notificationsActions } from 'features/notifications';
import * as derivedSelectors from 'features/selectors';
import {
  transactionFieldsSelectors,
  transactionFieldsActions,
  transactionNetworkActions,
  transactionNetworkSelectors,
  transactionSelectors,
  transactionSignSelectors,
  transactionBroadcastTypes,
  transactionSignActions
} from 'features/transaction';
import { transactionNetworkTypes } from 'features/transaction/network';
import { transactionsActions, transactionsSelectors } from 'features/transactions';
import { walletSelectors, walletActions } from 'features/wallet';
import { getNameHash, NameState, IBaseSubdomainRequest } from 'libs/ens';
import Contract from 'libs/contracts';
import { Address, Wei, handleValues, gasPriceToBase, fromWei } from 'libs/units';
import { getTransactionFields } from 'libs/transaction/utils/ether';
import { ConfirmationModal } from 'components/ConfirmationModal';
import { translate, translateRaw } from 'translations';
import {
  ETHSimpleDescription,
  ETHSimpleSubdomainInput,
  ETHSimpleStatus
} from './ETHSimpleComponents';
import './ETHSimpleComponents/ETHSimple.scss';
const constants = require('./ETHSimpleComponents/ETHSimpleConstants.json');

interface StateProps {
  domainRequests: AppState['ens']['domainRequests'];
  nonceStatus: AppState['transaction']['network']['getNonceStatus'];
  gasEstimation: AppState['transaction']['network']['gasEstimationStatus'];
  notifications: AppState['notifications'];
  network: ReturnType<typeof configSelectors.getNetworkConfig>;
  txDatas: AppState['transactions']['txData'];
  txBroadcasted: boolean | null;
  signaturePending: AppState['transaction']['sign']['pending'];
  signedTx: boolean;
  isFullTransaction: boolean;
  currentTxStatus: false | transactionBroadcastTypes.ITransactionStatus | null;
  transaction: EthTx;
  etherBalance: AppState['wallet']['balance']['wei'];
  gasEstimates: AppState['gas']['estimates'];
  gasPrice: AppState['transaction']['fields']['gasPrice'];
  autoGasLimit: AppState['config']['meta']['autoGasLimit'];
}

interface DispatchProps {
  resolveDomain: ensActions.TResolveDomainRequested;
  showNotification: notificationsActions.TShowNotification;
  closeNotification: notificationsActions.TCloseNotification;
  setToField: transactionFieldsActions.TSetToField;
  setValueField: transactionFieldsActions.TSetValueField;
  inputData: transactionFieldsActions.TInputData;
  inputGasLimit: transactionFieldsActions.TInputGasLimit;
  inputGasPrice: transactionFieldsActions.TInputGasPrice;
  getNonce: transactionNetworkActions.TGetNonceRequested;
  signTx: transactionSignActions.TSignTransactionRequested;
  fetchTxData: transactionsActions.TFetchTransactionData;
  refreshBalance: walletActions.TRefreshAccountBalance;
  toggleAutoGasLimit: configMetaActions.TToggleAutoGasLimit;
}

interface OwnProps {
  address: string;
  subdomainPurchased(label: string): void;
}

type Props = StateProps & DispatchProps & OwnProps;

interface State {
  esRegistrar: Contract;
  subdomain: string;
  enteredSubdomain: string;
  purchaseMode: boolean;
  pollInitiated: boolean;
  pollTimeout: boolean;
  showModal: boolean;
  broadcastedHash: string;
  isComplete: boolean;
  isAvailable: boolean;
  isOwnedBySelf: boolean;
  txFailed: boolean;
}

class ETHSimpleClass extends React.Component<Props, State> {
  public state = {
    esRegistrar: new Contract(constants.subdomainRegistrarABI),
    subdomain: '',
    enteredSubdomain: '',
    purchaseMode: false,
    pollInitiated: false,
    pollTimeout: false,
    showModal: false,
    broadcastedHash: '',
    isComplete: false,
    isAvailable: false,
    isOwnedBySelf: false,
    txFailed: false
  };

  public componentDidUpdate(prevProps: Props) {
    const {
      txDatas,
      currentTxStatus,
      network,
      domainRequests,
      resolveDomain,
      address
    } = this.props;
    const { pollTimeout, purchaseMode, subdomain } = this.state;
    if (domainRequests !== prevProps.domainRequests) {
      const req = domainRequests[subdomain + constants.esDomain];
      const isComplete = !!req && req.state === ensDomainRequestsTypes.RequestStates.success;
      const requestFailed = !!req && req.state === ensDomainRequestsTypes.RequestStates.failed;
      const isAvailable = isComplete
        ? (req.data as IBaseSubdomainRequest).mode === NameState.Open
        : false;
      const isOwnedBySelf = isComplete
        ? (req.data as IBaseSubdomainRequest).ownerAddress === address
        : false;
      this.setState({ isComplete, isAvailable, isOwnedBySelf });
      if (requestFailed && !!network.isTestnet) {
        resolveDomain(subdomain + constants.esDomain, network.isTestnet);
      }
    }
    if (purchaseMode) {
      if (this.signTxIntended() && this.txFieldsValid()) {
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
          this.setState({ purchaseMode: false, txFailed: true });
        }
      }
      if (txDatas !== prevProps.txDatas) {
        if (this.txConfirmed()) {
          this.purchaseComplete();
        } else if (!pollTimeout) {
          this.setState({ pollTimeout: true }, () => this.pollForTxReceipt());
        }
      }
    }
  }

  public render() {
    const {
      subdomain,
      enteredSubdomain,
      purchaseMode,
      pollInitiated,
      isComplete,
      isAvailable,
      isOwnedBySelf,
      showModal
    } = this.state;
    const { address, network, signaturePending, signedTx } = this.props;
    const { supportedNetworks, subdomainPriceETH, esURL } = constants;
    const isValidSubdomain = enteredSubdomain === subdomain;
    return (
      <div className="ETHSimple">
        <h5 className="ETHSimple-title">{translate('ETHSIMPLE_TITLE')}</h5>
        <ETHSimpleDescription address={address} subdomain={subdomain} />
        {supportedNetworks.includes(network.id) ? (
          <div>
            <ETHSimpleSubdomainInput
              address={address}
              subdomainChanged={this.subdomainChanged}
              purchaseSubdomain={this.purchaseSubdomain}
            />
            <button
              className="ETHSimple-button btn btn-primary btn-block"
              disabled={this.purchaseDisabled()}
              onClick={this.purchaseSubdomain}
            >
              <label className="ETHSimple-button-title">
                {translate('ETHSIMPLE_ACTION', {
                  $domainPriceEth: subdomainPriceETH
                })}
              </label>
            </button>
            <ETHSimpleStatus
              isValidSubdomain={isValidSubdomain}
              subdomain={subdomain}
              insufficientEtherBalance={this.insufficientEtherBalance()}
              purchaseMode={purchaseMode}
              pollInitiated={pollInitiated}
              domainRequestIsComplete={isComplete}
              domainIsAvailable={isAvailable}
              domainIsOwnedByCurrentAddress={isOwnedBySelf}
            />
            <ConfirmationModal
              isOpen={!signaturePending && signedTx && showModal}
              onClose={this.cancelModal}
            />
          </div>
        ) : null}
        <div className="row">
          <div className="col-xs-12">
            <a className="ETHSimple-logo" href={esURL} target="_blank" rel="noopener noreferrer" />
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

  private purchaseDisabled = (): boolean => {
    const { purchaseMode, enteredSubdomain, subdomain, isComplete, isAvailable } = this.state;
    const isValidSubdomain = enteredSubdomain === subdomain && subdomain.length > 0;
    const insufficientBalance = this.insufficientEtherBalance();
    const gasEstimateRequested =
      this.props.gasEstimation === transactionNetworkTypes.RequestStatus.REQUESTED;
    return (
      !isValidSubdomain ||
      !isComplete ||
      !isAvailable ||
      insufficientBalance ||
      purchaseMode ||
      gasEstimateRequested
    );
  };

  private subdomainChanged = (enteredSubdomain: string, subdomain: string) => {
    this.setState({
      enteredSubdomain,
      subdomain,
      purchaseMode: false,
      isComplete: false
    });
  };

  /**
   *
   * @desc Calculates the cost of the subdomain registration transaction and
   * compares that to the available balance in the user's wallet. Returns true
   * if the balance is insufficient to make the purchase
   * @returns {boolean}
   */
  private insufficientEtherBalance = (): boolean => {
    const { subdomainPriceWei, purchaseSubdomainGasLimit } = constants;
    const { gasPrice, etherBalance } = this.props;
    const txCost = Wei(subdomainPriceWei).add(
      gasPrice.value.mul(handleValues(purchaseSubdomainGasLimit))
    );
    return !!etherBalance && txCost.gt(etherBalance);
  };

  /**
   *
   * @desc Handles the click event from the purchase button
   * @param {React.FormEvent<HTMLElement>} onClick or onSubmit event
   */
  private purchaseSubdomain = (ev: React.FormEvent<HTMLElement>) => {
    const { autoGasLimit, toggleAutoGasLimit, gasEstimation } = this.props;
    const gasEstimateRequested = gasEstimation === transactionNetworkTypes.RequestStatus.REQUESTED;
    ev.preventDefault();
    if (autoGasLimit) {
      toggleAutoGasLimit();
    }
    if (gasEstimateRequested) {
      return;
    }
    this.setState(
      {
        purchaseMode: true,
        pollInitiated: false
      },
      () => this.setTxFields()
    );
  };

  /**
   *
   * @desc Set the fields of the tx singleton with the desired parameters of
   * a new subdomain registration and request the nonce if needed
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
    setToField({ raw: txAddress, value: Address(txAddress) });
    setValueField({ raw: fromWei(txValue, 'ether'), value: txValue });
    inputData(txData);
    inputGasPrice(txGasPrice);
    inputGasLimit(txGasLimit);
  };

  /**
   *
   * @desc Return the address of the ETHSimple subdomain registrar
   * contract, which is dependent on the configured network
   * @returns {string}
   */
  private getTxAddress = (): string => {
    const { subdomainRegistrarAddr } = constants;
    return this.props.network.isTestnet
      ? subdomainRegistrarAddr.ropsten
      : subdomainRegistrarAddr.mainnet;
  };

  /**
   *
   * @desc Return the value parameter for a subdomain registration tx denominated in Wei
   * @returns {Wei}
   */
  private getTxValue = (): Wei => {
    return Wei(constants.subdomainPriceWei);
  };

  /**
   *
   * @desc Return the encoded data parameter for a subdomain registration tx
   * @returns {string}
   */
  private getTxData = (): string => {
    const { subdomain, esRegistrar } = this.state;
    const { esFullDomainNamehash, esFullDomain, publicResolverAddr, emptyContentHash } = constants;
    const inputs = {
      _node: esFullDomainNamehash,
      _label: bufferToHex(sha3(subdomain)),
      _newNode: getNameHash(subdomain + esFullDomain),
      _resolver: publicResolverAddr,
      _owner: this.props.address,
      _resolvedAddress: this.props.address,
      _contentHash: emptyContentHash
    } as any;
    return esRegistrar.purchaseSubdomain.encodeInput(
      Object.keys(inputs).reduce((accu, key) => ({ ...accu, [key]: inputs[key] }), {})
    );
  };

  /**
   *
   * @desc Return the gas price parameter for a subdomain registration tx
   * @returns {string}
   */
  private getTxGasPrice = (): string => {
    const { gasEstimates } = this.props;
    return !!gasEstimates ? gasEstimates.fast.toString() : constants.purchaseSubdomainGasPrice;
  };

  /**
   *
   * @desc Return the hex-encoded gas limit parameter for a subdomain registration tx
   * @returns {string}
   */
  private getTxGasLimit = (): string => {
    return bufferToHex(new BN(constants.purchaseSubdomainGasLimit));
  };

  /**
   *
   * @desc Return true if the purchase button has been clicked, a signature is not
   * pending, the tx has not been signed, and gas estimation has not been requested
   * @returns {boolean}
   */
  private signTxIntended = (): boolean => {
    const { signaturePending, signedTx, gasEstimation } = this.props;
    const gasEstimateRequested = gasEstimation === transactionNetworkTypes.RequestStatus.REQUESTED;
    return this.state.purchaseMode && !signaturePending && !signedTx && !gasEstimateRequested;
  };

  /**
   *
   * @desc Return true if each of the tx parameters have been correctly set
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
      txFields.value === txValue &&
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
   * @desc Return true if the recent tx was successfully broadcasted
   * and the tx confirmation poll has not been started
   * @returns {boolean}
   */
  private txBroadcastSuccessful = (): boolean => {
    const { currentTxStatus } = this.props;
    const { purchaseMode, pollInitiated } = this.state;
    return (
      purchaseMode &&
      !pollInitiated &&
      !!currentTxStatus &&
      currentTxStatus &&
      currentTxStatus.broadcastSuccessful &&
      !!currentTxStatus.broadcastedHash
    );
  };

  /**
   *
   * @desc Return true if the recent tx attempted to broadcast and the broadcast failed
   * @param {Props}
   * @returns {boolean}
   */
  private txBroadcastFailed = (prevProps: Props): boolean => {
    const { currentTxStatus } = this.props;
    return (
      this.state.purchaseMode &&
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
   * @desc Return true if the recent tx was successfully broadcasted
   * and the tx receipt has been retrieved and shows a success status
   * @returns {boolean}
   */
  private txConfirmed = (): boolean => {
    const { purchaseMode, pollInitiated, broadcastedHash } = this.state;
    const { txDatas } = this.props;
    return (
      purchaseMode &&
      pollInitiated &&
      !!txDatas[broadcastedHash] &&
      !!txDatas[broadcastedHash].receipt &&
      !!(txDatas[broadcastedHash].receipt as TransactionReceipt).status &&
      (txDatas[broadcastedHash].receipt as TransactionReceipt).status === 1
    );
  };

  /**
   *
   * @desc Pass the purchased subdomain name to the AccountAddress component, close the
   * tx broadcasted notification, show the tx confirmed notification, refresh the account's
   * balance, and refresh the newly registered domain's resolution data
   */
  private purchaseComplete = () => {
    const { subdomainPurchased, refreshBalance } = this.props;
    subdomainPurchased(this.state.subdomain + constants.esFullDomain);
    this.closeTxBroadcastedNotification();
    this.showTxConfirmedNotification();
    this.setState({ purchaseMode: false }, () => {
      refreshBalance();
      setTimeout(this.refreshDomainResolution, 3000);
    });
  };

  /**
   *
   * @desc Refresh the resolution data for a recently registered domain name
   */
  private refreshDomainResolution = () => {
    const { resolveDomain, network } = this.props;
    resolveDomain(this.state.subdomain + constants.esDomain, network.isTestnet, true);
  };

  /**
   *
   * @desc Find the tx broadcasted notification and close it
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
      translateRaw('ETHSIMPLE_TX_CONFIRMED_NOTIF_MSG', {
        $domain: this.state.subdomain + constants.esFullDomain
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
   * disable purchase mode (enabling the purchase button). Toggle auto gas estimation
   */
  private closeModal = (closedByUser: boolean) => {
    const { autoGasLimit, toggleAutoGasLimit } = this.props;
    this.setState(
      {
        txFailed: false,
        showModal: false,
        purchaseMode: !closedByUser
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
      const { purchaseMode, broadcastedHash } = this.state;
      if (purchaseMode && !!broadcastedHash) {
        fetchTxData(broadcastedHash);
      }
    });
  };
}

function mapStateToProps(state: AppState): StateProps {
  return {
    etherBalance: walletSelectors.getEtherBalance(state),
    domainRequests: state.ens.domainRequests,
    nonceStatus: transactionNetworkSelectors.getNetworkStatus(state).getNonceStatus,
    gasEstimation: transactionNetworkSelectors.getNetworkStatus(state).gasEstimationStatus,
    network: configSelectors.getNetworkConfig(state),
    gasEstimates: gasSelectors.getEstimates(state),
    gasPrice: transactionFieldsSelectors.getGasPrice(state),
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
}

const mapDispatchToProps: DispatchProps = {
  showNotification: notificationsActions.showNotification,
  closeNotification: notificationsActions.closeNotification,
  resolveDomain: ensActions.resolveDomainRequested,
  setToField: transactionFieldsActions.setToField,
  setValueField: transactionFieldsActions.setValueField,
  inputData: transactionFieldsActions.inputData,
  inputGasLimit: transactionFieldsActions.inputGasLimit,
  inputGasPrice: transactionFieldsActions.inputGasPrice,
  getNonce: transactionNetworkActions.getNonceRequested,
  signTx: transactionSignActions.signTransactionRequested,
  fetchTxData: transactionsActions.fetchTransactionData,
  refreshBalance: walletActions.refreshAccountBalance,
  toggleAutoGasLimit: configMetaActions.toggleAutoGasLimit
};

export default connect(mapStateToProps, mapDispatchToProps)(ETHSimpleClass);
