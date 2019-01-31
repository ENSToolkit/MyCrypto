import React from 'react';
import { connect } from 'react-redux';

import { ensActions } from 'features/ens';
import { translate, translateRaw } from 'translations';
import { Input, Spinner } from 'components/ui';

interface DispatchProps {
  reverseResolve: ensActions.TReverseResolveAddressRequested;
}

interface OwnProps {
  address: string;
  showPurchase: boolean;
  publicName: string;
  editingPublicName: boolean;
  isComplete: boolean;
  purchasedSubdomainLabel: string | null;
  setName(name: string): void;
  setPublicNameRef(node: HTMLInputElement): HTMLInputElement;
  stopEditingPublicName(): void;
  temporaryPublicNameUpdated(name: string): void;
  handlePublicNameContentBlur(): void;
}

interface State {
  publicNameError: boolean;
  publicNameInputTouched: boolean;
}

type Props = DispatchProps & OwnProps;

class AccountPublicNameContentClass extends React.Component<Props, State> {
  public state = {
    publicNameError: false,
    publicNameInputTouched: false
  };

  public render() {
    const {
      publicName,
      isComplete,
      showPurchase,
      setPublicNameRef,
      editingPublicName,
      purchasedSubdomainLabel
    } = this.props;
    const { publicNameError } = this.state;
    const inputFieldValue =
      showPurchase && !!purchasedSubdomainLabel ? purchasedSubdomainLabel : publicName;
    return editingPublicName ? (
      <React.Fragment>
        <Input
          title={translateRaw('ADD_PUBLIC_NAME')}
          placeholder={translateRaw('NEW_PUBLIC_NAME')}
          defaultValue={inputFieldValue}
          onChange={this.handlePublicNameChange}
          onKeyDown={this.handlePublicNameKeyDown}
          onBlur={this.props.handlePublicNameContentBlur}
          showInvalidBeforeBlur={true}
          setInnerRef={setPublicNameRef}
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
              {purchasedSubdomainLabel}
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
  }

  private handlePublicNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const temporaryPublicName = e.target.value;
    const err = typeof temporaryPublicName !== 'string';
    this.props.temporaryPublicNameUpdated(temporaryPublicName);
    this.setState({ publicNameError: err });
  };

  private handlePublicNameKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    switch (e.key) {
      case 'Enter':
        return this.props.stopEditingPublicName();
      case 'Escape':
        return this.handleEscape();
    }
  };

  private handleEscape = () => {
    const { publicName, temporaryPublicNameUpdated, handlePublicNameContentBlur } = this.props;
    temporaryPublicNameUpdated(publicName);
    handlePublicNameContentBlur();
  };

  /**
   *
   * @desc Refresh the reverse resolution data for the address
   */
  private refreshAddressResolution = () => {
    const { reverseResolve, address } = this.props;
    reverseResolve(address, true);
  };
}

const mapDispatchToProps: DispatchProps = {
  reverseResolve: ensActions.reverseResolveAddressRequested
};

export default connect(null, mapDispatchToProps)(AccountPublicNameContentClass);
