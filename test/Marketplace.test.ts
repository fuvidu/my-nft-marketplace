import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
const { ethers } = require('hardhat');
const { expect } = require('chai');
import INFT from './INFT';
import IMarketplace from './IMarketplace';
import { Contract, ContractReceipt, ContractTransaction } from 'ethers';
import { Event } from 'ethers';

const SALE_PRICE = ethers.utils.parseEther('1');
const NULL_ADDRESS = '0x0000000000000000000000000000000000000000';
const GOLD_RATE = 1000;

describe('Marketplace', () => {
  let marketplaceContract: IMarketplace;
  let nftContract: INFT;
  let goldToken: Contract;
  let deployer: SignerWithAddress;
  let user1: SignerWithAddress;
  let user2: SignerWithAddress;

  async function setup() {
    [deployer, user1, user2] = await ethers.getSigners();

    nftContract = await (await ethers.getContractFactory('NFT')).deploy();
    await nftContract.deployed();

    marketplaceContract = await (
      await ethers.getContractFactory('Marketplace')
    ).deploy(nftContract.address);
    await marketplaceContract.deployed();

    await nftContract.setMarketplace(marketplaceContract.address);

    goldToken = await (await ethers.getContractFactory('Gold')).deploy();
    await goldToken.deployed();

    await goldToken.transfer(user1.address, 10000);
    await goldToken.transfer(user2.address, 20000);

    await marketplaceContract.addPaymentToken(goldToken.address, GOLD_RATE);
  }

  beforeEach(setup);

  describe('create order', () => {
    it('should not allow owner to create order if the marketplace is not approved by the owner', async () => {
      const marketplace2 = await (
        await ethers.getContractFactory('Marketplace')
      ).deploy(nftContract.address);
      await nftContract.setMarketplace(marketplace2.address);

      const tokenId = await mintNFT(nftContract);
      await expect(marketplaceContract.addOrder(tokenId, SALE_PRICE, NULL_ADDRESS)).to.be.reverted;
    });

    it('should not allow none-owner to create order', async () => {
      const tokenId = await mintNFT((await nftContract.connect(user1)) as unknown as INFT);
      await expect(marketplaceContract.addOrder(tokenId, SALE_PRICE, NULL_ADDRESS)).to.be.reverted;
    });

    it('should not allow to create order for none-existence token id', async () => {
      const tokenId = await mintNFT((await nftContract.connect(user1)) as unknown as INFT);
      const noneExistenceTokenId = tokenId + 1;
      await expect(marketplaceContract.addOrder(noneExistenceTokenId, SALE_PRICE, NULL_ADDRESS)).to
        .be.reverted;
    });

    it('should raise OrderAdded event', async () => {
      const tokenId = await mintNFT(nftContract);
      const [_orderId, _tokenId, _seller, _salePrice] = await createOrder(
        marketplaceContract,
        tokenId,
        SALE_PRICE,
        NULL_ADDRESS,
      );

      expect(_tokenId).to.equals(tokenId);
      expect(_seller).to.equals(deployer.address);
      expect(_salePrice).to.equals(SALE_PRICE);
    });
  });

  describe('cancel order', () => {
    it('should not allow non-seller to cancel order', async () => {
      const tokenId = await mintNFT((await nftContract.connect(user1)) as unknown as INFT);
      const [_orderId] = await createOrder(
        (await marketplaceContract.connect(user1)) as unknown as IMarketplace,
        tokenId,
        SALE_PRICE,
        NULL_ADDRESS,
      );
      await expect(marketplaceContract.cancelOrder(tokenId)).to.be.reverted;
    });

    it('should allow seller to cancel order', async () => {
      const tokenId = await mintNFT(nftContract);
      const [_orderId, _tokenId, _seller, _salePrice] = await createOrder(
        marketplaceContract,
        tokenId,
        SALE_PRICE,
        NULL_ADDRESS,
      );
      await marketplaceContract.cancelOrder(_orderId);
      await expect(await nftContract.ownerOf(tokenId)).to.equals(deployer.address);
    });

    it('should raise OrderCancelled event', async () => {
      const tokenId = await mintNFT(nftContract);
      const [orderId] = await createOrder(marketplaceContract, tokenId, SALE_PRICE, NULL_ADDRESS);
      const cancelOrderTransaction: ContractTransaction = await marketplaceContract.cancelOrder(
        orderId,
      );
      const addOrderReceipt = await cancelOrderTransaction.wait();
      const event = addOrderReceipt?.events?.find(
        (event: Event) => event.event === 'OrderCancelled',
      );
      const [_oderId] = event?.args ? event?.args : [];
      expect(_oderId).to.equals(orderId);
    });
  });

  describe('execute order with ether', () => {
    it('should throw if order does not exist', async () => {
      const tokenId = await mintNFT(nftContract);
      const [orderId] = await createOrder(marketplaceContract, tokenId, SALE_PRICE, NULL_ADDRESS);
      const doesNotExitOrderId = orderId + 1;
      await expect(
        marketplaceContract.executeOrderWithEther(doesNotExitOrderId, { value: SALE_PRICE }),
      ).to.be.revertedWith('Order does not exist');
    });

    it('should throw if buyer and seller are same', async () => {
      const tokenId = await mintNFT(nftContract);
      const [orderId] = await createOrder(marketplaceContract, tokenId, SALE_PRICE, NULL_ADDRESS);
      await expect(
        marketplaceContract.executeOrderWithEther(orderId, {
          value: ethers.utils.parseEther('0.2'),
        }),
      ).to.be.revertedWith('Seller must be different than buyer');
    });

    it('should throw if price has changed', async () => {
      const tokenId = await mintNFT(nftContract);
      const [orderId] = await createOrder(marketplaceContract, tokenId, SALE_PRICE, NULL_ADDRESS);
      const contractWithBuyer: IMarketplace = (await marketplaceContract.connect(
        user1,
      )) as unknown as IMarketplace;
      await expect(
        contractWithBuyer.executeOrderWithEther(orderId, {
          value: ethers.utils.parseEther('0.02'),
        }),
      ).to.be.revertedWith('Price has changed');
    });

    it('should deduct ether from buyer', async () => {
      // owner mints
      const tokenId = await mintNFT(nftContract);

      // owner sells
      const [orderId] = await createOrder(marketplaceContract, tokenId, SALE_PRICE, NULL_ADDRESS);

      // buyer buys
      const marketplaceWithBuyer: IMarketplace = (await marketplaceContract.connect(
        user1,
      )) as unknown as IMarketplace;

      // verify buyer's balance
      const balanceBefore = await user1.getBalance();
      await marketplaceWithBuyer.executeOrderWithEther(orderId, { value: SALE_PRICE });
      const balanceAfter = await user1.getBalance();
      // we need to subtract for the Gas fee
      expect(balanceAfter).to.be.below(balanceBefore.sub(SALE_PRICE));
    });

    it('should add ether to seller', async () => {
      // seller mints
      const tokenId = await mintNFT((await nftContract.connect(user1)) as unknown as INFT);

      // seller sells
      const marketplaceWithSeller: IMarketplace = (await marketplaceContract.connect(
        user1,
      )) as unknown as IMarketplace;
      const [orderId] = await createOrder(marketplaceWithSeller, tokenId, SALE_PRICE, NULL_ADDRESS);

      // buyer buys
      const marketplaceWithBuyer: IMarketplace = (await marketplaceContract.connect(
        user2,
      )) as unknown as IMarketplace;
      const balanceBefore = await user1.getBalance();
      const transaction: ContractTransaction = await marketplaceWithBuyer.executeOrderWithEther(
        orderId,
        {
          value: SALE_PRICE,
        },
      );
      const receipt = await transaction.wait();
      const balanceAfter = await user1.getBalance();

      //verify seller's balance
      // some gas fee has been subtracted when transfer ether inside executeOrderWithEther
      expect(balanceAfter).to.be.above(balanceBefore.add(SALE_PRICE).sub(receipt.gasUsed));
    });

    it('should transfer NFT to buyer', async () => {
      // seller mints
      const tokenId = await mintNFT((await nftContract.connect(user1)) as unknown as INFT);
      expect(await nftContract.ownerOf(tokenId)).to.equals(user1.address);

      // seller sells
      const marketplaceWithSeller: IMarketplace = (await marketplaceContract.connect(
        user1,
      )) as unknown as IMarketplace;
      const [orderId] = await createOrder(marketplaceWithSeller, tokenId, SALE_PRICE, NULL_ADDRESS);
      expect(await nftContract.ownerOf(tokenId)).to.equals(marketplaceContract.address);

      // buyer buys
      const marketplaceWithBuyer: IMarketplace = (await marketplaceContract.connect(
        user2,
      )) as unknown as IMarketplace;
      await marketplaceWithBuyer.executeOrderWithEther(orderId, {
        value: SALE_PRICE,
      });

      expect(await nftContract.ownerOf(tokenId)).to.equals(user2.address);
    });

    it('should raise OrderExecuted event', async () => {
      // seller mints
      const tokenId = await mintNFT((await nftContract.connect(user1)) as unknown as INFT);

      // seller sells
      const marketplaceWithSeller: IMarketplace = (await marketplaceContract.connect(
        user1,
      )) as unknown as IMarketplace;
      const [orderId] = await createOrder(marketplaceWithSeller, tokenId, SALE_PRICE, NULL_ADDRESS);

      // buyer buys
      const marketplaceWithBuyer: IMarketplace = (await marketplaceContract.connect(
        user2,
      )) as unknown as IMarketplace;
      const transaction: ContractTransaction = await marketplaceWithBuyer.executeOrderWithEther(
        orderId,
        {
          value: SALE_PRICE,
        },
      );
      const receipt = await transaction.wait();
      const event = receipt.events?.find((event: Event) => event.event === 'OrderExecuted');
      const [_orderId, _tokenId, _seller, _buyer, _price] = event?.args ? event.args : [];

      expect(_orderId).to.equals(orderId);
      expect(_tokenId).to.equals(tokenId);
      expect(_seller).to.equals(user1.address);
      expect(_buyer).to.equals(user2.address);
      expect(_price).to.equals(SALE_PRICE);
    });
  });

  describe('execute order with payment token', () => {
    it('should transfer token amount from buyer to seller', async () => {
      const sellPriceInToken = 2300;
      const tokenId = await mintNFT((await nftContract.connect(user1)) as unknown as INFT);
      const sellerBalanceBefore = await goldToken.balanceOf(user1.address);
      const buyerBalanceBefore = await goldToken.balanceOf(user2.address);

      // seller sells
      const marketplaceWithSeller: IMarketplace = (await marketplaceContract.connect(
        user1,
      )) as unknown as IMarketplace;
      const [orderId] = await createOrder(
        marketplaceWithSeller,
        tokenId,
        sellPriceInToken,
        goldToken.address,
      );

      // buyer buys
      const marketplaceWithBuyer: IMarketplace = (await marketplaceContract.connect(
        user2,
      )) as unknown as IMarketplace;

      await goldToken.connect(user2).approve(marketplaceContract.address, sellPriceInToken);
      await marketplaceWithBuyer.executeOrderWithPaymentToken(
        orderId,
        sellPriceInToken,
        goldToken.address,
      );

      const sellerBalanceAfter = await goldToken.balanceOf(user1.address);
      const buyerBalanceAfter = await goldToken.balanceOf(user2.address);

      expect(sellerBalanceAfter).to.equals(sellerBalanceBefore.add(sellPriceInToken));
      expect(buyerBalanceAfter).to.equals(buyerBalanceBefore.sub(sellPriceInToken));
    });
  });
});

async function mintNFT(nftContract: INFT): Promise<number> {
  const mintTransaction: ContractTransaction = await nftContract.mint('metadata.json');
  const mintReceipt: ContractReceipt = await mintTransaction.wait();
  const mintEvent = mintReceipt?.events?.find((event: Event) => event.event === 'NFTMinted');
  const [minter, tokenId] = mintEvent?.args ? mintEvent?.args : [];
  return tokenId;
}

async function createOrder(
  marketplaceContract: IMarketplace,
  tokenId: number,
  salePrice: number,
  paymentTokenAddress: string,
) {
  const addOrderTransaction = await marketplaceContract.addOrder(
    tokenId,
    salePrice,
    paymentTokenAddress,
  );
  const addOrderReceipt = await addOrderTransaction.wait();
  const addOrderEvent = addOrderReceipt?.events?.find(
    (event: Event) => event.event === 'OrderAdded',
  );
  return addOrderEvent?.args ? addOrderEvent?.args : [];
}
