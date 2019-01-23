import { ABIFunc, ABIFuncParamless } from '../AbiFunc';

export interface IReverse {
  ens: ABIFuncParamless<{ ensAddress: address }>;
  defaultResolver: ABIFuncParamless<{ defaultResolverAddress: address }>;
  claimWithResolver: ABIFunc<{ owner: address; resolver: address }, { node: bytes32 }>;
  claim: ABIFunc<{ owner: address }, { node: bytes32 }>;
  node: ABIFunc<{ addr: address }, { ret: bytes32 }>;
  setName: ABIFunc<{ name: string }, { node: bytes32 }>;
  name: ABIFunc<{ '0': bytes32 }, { name: string }>;
}

type bytes32 = any;
type address = any;
