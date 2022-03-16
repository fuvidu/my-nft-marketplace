const deployMarketplace = async (nftContractAddress) => {
  console.log('Deploying marketplace');
  const MarketPlace = await ethers.getContractFactory('Marketplace');

  const market = await MarketPlace.deploy(nftContractAddress);
  await market.deployed();
  console.log('Marketplace deployed to address:', market.address);
};

const deployNFT = async () => {
  const NFT = await ethers.getContractFactory('NFT');

  const appNFT = await NFT.deploy();
  await appNFT.deployed();
  console.log('NFT contract deployed to address:', appNFT.address);

  return appNFT.address;
};

async function main() {
  const nftContractAddress = await deployNFT();
  await deployMarketplace(nftContractAddress);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
