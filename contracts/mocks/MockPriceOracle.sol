// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IPriceOracle} from "../interfaces/IChameleonExternal.sol";

/// @notice Settable price oracle (Pyth/Chainlink stand-in), prices scaled 1e8.
/// @dev Lets the demo operator force a USDY de-peg to showcase the circuit breaker.
contract MockPriceOracle is IPriceOracle {
    mapping(address token => uint256 price) private _price; // 1e8
    mapping(address token => uint256 ts) private _updatedAt;

    function setPrice(address token, uint256 price) external {
        _price[token] = price;
        _updatedAt[token] = block.timestamp;
    }

    function getPrice(address token) external view returns (uint256) {
        return _price[token];
    }

    function lastUpdated(address token) external view returns (uint256) {
        return _updatedAt[token];
    }
}
