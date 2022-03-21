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
  using Address for address;

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
  event Transfer(address from, address to, uint256 amount);

  struct Order {
    uint256 tokenId;
    address seller;
    address buyer;
    uint256 price;
    address paymentToken;
  }

  uint8 public commissionRate; // percentage value
  address public commissionBeneficiary;

  IERC721 public immutable nftContract;
  // address => decimals
  mapping(address => uint8) private _acceptedPaymentTokens;
  mapping(uint256 => Order) private _orders;
  Counters.Counter private _orderIdCounter;

  constructor(address nftContractAddress_) {
    nftContract = IERC721(nftContractAddress_);
  }

  function addPaymentToken(address tokenAddress, uint8 decimals)
    public
    onlyOwner
  {
    require(tokenAddress != address(0), "Invalid token address");
    _acceptedPaymentTokens[tokenAddress] = decimals;
  }

  function removePaymentToken(address tokenAddress) public onlyOwner {
    require(tokenAddress != address(0), "Invalid token address");
    delete _acceptedPaymentTokens[tokenAddress];
  }

  function setCommisionRate(uint8 _commissionRate) external onlyOwner {
    commissionRate = _commissionRate;
  }

  function setCommissionBeneficiary(address beneficiary) external onlyOwner {
    require(beneficiary != address(0), "Invalid address");
    commissionBeneficiary = beneficiary;
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
      paymentToken == address(0) || _acceptedPaymentTokens[paymentToken] != 0,
      "Payment Token is not supported"
    );

    nftContract.transferFrom(_msgSender(), address(this), tokenId);

    uint256 _orderId = _orderIdCounter.current();
    Order storage order = _orders[_orderId];
    order.tokenId = tokenId;
    order.seller = _msgSender();
    order.buyer = address(0);
    order.price = price;
    order.paymentToken = paymentToken;
    _orderIdCounter.increment();

    emit OrderAdded(_orderId, tokenId, _msgSender(), price, paymentToken);
    return true;
  }

  function cancelOrder(uint256 orderId_) public returns (bool) {
    Order memory order = _orders[orderId_];
    require(order.buyer == address(0), "Item is already bought, cannot cancel");
    require(order.seller == _msgSender(), "Only onwer can cancel the order");

    uint256 _tokenId = order.tokenId;
    delete _orders[orderId_];

    nftContract.transferFrom(address(this), _msgSender(), _tokenId);

    emit OrderCancelled(orderId_);
    return true;
  }

  function executeOrderWithEther(uint256 orderId_)
    public
    payable
    nonReentrant
    canExecuteOrder(orderId_)
    returns (bool)
  {
    Order storage order = _orders[orderId_];
    uint256 price = msg.value;

    require(order.price == price, "Price does not match");
    _transferNFT(orderId_);

    uint256 commission = _calculateCommission(price, commissionRate);
    if (commission > 0) {
      (bool _successful, ) = payable(commissionBeneficiary).call{
        value: commission
      }("");
      require(
        _successful,
        "Failed to transfer money to commission beneficiary"
      );
      emit Transfer(_msgSender(), commissionBeneficiary, commission);
    }

    uint256 paymentAmount = price - commission;
    (bool successful, ) = payable(order.seller).call{value: paymentAmount}("");
    require(successful, "Failed to transfer money to seller");
    emit Transfer(_msgSender(), order.seller, paymentAmount);

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
  ) public canExecuteOrder(orderId_) returns (bool) {
    Order storage order = _orders[orderId_];
    require(
      order.paymentToken == paymentToken,
      "Payment token must be the same with the order"
    );
    require(order.price == price, "Price does not match");

    _transferNFT(orderId_);
    uint256 commission = _calculateCommission(price, commissionRate);
    if (commission > 0) {
      IERC20(paymentToken).safeTransferFrom(
        _msgSender(),
        commissionBeneficiary,
        commission
      );
    }

    IERC20(paymentToken).safeTransferFrom(
      _msgSender(),
      order.seller,
      price - commission
    );

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

  function _calculateCommission(uint256 price, uint8 rate)
    private
    view
    returns (uint256)
  {
    return commissionBeneficiary != address(0) ? ((price * rate) / 100) : 0;
  }

  modifier canExecuteOrder(uint256 orderId) {
    Order memory order = _orders[orderId];
    require(order.seller != address(0), "Order does not exist");
    require(
      order.seller != _msgSender(),
      "Seller must be different than buyer"
    );
    require(order.buyer == address(0), "Order is already bought");
    _;
  }

  function _transferNFT(uint256 orderId_) internal {
    Order storage order = _orders[orderId_];
    order.buyer = _msgSender();
    nftContract.transferFrom(address(this), _msgSender(), order.tokenId);
  }
}
