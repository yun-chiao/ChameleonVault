// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC8004} from "../interfaces/IChameleonExternal.sol";

/**
 * @notice Minimal ERC-8004 Agent Identity registry mock.
 * @dev    The vault only calls `balanceOf(agent) > 0`. We model identities as a
 *         simple non-transferable count per address. `register` issues one
 *         Agent Identity NFT to an address so it can pass `onlyAgent`.
 */
contract MockAgentRegistry is IERC8004 {
    mapping(address agent => uint256 count) private _identities;

    event AgentRegistered(address indexed agent, uint256 newBalance);

    function balanceOf(address agent) external view returns (uint256) {
        return _identities[agent];
    }

    /// @notice Issue one Agent Identity NFT to `agent` (demo registration).
    function register(address agent) external {
        _identities[agent] += 1;
        emit AgentRegistered(agent, _identities[agent]);
    }
}
