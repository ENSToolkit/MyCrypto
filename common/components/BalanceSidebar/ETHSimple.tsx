import React from 'react';
import { connect } from 'react-redux';
import { sha3, bufferToHex, unpad, addHexPrefix } from 'ethereumjs-util';
import EthTx from 'ethereumjs-tx';
import BN from 'bn.js';

import { TransactionReceipt } from 'types/transactions';
import { AppState } from 'features/reducers';
import { ensActions, ensSelectors } from 'features/ens';
import { ensDomainRequestsTypes } from 'features/ens/domainRequests';
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
import { IWallet } from 'libs/wallet';
import { normalise, getNameHash, NameState, IBaseSubdomainRequest } from 'libs/ens';
import Contract from 'libs/contracts';
import { Address, Wei, handleValues, gasPriceToBase, fromWei } from 'libs/units';
import { isValidENSName } from 'libs/validators';
import { getTransactionFields } from 'libs/transaction/utils/ether';
import { Input, Spinner } from 'components/ui';
import { ConfirmationModal } from 'components/ConfirmationModal';
import { translate, translateRaw } from 'translations';
import './ETHSimple.scss';
const constants = require('./ETHSimpleConstants.json');

interface StateProps {
  domainRequests: AppState['ens']['domainRequests'];
  nonceStatus: AppState['transaction']['network']['getNonceStatus'];
  gasEstimation: AppState['transaction']['network']['gasEstimationStatus'];
  notifications: AppState['notifications'];
  isResolving: boolean | null;
  network: ReturnType<typeof configSelectors.getNetworkConfig>;
  checksum: ReturnType<typeof configSelectors.getChecksumAddressFn>;
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
  resetTx: transactionFieldsActions.TResetTransactionRequested;
  signTx: transactionSignActions.TSignTransactionRequested;
  fetchTxData: transactionsActions.TFetchTransactionData;
  refreshBalance: walletActions.TRefreshAccountBalance;
  toggleAutoGasLimit: configMetaActions.TToggleAutoGasLimit;
}

interface OwnProps {
  wallet: IWallet;
  subdomainPurchased(label: string): void;
}

type Props = StateProps & DispatchProps & OwnProps;

interface State {
  esRegistrar: Contract;
  subdomain: string;
  enteredSubdomain: string;
  address: string;
  purchaseMode: boolean;
  pollInitiated: boolean;
  pollTimeout: boolean;
  showModal: boolean;
  broadcastedHash: string;
}

class ETHSimpleClass extends React.Component<Props, State> {
  public state = {
    esRegistrar: new Contract(constants.subdomainRegistrarABI),
    subdomain: '',
    enteredSubdomain: '',
    address: '',
    purchaseMode: false,
    pollInitiated: false,
    pollTimeout: false,
    showModal: false,
    txBroadcasted: false,
    broadcastedHash: ''
  };

  public componentDidMount() {
    this.setAddress();
  }

