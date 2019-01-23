import React from 'react';
import { IBaseSubdomainRequest } from 'libs/ens';
import { NewTabLink, Address } from 'components/ui';
import translate from 'translations';
const lookupLink = (name: string) => `https://etherscan.io/enslookup?q=${name}`;

type ChildrenProps = any;

const MonoTd = ({ children }: ChildrenProps) => <td className="mono">{children}</td>;

export const SubdomainNameOwned: React.SFC<IBaseSubdomainRequest> = ({
  name,
  labelHash,
  nameHash,
  ownerAddress,
  resolvedAddress
}) => (
  <section>
    <div className="ens-title">
      <h1 className="text-center">
        {translate('ENS_SUBDOMAIN_REGISTERED', { $name: name + '.eth' })}
      </h1>
    </div>
    <div className="ens-table-wrapper">
      <table className="table table-striped">
        <tbody>
          <tr>
            <td>{translate('NAME_OWNED_NAME')}:</td>
            <MonoTd>
              <NewTabLink content={`${name}.eth`} href={lookupLink(`${name}.eth`)} />
            </MonoTd>
          </tr>
          <tr>
            <td>{translate('NAME_OWNED_LABELHASH', { name })}:</td>
            <MonoTd>{labelHash}</MonoTd>
          </tr>
          <tr>
            <td>{translate('NAME_OWNED_NAMEHASH', { name })}: </td>
            <MonoTd>{nameHash}</MonoTd>
          </tr>
          <tr>
            <td>{translate('NAME_OWNED_OWNER')}:</td>
            <MonoTd>
              <Address address={ownerAddress} />
            </MonoTd>
          </tr>
          <tr>
            <td>{translate('NAME_OWNED_RESOLVED_ADDR')}:</td>
            <MonoTd>
              <Address address={resolvedAddress} />
            </MonoTd>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
);
