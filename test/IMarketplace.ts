import { Contract } from 'ethers';
import { ContractTransaction } from '@ethersproject/contracts';

export default interface IMarketplace extends Contract {
  addOrder(tokenId: number, price: number): Promise<ContractTransaction>;
  cancelOrder(orderId: number): Promise<ContractTransaction>;
  executeOrder(orderId: number, overrides: { [key: string]: any }): Promise<ContractTransaction>;
}
