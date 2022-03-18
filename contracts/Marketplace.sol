//SPDX-License-Identifier: MIT

pragma solidity ^0.8.4;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

contract Marketplace is Ownable, ReentrancyGuard {
  using Counters for Counters.Counter;
  using SafeERC20 for IERC20;

  struct Order {
    uint256 tokenId;
    address seller;
    address buyer;
    uint256 price;
    address paymentToken;
  }

  IERC721 public immutable nftContract;
  mapping(address => uint256) public paymentTokens;

  event OrderAdded(
    uint256 orderId,
    uint256 indexed tokenId,
    address indexed seller,
    uint256 price,
    address paymentToken
  );
  event OrderCancelled(uint256 orderId);
  event OrderExecuted(
    uint256 orderId,
    uint256 indexed tokenId,
    address indexed seller,
    address indexed buyer,
    uint256 price,
    address paymentToken
  );

  mapping(uint256 => Order) public orders;
  Counters.Counter public orderId;

  constructor(address nftContractAddress_) {
    nftContract = IERC721(nftContractAddress_);
  }

  function addPaymentToken(address tokenAddress, uint256 rate)
    public
    onlyOwner
  {
    require(tokenAddress != address(0), "Invalid token address");
    paymentTokens[tokenAddress] = rate;
  }

  function removePaymentToken(address tokenAddress) public onlyOwner {
    require(tokenAddress != address(0), "Invalid token address");
    delete paymentTokens[tokenAddress];
  }

  function addOrder(
    uint256 tokenId,
    uint256 price,
    address paymentToken
  ) public returns (bool) {
    require(
      nftContract.ownerOf(tokenId) == _msgSender(),
      "Only onwer can put item for sale"
    );
    require(
      nftContract.getApproved(tokenId) == address(this) ||
        nftContract.isApprovedForAll(_msgSender(), address(this)),
      "NFT is not approved for sale yet"
    );
    require(
      paymentToken == address(0) || paymentTokens[paymentToken] != 0,
      "Payment Token is not supported"
    );

    nftContract.transferFrom(_msgSender(), address(this), tokenId);

    uint256 _orderId = orderId.current();
    Order storage order = orders[_orderId];
    order.tokenId = tokenId;
    order.seller = _msgSender();
    order.buyer = address(0);
    order.price = price;
    order.paymentToken = paymentToken;
    orderId.increment();

    emit OrderAdded(_orderId, tokenId, _msgSender(), price, paymentToken);
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

  function executeOrderWithEther(uint256 orderId_)
    public
    payable
    nonReentrant
    returns (bool)
  {
    Order storage order = orders[orderId_];
    uint256 price = msg.value;

    _transferNFT(orderId_, price);
    (bool successful, ) = payable(order.seller).call{value: price}("");
    require(successful, "Failed to transfer money to seller");

    emit OrderExecuted(
      orderId_,
      order.tokenId,
      order.seller,
      order.buyer,
      price,
      address(0)
    );

    return true;
  }

  function executeOrderWithPaymentToken(
    uint256 orderId_,
    uint256 price,
    address paymentToken
  ) public returns (bool) {
    Order memory order = orders[orderId_];
    require(
      order.paymentToken == paymentToken,
      "Payment token must be the same with the order"
    );

    IERC20(paymentToken).safeTransferFrom(_msgSender(), order.seller, price);
    _transferNFT(orderId_, price);

    emit OrderExecuted(
      orderId_,
      order.tokenId,
      order.seller,
      order.buyer,
      price,
      paymentToken
    );

    return true;
  }

  function _transferNFT(uint256 orderId_, uint256 price) internal {
    Order storage order = orders[orderId_];

    require(order.seller != address(0), "Order does not exist");
    require(
      order.seller != _msgSender(),
      "Seller must be different than buyer"
    );
    require(order.price == price, "Price has changed");
    require(order.buyer == address(0), "Order is already bought");

    order.buyer = _msgSender();
    nftContract.transferFrom(address(this), _msgSender(), order.tokenId);
  }
}
