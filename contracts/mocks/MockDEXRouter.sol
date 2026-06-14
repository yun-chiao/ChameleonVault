// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IDEXRouter, IPriceOracle} from "../interfaces/IChameleonExternal.sol";
import {MockERC20} from "./MockERC20.sol";

/**
 * @notice Mocked single-hop DEX router. Pulls `tokenIn` from the caller and
 *         returns an oracle-priced amount of `tokenOut` (no AMM curve, no fees,
 *         no slippage — deliberately simple for the MVP demo).
 * @dev    To stay perpetually liquid during the demo it MINTS the output token
 *         (the mock tokens expose a public `mint`). On a real DEX this would be
 *         a pool swap. amountOutMinimum is accepted but the vault always sends 0.
 */
contract MockDEXRouter is IDEXRouter {
    using SafeERC20 for IERC20;

    IPriceOracle public immutable oracle;

    constructor(address _oracle) {
        oracle = IPriceOracle(_oracle);
    }

    function swap(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 amountOutMinimum,
        address recipient
    ) external returns (uint256 amountOut) {
        IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amountIn);

        // value-preserving conversion using oracle prices, normalised for decimals.
        uint256 priceIn = oracle.getPrice(tokenIn); // 1e8
        uint256 priceOut = oracle.getPrice(tokenOut); // 1e8
        uint8 decIn = MockERC20(tokenIn).decimals();
        uint8 decOut = MockERC20(tokenOut).decimals();

        // amountOut = amountIn * priceIn / priceOut, scaled across decimals.
        amountOut = (amountIn * priceIn * (10 ** decOut)) / (priceOut * (10 ** decIn));

        require(amountOut >= amountOutMinimum, "MockDEXRouter: insufficient output");

        // Mint the output leg to the recipient to keep the mock pool solvent.
        MockERC20(tokenOut).mint(recipient, amountOut);
    }
}
