//SPDX-License-Identifier: MIT

pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Counters.sol";

contract NFT is ERC721URIStorage, Ownable {
  //To concatenate the URL of an NFT
  using Strings for uint256;

  using Counters for Counters.Counter;

  event BaseURISet(string baseURI);
  event NFTMinted(address indexed to, uint256 tokenId);
  event MarketplaceSet(address marketplace);

  string public baseTokenURI;

  Counters.Counter public tokenId;
  address public marketplace;

  constructor() ERC721("My NFT", "NFT") {
    baseTokenURI = "";
  }

  function _baseURI() internal view virtual override returns (string memory) {
    return baseTokenURI;
  }

  function setBaseURI(string memory baseURI_) public onlyOwner {
    require(bytes(baseURI_).length > 0, "Invalid base URI");
    baseTokenURI = baseURI_;
    emit BaseURISet(baseURI_);
  }

  function mint(string memory tokenURI_) public returns (uint256) {
    require(bytes(tokenURI_).length > 0, "Invalid token URI");
    require(marketplace != address(0), "Marketplace has not been set yet");
    tokenId.increment();
    uint256 newTokenId = tokenId.current();
    _safeMint(_msgSender(), newTokenId);
    _setTokenURI(newTokenId, tokenURI_);
    approve(marketplace, newTokenId);
    emit NFTMinted(_msgSender(), newTokenId);
    return newTokenId;
  }

  function setMarketplace(address marketplace_) public onlyOwner {
    marketplace = marketplace_;
    emit MarketplaceSet(marketplace_);
  }
}
