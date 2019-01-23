import React from 'react';

import translate from 'translations';
import { IBaseSubdomainRequest } from 'libs/ens';

export const SubdomainNameUnregistered: React.SFC<IBaseSubdomainRequest> = props => (
  <section className="row">
    <section className="auction-info text-center">
      <div className="ens-title">
        <h1>{translate('ENS_SUBDOMAIN_UNREGISTERED', { $name: props.name + '.eth' })}</h1>
      </div>
    </section>
  </section>
);
