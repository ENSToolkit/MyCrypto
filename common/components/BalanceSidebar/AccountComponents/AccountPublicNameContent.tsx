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
  setName: (name: string) => void;
  setPublicNameRef: (node: HTMLInputElement) => HTMLInputElement;
  stopEditingPublicName: () => void;
}

interface State {
  publicNameError: boolean;
  temporaryPublicName: string;
  publicNameInputTouched: boolean;
}

type Props = DispatchProps & OwnProps;

class AccountPublicNameContentClass extends React.Component<Props, State> {
  public state = {
    publicNameError: false,
    temporaryPublicName: '',
    publicNameInputTouched: false
  };

  public render() {
    const {
      publicName,
      isComplete,
      showPurchase,
      setPublicNameRef,
      editingPublicName
    } = this.props;
    const { publicNameError } = this.state;
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
  }

  private handlePublicNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const temporaryPublicName = e.target.value;
    const err = typeof temporaryPublicName !== 'string';
    this.setState({
      publicNameError: err,
      temporaryPublicName
    });
  };

  private handlePublicNameKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    switch (e.key) {
      case 'Enter':
        return this.handlePublicNameBlur();
      case 'Escape':
        return this.props.stopEditingPublicName();
    }
  };

  private setTemporaryPublicNameTouched = () => {
    const { publicNameInputTouched } = this.state;
    if (!publicNameInputTouched) {
      this.setState({ publicNameInputTouched: true });
    }
  };

  private handlePublicNameBlur = () => {
    const { temporaryPublicName } = this.state;
    const { publicName } = this.props;
    this.clearTemporaryPublicNameTouched();
    this.props.stopEditingPublicName();
    if (temporaryPublicName === publicName) {
      return;
    }
    if (temporaryPublicName && temporaryPublicName.length > 0) {
      this.props.setName(temporaryPublicName);
    }
  };

  private clearTemporaryPublicNameTouched = () => this.setState({ publicNameInputTouched: false });

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