  public componentDidUpdate(prevProps: Props) {
    const { txDatas, currentTxStatus, wallet, network } = this.props;
    const { pollTimeout, purchaseMode } = this.state;
    if (wallet !== prevProps.wallet || network !== prevProps.network) {
      this.setAddress();
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
          this.setState({ purchaseMode: false });
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
    const { subdomain, address } = this.state;
    const { domainRequests, network } = this.props;
    const req = domainRequests[subdomain + constants.esDomain];
    const isValidRequestData = !!req && !!req.data;
    const isAvailableDomain = isValidRequestData
      ? (req.data as IBaseSubdomainRequest).mode === NameState.Open
      : false;
    const ownedByThisAddress = isValidRequestData
      ? (req.data as IBaseSubdomainRequest).ownerAddress === address
      : false;
    const title = translate('ETHSIMPLE_TITLE');
    const description = this.generateDescription();
    const subdomainInputField = this.generateSubdomainInputField();
    const purchaseButton = this.generatePurchaseButton(
      isValidRequestData,
      isAvailableDomain,
      ownedByThisAddress
    );
    const statusLabel = this.generateStatusLabel(
      isValidRequestData,
      isAvailableDomain,
      ownedByThisAddress
    );
    const modal = this.generateModal();
    const esLogoButton = this.generateESLogoButton();
    const component = constants.supportedNetworks.includes(network.id) ? (
      <div>
        <form className="ETHSimpleInput" onSubmit={this.purchaseSubdomain}>
          {subdomainInputField}
          {purchaseButton}
        </form>
        {statusLabel}
        {modal}
      </div>
    ) : null;
    return (
      <div className="ETHSimple">
        <h5 className="ETHSimple-title">{title}</h5>
        <div className="ETHSimple-description">{description}</div>
        {component}
        {esLogoButton}
      </div>
    );
  }

  public UNSAFE_componentWillReceiveProps(nextProps: Props) {
    if (nextProps.txBroadcasted && this.state.showModal) {
      this.closeModal(false);
    }
  }

  private setAddress = () => {
    const { checksum, wallet } = this.props;
    const address = checksum(wallet.getAddressString());
    this.setState({ address });
  };

  private generateDescription = (): React.ReactElement<any> => {
    const { address, subdomain } = this.state;
    const { network } = this.props;
    const { supportedNetworks, esFullDomain, placeholderDomain, defaultDescAddr } = constants;
    const addressToDisplay = address.length > 0 ? address : defaultDescAddr;
    const domainName =
      subdomain.length > 0 ? subdomain + esFullDomain : placeholderDomain + esFullDomain;
    const cutoff = subdomain.length > 0 && subdomain.length < 5 ? 0 : 15;
    const addr =
      addressToDisplay.substring(0, addressToDisplay.length - cutoff) + (cutoff > 0 ? '...' : '');
    const supportedNetwork = (supportedNetworks as string[]).includes(network.id);
    const descriptionText = supportedNetwork ? 'ETHSIMPLE_DESC' : 'ETHSIMPLE_UNSUPPORTED_NETWORK';
    const textVariables = supportedNetwork
      ? { $domain: domainName, $addr: addr }
      : { $network: network.id };
    return translate(descriptionText, textVariables as any);
  };

  private generateSubdomainInputField = (): React.ReactElement<any> => {
    const { placeholderDomain, esFullDomain } = constants;
    return (
      <div className="input-group-wrapper">
        <label className="input-group input-group-inline">
          <Input
            className="ETHSimple-name ETHSimple-name-input border-rad-right-0"
            value={this.state.enteredSubdomain}
            isValid={true}
            type="text"
            placeholder={placeholderDomain}
            spellCheck={false}
            onChange={this.onChange}
          />
          <span className="ETHSimple-name input-group-addon">{esFullDomain}</span>
        </label>
      </div>
    );
  };

  private generatePurchaseButton = (
    isValidRequestData: boolean,
    isAvailableDomain: boolean,
    ownedByThisAddress: boolean
  ): React.ReactElement<any> => {
    const { purchaseMode, subdomain, enteredSubdomain } = this.state;
    const { isResolving, gasEstimation } = this.props;
    const isValidSubdomain = enteredSubdomain === subdomain && subdomain.length > 0;
    const purchaseDisabled =
      !isValidSubdomain ||
      (isResolving && !isValidRequestData) ||
      purchaseMode ||
      subdomain.length < 1 ||
      !isAvailableDomain ||
      ownedByThisAddress ||
      this.insufficientEtherBalance() ||
      gasEstimation === transactionNetworkTypes.RequestStatus.REQUESTED;
    const buttonTitle = translate('ETHSIMPLE_ACTION', {
      $domainPriceEth: constants.subdomainPriceETH
    });
    return (
      <button
        className="ETHSimple-button btn btn-primary btn-block"
        disabled={purchaseDisabled}
        onClick={this.purchaseSubdomain}
      >
        <label className="ETHSimple-button-title">{buttonTitle}</label>
      </button>
    );
  };

  private generateStatusLabel = (
    isValidRequestData: boolean,
    isAvailableDomain: boolean,
    ownedByThisAddress: boolean
  ): React.ReactElement<any> => {
    const { subdomain, enteredSubdomain, purchaseMode, pollInitiated } = this.state;
    const { isResolving, domainRequests } = this.props;
    const isValidSubdomain = enteredSubdomain === subdomain;
    const { esDomain, esFullDomain } = constants;
    const req = domainRequests[subdomain + esDomain];
    const isResolvingCurrentDomain = !isValidRequestData && isResolving;
    const isRefreshingCurrentDomain =
      isResolving &&
      isValidRequestData &&
      req.state !== ensDomainRequestsTypes.RequestStates.success;
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
    const domainName = { $domain: subdomain + esFullDomain };
    let className = '';
    let icon = null;
    let label = null;
    let button = null;

    if (purchaseMode) {
      className = warningClass;
      icon = spinnerIcon;
      label = pollInitiated
        ? translate('ETHSIMPLE_STATUS_WAIT_FOR_MINE')
        : translate('ETHSIMPLE_STATUS_WAIT_FOR_USER_CONFIRM');
    } else if (!isValidSubdomain) {
      className = invalidClass;
      label = translate('ENS_SUBDOMAIN_INVALID_INPUT');
    } else {
      if (isResolvingCurrentDomain || isRefreshingCurrentDomain) {
        className = warningClass;
        icon = spinnerIcon;
        label = translate('ETHSIMPLE_STATUS_RESOLVING_DOMAIN', domainName);
      } else if (isValidRequestData) {
        if (isAvailableDomain) {
          button = refreshButton;
          if (this.insufficientEtherBalance()) {
            className = warningClass;
            label = translate(
              'ETHSIMPLE_STATUS_SUBDOMAIN_AVAILABLE_INSUFFICIENT_FUNDS',
              domainName
            );
          } else {
            className = validClass;
            icon = checkIcon;
            label = translate('ETHSIMPLE_STATUS_SUBDOMAIN_AVAILABLE', domainName);
          }
        } else {
          if (ownedByThisAddress) {
            className = validClass;
            label = translate('ETHSIMPLE_STATUS_SUBDOMAIN_OWNED_BY_USER', domainName);
          } else {
            className = invalidClass;
            icon = xIcon;
            label = translate('ETHSIMPLE_STATUS_SUBDOMAIN_UNAVAILABLE', domainName);
          }
        }
      }
    }
    return (
      <div className={className}>
        {icon}
        {label}
        {button}
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

  private generateESLogoButton = (): React.ReactElement<any> => {
    return (
      <div className="row">
        <div className="col-xs-12">
          <a
            className="ETHSimple-logo"
            href={constants.esURL}
            target="_blank"
            rel="noopener noreferrer"
          />
        </div>
      </div>
    );
  };

  /**
   *
   * @desc Called on changes to the subdomain input field. Check the validity of
   * the entered subdomain and set purchaseMode to false. The setState
   * callback requests resolution of valid domains
   */
  private onChange = (event: React.FormEvent<HTMLInputElement>) => {
    const { resolveDomain, resetTx } = this.props;
    const enteredSubdomain = event.currentTarget.value.trim().toLowerCase();
    const subdomain = isValidENSName(enteredSubdomain + constants.esDomain)
      ? normalise(enteredSubdomain)
      : '';
    this.setState(
      {
        enteredSubdomain,
        subdomain,
        purchaseMode: false
      },
      () => {
        subdomain.length > 0 ? resolveDomain(subdomain + constants.esDomain) : resetTx();
      }
    );
  };

  /**
   *
   * @desc Calculate the cost of the subdomain registration transaction and
   * compare that to the available balance in the user's wallet. Returns true
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
   * @desc Handle the click event from the purchase button
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
      () => {
        this.setTxFields();
      }
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
      setToField,
      setValueField,
      inputData,
      inputGasPrice,
      inputGasLimit,
      getNonce
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
   * @desc Returns the address of the ETHSimple subdomain registrar
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
   * @desc Returns the value parameter for a subdomain registration tx denominated in Wei
   * @returns {Wei}
   */
  private getTxValue = (): Wei => {
    return Wei(constants.subdomainPriceWei);
  };

  /**
   *
   * @desc Returns the encoded data parameter for a subdomain registration tx
   * @returns {string}
   */
  private getTxData = (): string => {
    const { address, subdomain, esRegistrar } = this.state;
    const { esFullDomainNamehash, esFullDomain, publicResolverAddr, emptyContentHash } = constants;
    const inputs = {
      _node: esFullDomainNamehash,
      _label: bufferToHex(sha3(subdomain)),
      _newNode: getNameHash(subdomain + esFullDomain),
      _resolver: publicResolverAddr,
      _owner: address,
      _resolvedAddress: address,
      _contentHash: emptyContentHash
    } as any;
    return esRegistrar.purchaseSubdomain.encodeInput(
      Object.keys(inputs).reduce((accu, key) => ({ ...accu, [key]: inputs[key] }), {})
    );
  };

  /**
   *
   * @desc Returns the gas price parameter for a subdomain registration tx
   * @returns {string}
   */
  private getTxGasPrice = (): string => {
    const { gasEstimates } = this.props;
    return !!gasEstimates ? gasEstimates.fast.toString() : constants.purchaseSubdomainGasPrice;
  };

  /**
   *
   * @desc Returns the hex-encoded gas limit parameter for a subdomain registration tx
   * @returns {string}
   */
  private getTxGasLimit = (): string => {
    return bufferToHex(new BN(constants.purchaseSubdomainGasLimit));
  };

  /**
   *
   * @desc Returns true if the purchase button has been clicked, a signature is not
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
   * @desc Returns true if the recent tx was successfully broadcasted
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
   * @desc Returns true if the recent tx attempted to broadcast and the broadcast failed
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
   * @desc Returns true if the recent tx was successfully broadcasted
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
   * @desc Pass the purchased subdomain name to the AccountAddress component, close
   * the tx broadcasted notification, show the tx confirmed notification, refresh the account's
   * balance, and refresh the newly registered domain's resolution data
   */
  private purchaseComplete = () => {
    this.props.subdomainPurchased(this.state.subdomain + constants.esFullDomain);
    this.closeTxBroadcastedNotification();
    this.showTxConfirmedNotification();
    this.setState({ purchaseMode: false }, () => {
      this.props.refreshBalance();
      setTimeout(this.refreshDomainResolution, 3000);
    });
  };

  /**
   *
   * @desc Refresh the resolution data for a recently registered domain name
   */
  private refreshDomainResolution = () => {
    const { resolveDomain } = this.props;
    resolveDomain(this.state.subdomain + constants.esDomain, true);
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
    if (
      !!currentTxStatus &&
      (currentTxStatus.broadcastSuccessful || currentTxStatus.isBroadcasting)
    ) {
      return showNotification(
        'warning',
        'The current transaction is already broadcasting or has been successfully broadcasted'
      );
    }
    this.setState({ showModal: true });
  };

  private cancelModal = () => this.closeModal(true);

  /**
   *
   * @desc Close the tx confirmation modal, if closedByUser then
   * enable the purchase button. Toggle auto gas estimation
   */
  private closeModal = (closedByUser: boolean) => {
    const { autoGasLimit, toggleAutoGasLimit } = this.props;
    this.setState(
      {
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
    isResolving: ensSelectors.getResolvingDomain(state),
    nonceStatus: transactionNetworkSelectors.getNetworkStatus(state).getNonceStatus,
    gasEstimation: transactionNetworkSelectors.getNetworkStatus(state).gasEstimationStatus,
    network: configSelectors.getNetworkConfig(state),
    checksum: configSelectors.getChecksumAddressFn(state),
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
  resetTx: transactionFieldsActions.resetTransactionRequested,
  signTx: transactionSignActions.signTransactionRequested,
  fetchTxData: transactionsActions.fetchTransactionData,
  refreshBalance: walletActions.refreshAccountBalance,
  toggleAutoGasLimit: configMetaActions.toggleAutoGasLimit
};

export default connect(mapStateToProps, mapDispatchToProps)(ETHSimpleClass);
