// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Faucet-style ERC20 used to stand in for mETH / USDY on testnet.
/// @dev Public `mint` so the demo wallet (and the whale-attack route) can self-fund.
contract MockERC20 is ERC20 {
    uint8 private immutable _decimals;

    constructor(string memory name_, string memory symbol_, uint8 decimals_) ERC20(name_, symbol_) {
        _decimals = decimals_;
    }

    function decimals() public view override returns (uint8) {
        return _decimals;
    }

    /// @notice Unrestricted mint — testnet faucet only. Never ship to mainnet.
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
