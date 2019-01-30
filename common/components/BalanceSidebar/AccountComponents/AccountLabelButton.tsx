import React from 'react';

import { translate, translateRaw } from 'translations';

interface OwnProps {
  buttonTitle: string;
  editingLabel: boolean;
  startEditingLabel(): void;
  stopEditingLabel(): void;
}

type Props = OwnProps;

class AccountLabelButtonClass extends React.Component<Props> {
  public render() {
    const { buttonTitle, editingLabel, startEditingLabel, stopEditingLabel } = this.props;
    const labelButton = editingLabel ? (
      <React.Fragment>
        <i className="fa fa-save" />
        <span role="button" title={translateRaw('SAVE_LABEL')} onClick={stopEditingLabel}>
          {translate('SAVE_LABEL')}
        </span>
      </React.Fragment>
    ) : (
      <React.Fragment>
        <i className="fa fa-pencil" />
        <span role="button" title={translateRaw(buttonTitle)} onClick={startEditingLabel}>
          {translate(buttonTitle)}
        </span>
      </React.Fragment>
    );
    return (
      <div className="AccountInfo-label" title={translateRaw('EDIT_LABEL_2')}>
        {labelButton}
      </div>
    );
  }
}

export default AccountLabelButtonClass;
