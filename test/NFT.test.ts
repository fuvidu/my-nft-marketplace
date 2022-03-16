import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { ethers } from 'hardhat';
import INFT from './INFT';
import IMarketplace from './IMarketplace';
import { ContractReceipt, ContractTransaction } from 'ethers';
import { Event } from 'ethers';

describe('NFT', () => {
  let marketplaceContract: IMarketplace;
  let nftContract: INFT;
  let deployer: SignerWithAddress;
  let user1: SignerWithAddress;

  beforeEach(async () => {
    [deployer, user1] = await ethers.getSigners();
    nftContract = (await (await ethers.getContractFactory('NFT')).deploy()) as unknown as INFT;
    await nftContract.deployed();

    marketplaceContract = (await (
      await ethers.getContractFactory('Marketplace')
    ).deploy(nftContract.address)) as unknown as IMarketplace;
    await marketplaceContract.deployed();

    await nftContract.setMarketplace(marketplaceContract.address);
  });

  describe('mint', () => {
    it('should allow owner to mint', async () => {
      const transaction: ContractTransaction = await nftContract.mint('metadata.json');
      const receipt: ContractReceipt = await transaction.wait();
      const event = receipt.events?.find((event: Event) => event.event === 'NFTMinted');
      const [minter, tokenId] = event?.args ? event?.args : [];
      expect(await nftContract.ownerOf(tokenId)).to.equals(deployer.address);
    });

    it('should allow non-owner to mint', async () => {
      const transaction: ContractTransaction = await nftContract
        .connect(user1)
        .mint('metadata.json');
      const receipt: ContractReceipt = await transaction.wait();
      const event = receipt.events?.find((event: Event) => event.event === 'NFTMinted');
      const [minter, tokenId] = event?.args ? event?.args : [];
      expect(await nftContract.ownerOf(tokenId)).to.equals(user1.address);
    });

    it('should not allow to mint empty token URI', async () => {
      await expect(nftContract.mint('')).to.be.reverted;
    });
  });

  describe('set base URI', () => {
    it('should not allow to set empty baseURI', async () => {
      await expect(nftContract.setBaseURI('')).to.be.reverted;
    });

    it('should allow owner to set baseURI', async () => {
      const newBaseURI = 'https://myserver.com/';
      const oldBaseURI = await nftContract.baseTokenURI();
      await nftContract.setBaseURI(newBaseURI);
      expect(await nftContract.baseTokenURI()).to.equals(newBaseURI);
      expect(await oldBaseURI).not.to.equals(newBaseURI);
    });

    it('should not allow non-owner to set base URI', async () => {
      await expect(nftContract.connect(user1).setBaseURI('abc')).to.be.reverted;
    });
  });

  describe('get token URI', () => {
    it('should return correct token URI', async () => {
      const newBaseURI = 'https://myserver.com/';
      await nftContract.setBaseURI(newBaseURI);

      const transaction: ContractTransaction = await nftContract.mint('metadata.json');
      const receipt: ContractReceipt = await transaction.wait();
      const event = receipt.events?.find((event: Event) => event.event === 'NFTMinted');
      const [minter, tokenId] = event?.args ? event?.args : [];

      expect(await nftContract.tokenURI(tokenId)).to.equals(newBaseURI + 'metadata.json');
    });
  });

  describe('set marketplace', () => {
    it('should not allow none-owner to set marketplace', async () => {
      await expect(nftContract.connect(user1).setMarketplace(marketplaceContract.address)).to.be
        .reverted;
    });

    it('should allow owner to set marketplace', async () => {
      await nftContract.setMarketplace(marketplaceContract.address);
      expect(await nftContract.marketplace()).to.equals(marketplaceContract.address);
    });
  });
});
