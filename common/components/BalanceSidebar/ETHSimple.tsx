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
import { getTransactionFields } from 'libs/transaction/utils/ether';
import { Input, Spinner } from 'components/ui';
import { ConfirmationModal } from 'components/ConfirmationModal';
import { translate, translateRaw } from 'translations';
import './ETHSimple.scss';
const constants = require('./ETHSimpleConstants.json');

interface StateProps {
  domainRequests: AppState['ens']['domainRequests'];
  nonceStatus: AppState['transaction']['network']['getNonceStatus'];
  gasEstimationStatus: AppState['transaction']['network']['gasEstimationStatus'];
  notifications: AppState['notifications'];
  isResolving: boolean | null;
  networkConfig: ReturnType<typeof configSelectors.getNetworkConfig>;
  toChecksumAddress: ReturnType<typeof configSelectors.getChecksumAddressFn>;
  txDatas: AppState['transactions']['txData'];
  transactionBroadcasted: boolean | null;
  signaturePending: AppState['transaction']['sign']['pending'];
  signedTx: boolean;
  isFullTransaction: boolean;
  currentTransactionStatus: false | transactionBroadcastTypes.ITransactionStatus | null;
  transaction: EthTx;
  etherBalance: AppState['wallet']['balance']['wei'];
  gasEstimates: AppState['gas']['estimates'];
  gasPrice: AppState['transaction']['fields']['gasPrice'];
  autoGasLimitEnabled: AppState['config']['meta']['autoGasLimit'];
}

interface DispatchProps {
  resolveDomainRequested: ensActions.TResolveDomainRequested;
  showNotification: notificationsActions.TShowNotification;
  closeNotification: notificationsActions.TCloseNotification;
  setToField: transactionFieldsActions.TSetToField;
  setValueField: transactionFieldsActions.TSetValueField;
  inputData: transactionFieldsActions.TInputData;
  inputGasLimit: transactionFieldsActions.TInputGasLimit;
  inputGasPrice: transactionFieldsActions.TInputGasPrice;
  getNonceRequested: transactionNetworkActions.TGetNonceRequested;
  resetTransactionRequested: transactionFieldsActions.TResetTransactionRequested;
  signTransactionRequested: transactionSignActions.TSignTransactionRequested;
  fetchTransactionData: transactionsActions.TFetchTransactionData;
  refreshAccountBalance: walletActions.TRefreshAccountBalance;
  toggleAutoGasLimit: configMetaActions.TToggleAutoGasLimit;
}

interface OwnProps {
  wallet: IWallet;
  subdomainPurchased(label: string): void;
}

type Props = StateProps & DispatchProps & OwnProps;

interface State {
  ethSimpleSubdomainRegistrarInstance: Contract;
  subdomain: string;
  address: string;
  purchaseButtonClicked: boolean;
  initialPollRequested: boolean;
  pollTimeout: boolean;
  showModal: boolean;
  broadcastedHash: string;
}

class ETHSimpleClass extends React.Component<Props, State> {
  public state = {
    ethSimpleSubdomainRegistrarInstance: new Contract(constants.subdomainRegistrarABI),
    subdomain: '',
    address: '',
    purchaseButtonClicked: false,
    initialPollRequested: false,
    pollTimeout: false,
    showModal: false,
    txBroadcasted: false,
    broadcastedHash: ''
  };

  public componentDidMount() {
    this.setAddress();
  }

