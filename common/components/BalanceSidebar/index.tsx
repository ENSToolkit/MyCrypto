import React from 'react';
import { connect } from 'react-redux';

import { AppState } from 'features/reducers';
import { walletSelectors } from 'features/wallet';
import EquivalentValues from './EquivalentValues';
import AccountInfo from './AccountInfo';
import ETHSimple from './ETHSimple';
import Promos from './Promos';
import TokenBalances from './TokenBalances';

interface Block {
  name: string;
  content: React.ReactElement<any>;
  isFullWidth?: boolean;
}

interface State {
  purchasedSubdomainLabel: string | null;
}

interface StateProps {
  wallet: AppState['wallet']['inst'];
}

export class BalanceSidebar extends React.Component<StateProps, State> {
  public state = {
    purchasedSubdomainLabel: null
  };

  public render() {
    const { wallet } = this.props;

    if (!wallet) {
      return null;
    }

    const blocks: Block[] = [
      {
        name: 'Account Info',
        content: (
          <AccountInfo
            wallet={wallet}
            purchasedSubdomainLabel={this.state.purchasedSubdomainLabel}
          />
        )
      },
      {
        name: 'ETHSimple',
        content: <ETHSimple wallet={wallet} subdomainPurchased={this.setPurchasedSubdomainLabel} />
      },
      {
        name: 'Promos',
        isFullWidth: true,
        content: <Promos />
      },
      {
        name: 'Token Balances',
        content: <TokenBalances />
      },
      {
        name: 'Equivalent Values',
        content: <EquivalentValues />
      }
    ];

    return (
      <aside>
        {blocks.map(block => (
          <section className={`Block ${block.isFullWidth ? 'is-full-width' : ''}`} key={block.name}>
            {block.content}
          </section>
        ))}
      </aside>
    );
  }

  private setPurchasedSubdomainLabel = (label: string) => {
    this.setState({ purchasedSubdomainLabel: label });
  };
}

const mapStateToProps = (state: AppState): StateProps => ({
  wallet: walletSelectors.getWalletInst(state)
});

export default connect(mapStateToProps)(BalanceSidebar);
