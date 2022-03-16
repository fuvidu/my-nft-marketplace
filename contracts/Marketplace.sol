//SPDX-License-Identifier: MIT

pragma solidity ^0.8.4;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/utils/Counters.sol";

contract Marketplace is Ownable {
  using Counters for Counters.Counter;

  struct Order {
    uint256 tokenId;
    address seller;
    address buyer;
    uint256 price;
  }

  IERC721 public immutable nftContract;
  event OrderAdded(
    uint256 orderId,
    uint256 indexed tokenId,
    address indexed seller,
    uint256 price
  );
  event OrderCancelled(uint256 orderId);
  event OrderExecuted(
    uint256 orderId,
    uint256 indexed tokenId,
    address indexed seller,
    address indexed buyer,
    uint256 price
  );

  mapping(uint256 => Order) public orders;
  Counters.Counter public orderId;

  constructor(address nftContractAddress_) {
    nftContract = IERC721(nftContractAddress_);
  }

  function addOrder(uint256 tokenId_, uint256 price_) public returns (bool) {
    require(
      nftContract.ownerOf(tokenId_) == _msgSender(),
      "Only onwer can put item for sale"
    );
    require(
      nftContract.getApproved(tokenId_) == address(this) ||
        nftContract.isApprovedForAll(_msgSender(), address(this)),
      "NFT is not approved for sale yet"
    );

    nftContract.transferFrom(_msgSender(), address(this), tokenId_);

    uint256 _orderId = orderId.current();
    Order storage order = orders[_orderId];
    order.tokenId = tokenId_;
    order.seller = _msgSender();
    order.buyer = address(0);
    order.price = price_;
    orderId.increment();

    emit OrderAdded(_orderId, tokenId_, _msgSender(), price_);
    return true;
  }

  function cancelOrder(uint256 orderId_) public returns (bool) {
    Order memory order = orders[orderId_];
    require(order.buyer == address(0), "Item is already bought, cannot cancel");
    require(order.seller == _msgSender(), "Only onwer can cancel the order");

    uint256 _tokenId = order.tokenId;
    delete orders[orderId_];

    nftContract.transferFrom(address(this), _msgSender(), _tokenId);

    emit OrderCancelled(orderId_);
    return true;
  }

  function executeOrder(uint256 orderId_) public payable returns (bool) {
    Order storage order = orders[orderId_];
    uint256 price = msg.value;

    require(order.seller != address(0), "Order does not exist");
    require(
      order.seller != _msgSender(),
      "Seller must be different than buyer"
    );
    require(order.price == price, "Price has changed");
    require(order.buyer == address(0), "Order is already bought");

    order.buyer = _msgSender();
    nftContract.transferFrom(address(this), _msgSender(), order.tokenId);

    (bool successful, ) = payable(order.seller).call{value: price}("");
    require(successful, "Failed to transfer money to seller");

    emit OrderExecuted(
      orderId_,
      order.tokenId,
      order.seller,
      order.buyer,
      price
    );

    return true;
  }
}
