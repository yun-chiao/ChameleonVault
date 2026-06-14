// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/*//////////////////////////////////////////////////////////////
              ChameleonVault — External Interfaces
//////////////////////////////////////////////////////////////*/

/// @notice Minimal ERC-8004 Agent Identity surface.
/// @dev The hackathon mandates ERC-8004 Agent Identity NFTs. We only need
///      `balanceOf` to assert that `msg.sender` holds a registered Agent NFT.
///      A real deployment would point this at the canonical ERC-8004 registry.
interface IERC8004 {
    /// @return The number of Agent Identity NFTs held by `agent`.
    function balanceOf(address agent) external view returns (uint256);
}

/// @notice Price oracle surface (Pyth/Chainlink-style adapter).
/// @dev Prices are returned with 8 decimals (e.g. $1.00 == 1e8) to match
///      common Chainlink feeds and keep the peg-check math simple.
interface IPriceOracle {
    /// @return price USD price of `token`, scaled to 1e8.
    function getPrice(address token) external view returns (uint256 price);

    /// @return updatedAt Unix timestamp of the last price update.
    function lastUpdated(address token) external view returns (uint256 updatedAt);
}

/// @notice Mocked DEX router surface (Uniswap-style single hop).
/// @dev `amountOutMinimum` is honoured by the router but the vault always
///      passes 0 — slippage protection is intentionally out of scope for the MVP.
interface IDEXRouter {
    function swap(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 amountOutMinimum,
        address recipient
    ) external returns (uint256 amountOut);
}
