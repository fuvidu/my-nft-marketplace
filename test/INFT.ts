import { Contract } from 'ethers';
import { ContractTransaction } from 'ethers';

export default interface INFT extends Contract {
  setBaseURI(baseURI: string): Promise<ContractTransaction>;
  mint(tokenURI: string): Promise<ContractTransaction>;
  setMarketplace(address: string): Promise<ContractTransaction>;
}