  public componentDidUpdate(prevProps: Props) {
    const { txDatas, currentTransactionStatus, wallet, networkConfig } = this.props;
    const { pollTimeout, purchaseButtonClicked } = this.state;
    if (wallet !== prevProps.wallet || networkConfig !== prevProps.networkConfig) {
      this.setAddress();
    }
    if (purchaseButtonClicked) {
      if (this.signTxIntended() && this.txFieldsValid()) {
        this.signTx();
      }
      if (currentTransactionStatus !== prevProps.currentTransactionStatus) {
        if (this.txBroadcastSuccessful()) {
          this.setState({
            broadcastedHash: (currentTransactionStatus as any).broadcastedHash,
            initialPollRequested: true
          });
          this.pollForTxReceipt();
        } else if (this.txBroadcastFailed(prevProps)) {
          this.setState({ purchaseButtonClicked: false });
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

  private setAddress = () => {
    const { toChecksumAddress, wallet } = this.props;
    const address = toChecksumAddress(wallet.getAddressString());
    this.setState({ address });
  };

  public render() {
    const { subdomain, address } = this.state;
    const { domainRequests, networkConfig } = this.props;
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
    const statusLabel =
      this.state.subdomain.length > 0
        ? this.generateStatusLabel(isValidRequestData, isAvailableDomain, ownedByThisAddress)
        : null;
    const modal = this.generateModal();
    const esLogoButton = this.generateESLogoButton();
    const component = constants.supportedNetworks.includes(networkConfig.id) ? (
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

  private generateDescription = (): React.ReactElement<any> => {
    const { address, subdomain } = this.state;
    const { networkConfig } = this.props;
    const { supportedNetworks, esFullDomain, placeholderDomain, defaultDescAddr } = constants;
    const addressToDisplay = address.length > 0 ? address : defaultDescAddr;
    const domainName =
      subdomain.length > 0
        ? ((subdomain + esFullDomain) as string)
        : ((placeholderDomain + esFullDomain) as string);
    const cutoff = subdomain.length > 0 && subdomain.length < 5 ? 0 : 15;
    const addr =
      addressToDisplay.substring(0, addressToDisplay.length - cutoff) + (cutoff > 0 ? '...' : '');
    const supportedNetwork = (supportedNetworks as string[]).includes(networkConfig.id);
    const descriptionText = supportedNetwork ? 'ETHSIMPLE_DESC' : 'ETHSIMPLE_UNSUPPORTED_NETWORK';
    const textVariables = supportedNetwork
      ? { $domain: domainName, $addr: addr }
      : { $network: networkConfig.id };
    return translate(descriptionText, textVariables as any);
  };

  private generateSubdomainInputField = (): React.ReactElement<any> => {
    const { subdomain } = this.state;
    const { placeholderDomain, esFullDomain } = constants;
    return (
      <div className="input-group-wrapper">
        <label className="input-group input-group-inline">
          <Input
            className="ETHSimple-name ETHSimple-name-input border-rad-right-0"
            value={subdomain}
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
    const { purchaseButtonClicked, subdomain } = this.state;
    const { isResolving, gasEstimationStatus } = this.props;
    const purchaseDisabled =
      (isResolving && !isValidRequestData) ||
      purchaseButtonClicked ||
      subdomain.length < 1 ||
      !isAvailableDomain ||
      ownedByThisAddress ||
      this.insufficientEtherBalance() ||
      gasEstimationStatus === transactionNetworkTypes.RequestStatus.REQUESTED;
    const buttonTitle = translate('ETHSIMPLE_ACTION', {
      $domainPriceEth: constants.subdomainPriceETH
    });
    return (
      <button
        className="ETHSimple-button btn btn-primary btn-block"
        disabled={purchaseDisabled}
        onClick={this.purchaseSubdomain}
      >
        {buttonTitle}
      </button>
    );
  };

  private generateStatusLabel = (
    isValidRequestData: boolean,
    isAvailableDomain: boolean,
    ownedByThisAddress: boolean
  ): React.ReactElement<any> => {
    const { subdomain, purchaseButtonClicked, initialPollRequested } = this.state;
    const { isResolving, domainRequests } = this.props;
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

    if (purchaseButtonClicked) {
      className = warningClass;
      icon = spinnerIcon;
      label = initialPollRequested
        ? translate('ETHSIMPLE_STATUS_WAIT_FOR_MINE')
        : translate('ETHSIMPLE_STATUS_WAIT_FOR_USER_CONFIRM');
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
   * @desc Called on changes to the subdomain input field. Updates the subdomain string and sets purchaseButtonClicked to false. On the callback it requests resolution of the domain and
   */
  private onChange = (event: React.FormEvent<HTMLInputElement>) => {
    const { resolveDomainRequested, networkConfig, resetTransactionRequested } = this.props;
    const subdomain = normalise(event.currentTarget.value.trim().toLowerCase());
    this.setState(
      {
        subdomain,
        purchaseButtonClicked: false
      },
      () => {
        subdomain.length > 0
          ? resolveDomainRequested(subdomain + constants.esDomain, networkConfig.isTestnet)
          : resetTransactionRequested();
      }
    );
  };

  /**
   *
   * @desc Calculates the cost of the subdomain registration transaction and compares that to the available balance in the user's wallet. Returns true if the balance is insufficient to make the purchase
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
    const { autoGasLimitEnabled, toggleAutoGasLimit, gasEstimationStatus } = this.props;
    ev.preventDefault();
    if (autoGasLimitEnabled) {
      toggleAutoGasLimit();
    }
    if (gasEstimationStatus === transactionNetworkTypes.RequestStatus.REQUESTED) {
      return;
    }
    this.setState(
      {
        purchaseButtonClicked: true,
        initialPollRequested: false
      },
      () => {
        this.setTxFields();
      }
    );
  };

  /**
   *
   * @desc Sets the fields of the tx singleton with the desired parameters of a new subdomain registration and requests the nonce if needed
   */
  private setTxFields = () => {
    const {
      nonceStatus,
      setToField,
      setValueField,
      inputData,
      inputGasPrice,
      inputGasLimit,
      getNonceRequested
    } = this.props;
    const txAddress = this.getTxAddress();
    const txValue = this.getTxValue();
    const txData = this.getTxData();
    const txGasPrice = this.getTxGasPrice();
    const txGasLimit = this.getTxGasLimit();
    if (
      nonceStatus !== transactionNetworkTypes.RequestStatus.SUCCEEDED &&
      nonceStatus !== transactionNetworkTypes.RequestStatus.REQUESTED
    ) {
      getNonceRequested();
    }
    setToField({ raw: txAddress, value: Address(txAddress) });
    setValueField({ raw: fromWei(txValue, 'ether'), value: txValue });
    inputData(txData);
    inputGasPrice(txGasPrice);
    inputGasLimit(txGasLimit);
  };

  /**
   *
   * @desc Returns the address of the ETHSimple subdomain registrar contract, which is dependent on the configured network
   * @returns {string}
   */
  private getTxAddress = (): string => {
    const { subdomainRegistrarAddr } = constants;
    return this.props.networkConfig.isTestnet
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
    const { address, subdomain, ethSimpleSubdomainRegistrarInstance } = this.state;
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
    return ethSimpleSubdomainRegistrarInstance.purchaseSubdomain.encodeInput(
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
   * @desc Returns true if the purchase button has been clicked, a signature is not pending, the tx has not been signed, and gas estimation has not been requested
   * @returns {boolean}
   */
  private signTxIntended = (): boolean => {
    const { signaturePending, signedTx, gasEstimationStatus } = this.props;
    return (
      this.state.purchaseButtonClicked &&
      !signaturePending &&
      !signedTx &&
      gasEstimationStatus !== transactionNetworkTypes.RequestStatus.REQUESTED
    );
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
    const txValue = addHexPrefix(unpad(bufferToHex(this.getTxValue())));
    const txData = this.getTxData();
    const txGasPrice = addHexPrefix(
      unpad(bufferToHex(gasPriceToBase(Number(this.getTxGasPrice()))))
    );
    const txGasLimit = addHexPrefix(unpad(this.getTxGasLimit()));
    return (
      isFullTransaction &&
      txFields.to === txAddress &&
      txFields.data === txData &&
      txFields.value === txValue &&
      txFields.gasPrice === txGasPrice &&
      txFields.gasLimit === txGasLimit &&
      nonceStatus === transactionNetworkTypes.RequestStatus.SUCCEEDED
    );
  };

  /**
   *
   * @desc Sign the tx and open the confirmation modal
   */
  private signTx = () => {
    const { signTransactionRequested, transaction } = this.props;
    signTransactionRequested(transaction);
    this.openModal();
  };

  /**
   *
   * @desc Returns true if the recent tx was successfully broadcasted and the tx confirmation poll has not been started
   * @returns {boolean}
   */
  private txBroadcastSuccessful = (): boolean => {
    const { currentTransactionStatus } = this.props;
    const { purchaseButtonClicked, initialPollRequested } = this.state;
    return (
      purchaseButtonClicked &&
      !initialPollRequested &&
      !!currentTransactionStatus &&
      currentTransactionStatus &&
      currentTransactionStatus.broadcastSuccessful &&
      !!currentTransactionStatus.broadcastedHash
    );
  };

  /**
   *
   * @desc Returns true if the recent tx attempted to broadcast and the broadcast failed
   * @param {Props}
   * @returns {boolean}
   */
  private txBroadcastFailed = (prevProps: Props): boolean => {
    const { currentTransactionStatus } = this.props;
    return (
      this.state.purchaseButtonClicked &&
      !!currentTransactionStatus &&
      !!prevProps.currentTransactionStatus &&
      !prevProps.currentTransactionStatus.broadcastSuccessful &&
      prevProps.currentTransactionStatus.isBroadcasting &&
      !currentTransactionStatus.broadcastSuccessful &&
      !currentTransactionStatus.isBroadcasting
    );
  };

  /**
   *
   * @desc Returns true if the recent tx was successfully broadcasted and the tx receipt has been retrieved and shows a success status
   * @returns {boolean}
   */
  private txConfirmed = (): boolean => {
    const { purchaseButtonClicked, initialPollRequested, broadcastedHash } = this.state;
    const { txDatas } = this.props;
    return (
      purchaseButtonClicked &&
      initialPollRequested &&
      !!txDatas[broadcastedHash] &&
      !!txDatas[broadcastedHash].receipt &&
      !!(txDatas[broadcastedHash].receipt as TransactionReceipt).status &&
      (txDatas[broadcastedHash].receipt as TransactionReceipt).status === 1
    );
  };

  /**
   *
   * @desc Passes the purchased subdomain name to the AccountAddress component, closes the tx broadcasted notification, shows the tx confirmed notification, refreshes the account's balance, and refreshes the newly registered domain's resolution data
   */
  private purchaseComplete = () => {
    this.props.subdomainPurchased(this.state.subdomain + constants.esFullDomain);
    this.closeTxBroadcastedNotification();
    this.showTxConfirmedNotification();
    this.setState({ purchaseButtonClicked: false }, () => {
      this.props.refreshAccountBalance();
      setTimeout(this.refreshDomainResolution, 3000);
    });
  };

  /**
   *
   * @desc Refreshes the resolution data for a recently registered domain name
   */
  private refreshDomainResolution = () => {
    const { resolveDomainRequested, networkConfig } = this.props;
    resolveDomainRequested(
      this.state.subdomain + constants.esDomain,
      networkConfig.isTestnet,
      true
    );
  };

  /**
   *
   * @desc Finds the tx broadcasted notification and closes it
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
   * @desc Builds a success notification for a confirmed tx and shows it for 10 seconds
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
    const { currentTransactionStatus, showNotification } = this.props;
    if (
      !!currentTransactionStatus &&
      (currentTransactionStatus.broadcastSuccessful || currentTransactionStatus.isBroadcasting)
    ) {
      return showNotification(
        'warning',
        'The current transaction is already broadcasting or has been successfully broadcasted'
      );
    }
    this.setState({ showModal: true });
  };

  public UNSAFE_componentWillReceiveProps(nextProps: Props) {
    if (nextProps.transactionBroadcasted && this.state.showModal) {
      this.closeModal(false);
    }
  }

  private cancelModal = () => this.closeModal(true);

  private closeModal = (closedByUser: boolean) => {
    const { autoGasLimitEnabled, toggleAutoGasLimit } = this.props;
    this.setState(
      {
        showModal: false,
        purchaseButtonClicked: !closedByUser
      },
      () => {
        if (!autoGasLimitEnabled) {
          toggleAutoGasLimit();
        }
      }
    );
  };

  private pollForTxReceipt = () => setTimeout(this.fetchTxReceipt, 10000);

  /**
   *
   * @desc Fetches the receipt of the broadcasted tx
   */
  private fetchTxReceipt = () => {
    this.setState({ pollTimeout: false }, () => {
      const { fetchTransactionData } = this.props;
      const { purchaseButtonClicked, broadcastedHash } = this.state;
      if (purchaseButtonClicked && !!broadcastedHash) {
        fetchTransactionData(broadcastedHash);
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
    gasEstimationStatus: transactionNetworkSelectors.getNetworkStatus(state).gasEstimationStatus,
    networkConfig: configSelectors.getNetworkConfig(state),
    toChecksumAddress: configSelectors.getChecksumAddressFn(state),
    gasEstimates: gasSelectors.getEstimates(state),
    gasPrice: transactionFieldsSelectors.getGasPrice(state),
    autoGasLimitEnabled: configMetaSelectors.getAutoGasLimitEnabled(state),
    notifications: state.notifications,
    ...derivedSelectors.getTransaction(state),
    txDatas: transactionsSelectors.getTransactionDatas(state),
    currentTransactionStatus: transactionSelectors.getCurrentTransactionStatus(state),
    transactionBroadcasted: transactionSelectors.currentTransactionBroadcasted(state),
    signaturePending: derivedSelectors.signaturePending(state).isSignaturePending,
    signedTx:
      !!transactionSignSelectors.getSignedTx(state) || !!transactionSignSelectors.getWeb3Tx(state)
  };
}

const mapDispatchToProps: DispatchProps = {
  showNotification: notificationsActions.showNotification,
  closeNotification: notificationsActions.closeNotification,
  resolveDomainRequested: ensActions.resolveDomainRequested,
  setToField: transactionFieldsActions.setToField,
  setValueField: transactionFieldsActions.setValueField,
  inputData: transactionFieldsActions.inputData,
  inputGasLimit: transactionFieldsActions.inputGasLimit,
  inputGasPrice: transactionFieldsActions.inputGasPrice,
  getNonceRequested: transactionNetworkActions.getNonceRequested,
  resetTransactionRequested: transactionFieldsActions.resetTransactionRequested,
  signTransactionRequested: transactionSignActions.signTransactionRequested,
  fetchTransactionData: transactionsActions.fetchTransactionData,
  refreshAccountBalance: walletActions.refreshAccountBalance,
  toggleAutoGasLimit: configMetaActions.toggleAutoGasLimit
};

export default connect(mapStateToProps, mapDispatchToProps)(ETHSimpleClass);
