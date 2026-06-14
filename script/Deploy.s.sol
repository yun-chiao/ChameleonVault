// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {ChameleonVault} from "../contracts/ChameleonVault.sol";
import {MockERC20} from "../contracts/mocks/MockERC20.sol";
import {MockPriceOracle} from "../contracts/mocks/MockPriceOracle.sol";
import {MockDEXRouter} from "../contracts/mocks/MockDEXRouter.sol";
import {MockAgentRegistry} from "../contracts/mocks/MockAgentRegistry.sol";

/**
 * @notice One-shot deploy + wiring for the ChameleonVault demo on Mantle testnet.
 *
 *   forge script script/Deploy.s.sol:Deploy \
 *     --rpc-url mantle_testnet --broadcast --legacy
 *
 * Required env:
 *   PRIVATE_KEY  deployer / owner (also registered as the AI agent).
 *   AGENT_ADDR   (optional) address that runs agent.py; defaults to deployer.
 */
contract Deploy is Script {
    // Seed prices (1e8): mETH ~= $1783.42, USDY = $1.00.
    uint256 constant METH_PRICE = 1783_42000000; // 1783.42 * 1e8
    uint256 constant USDY_PRICE = 1_00000000; // 1.00 * 1e8

    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(pk);
        address agent = vm.envOr("AGENT_ADDR", deployer);

        vm.startBroadcast(pk);

        // 1. Mock assets.
        MockERC20 meth = new MockERC20("Mantle Staked Ether", "mETH", 18);
        MockERC20 usdy = new MockERC20("Ondo US Dollar Yield", "USDY", 18);

        // 2. Oracle + seed prices.
        MockPriceOracle oracle = new MockPriceOracle();
        oracle.setPrice(address(meth), METH_PRICE);
        oracle.setPrice(address(usdy), USDY_PRICE);

        // 3. DEX router + ERC-8004 registry.
        MockDEXRouter router = new MockDEXRouter(address(oracle));
        MockAgentRegistry registry = new MockAgentRegistry();
        registry.register(agent); // mint the agent's Identity NFT

        // 4. Vault.
        ChameleonVault vault = new ChameleonVault(
            address(meth),
            address(usdy),
            address(registry),
            address(oracle),
            address(router)
        );

        // 5. Seed the vault with starting liquidity so there is something to rebalance.
        meth.mint(deployer, 100 ether);
        usdy.mint(deployer, 100_000 ether);
        meth.approve(address(vault), type(uint256).max);
        usdy.approve(address(vault), type(uint256).max);
        vault.deposit(address(meth), 10 ether);
        vault.deposit(address(usdy), 20_000 ether);

        vm.stopBroadcast();

        console2.log("METH            :", address(meth));
        console2.log("USDY            :", address(usdy));
        console2.log("Oracle          :", address(oracle));
        console2.log("Router          :", address(router));
        console2.log("AgentRegistry   :", address(registry));
        console2.log("ChameleonVault  :", address(vault));
        console2.log("Agent           :", agent);
    }
}
