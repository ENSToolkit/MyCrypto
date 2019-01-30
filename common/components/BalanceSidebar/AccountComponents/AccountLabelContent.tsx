import React from 'react';
import { connect, MapStateToProps } from 'react-redux';

import { AppState } from 'features/reducers';
import {
  addressBookConstants,
  addressBookActions,
  addressBookSelectors
} from 'features/addressBook';
import { translateRaw } from 'translations';
import { Input } from 'components/ui';

interface StateProps {
  entry: ReturnType<typeof addressBookSelectors.getAccountAddressEntry>;
  addressLabel: string;
}

interface DispatchProps {
  changeAddressLabelEntry: addressBookActions.TChangeAddressLabelEntry;
  saveAddressLabelEntry: addressBookActions.TSaveAddressLabelEntry;
  removeAddressLabelEntry: addressBookActions.TRemoveAddressLabelEntry;
}

interface OwnProps {
  editingLabel: boolean;
  address: string;
  stopEditingLabel(): void;
  setLabelInputRef(node: HTMLInputElement): HTMLInputElement;
}

interface State {
  labelInputTouched: boolean;
}

type Props = StateProps & DispatchProps & OwnProps;

class AccountLabelContentClass extends React.Component<Props, State> {
  public state = {
    labelInputTouched: false
  };

  public render() {
    const {
      addressLabel,
      entry: { temporaryLabel, labelError },
      editingLabel,
      setLabelInputRef
    } = this.props;
    const { labelInputTouched } = this.state;
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
            setInnerRef={setLabelInputRef}
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
  }

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

  private handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    switch (e.key) {
      case 'Enter':
        return this.handleBlur();
      case 'Escape':
        return this.props.stopEditingLabel();
    }
  };

  private setTemporaryLabelTouched = () => {
    const { labelInputTouched } = this.state;

    if (!labelInputTouched) {
      this.setState({ labelInputTouched: true });
    }
  };

  private clearTemporaryLabelTouched = () => this.setState({ labelInputTouched: false });

  private handleBlur = () => {
    const {
      address,
      addressLabel,
      entry: { id, label, temporaryLabel, labelError },
      stopEditingLabel,
      saveAddressLabelEntry,
      changeAddressLabelEntry,
      removeAddressLabelEntry
    } = this.props;

    this.clearTemporaryLabelTouched();
    stopEditingLabel();

    if (temporaryLabel === addressLabel) {
      return;
    }

    if (temporaryLabel && temporaryLabel.length > 0) {
      saveAddressLabelEntry(id);

      if (labelError) {
        // If the new changes aren't valid, undo them.
        changeAddressLabelEntry({
          id,
          address,
          temporaryAddress: address,
          label,
          temporaryLabel: label,
          overrideValidation: true
        });
      }
    } else {
      removeAddressLabelEntry(id);
    }
  };
}

const mapStateToProps: MapStateToProps<StateProps, {}, AppState> = (
  state: AppState,
  ownProps: OwnProps
) => {
  const labelEntry = addressBookSelectors.getAddressLabelEntryFromAddress(state, ownProps.address);
  return {
    entry: addressBookSelectors.getAccountAddressEntry(state),
    addressLabel: labelEntry ? labelEntry.label : ''
  };
};

const mapDispatchToProps: DispatchProps = {
  changeAddressLabelEntry: addressBookActions.changeAddressLabelEntry,
  saveAddressLabelEntry: addressBookActions.saveAddressLabelEntry,
  removeAddressLabelEntry: addressBookActions.removeAddressLabelEntry
};

export default connect(mapStateToProps, mapDispatchToProps)(AccountLabelContentClass);
