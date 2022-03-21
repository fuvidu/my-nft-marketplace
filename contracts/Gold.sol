//SPDX-License-Identifier: MIT

pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "hardhat/console.sol";

contract Gold is ERC20 {
  uint256 constant TOTAL_SUPPLY = 10**6;

  constructor() ERC20("Gold Token", "GLD") {
    _mint(_msgSender(), TOTAL_SUPPLY);
  }
}
