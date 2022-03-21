import { Contract } from 'ethers';
import { ContractTransaction } from '@ethersproject/contracts';

export default interface IMarketplace extends Contract {
  addOrder(tokenId: number, price: number, paymentToken: string): Promise<ContractTransaction>;
  cancelOrder(orderId: number): Promise<ContractTransaction>;
  executeOrderWithEther(
    orderId: number,
    overrides: { [key: string]: any },
  ): Promise<ContractTransaction>;
  executeOrderWithPaymentToken(
    orderId: number,
    price: number,
    paymentTokenAddress: string,
  ): Promise<ContractTransaction>;
  addPaymentToken(address: string, rate: number): Promise<ContractTransaction>;
  removePaymentToken(address: string): Promise<ContractTransaction>;
  setCommisionRate(commissionRate: number): Promise<ContractTransaction>;
  setCommissionBeneficiary(beneficiary: string): Promise<ContractTransaction>;
}
