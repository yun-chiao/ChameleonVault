// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC8004, IPriceOracle, IDEXRouter} from "./interfaces/IChameleonExternal.sol";

/**
 * @title  ChameleonVault
 * @notice A radically transparent, AI-managed RWA vault for the Mantle Turing
 *         Test Hackathon (AI x RWA track). Users make single-sided deposits of
 *         mETH (liquid staking) or USDY (yield-bearing stablecoin). An autonomous
 *         ERC-8004 registered AI Agent is the ONLY actor allowed to rebalance the
 *         vault between the two assets, abstracting gas + swap complexity away
 *         from the depositor.
 *
 * @dev    Scope is intentionally minimal for a live demo:
 *           - No TWAP, no slippage math, no fee compounding.
 *           - The swap goes through a mocked DEX router with amountOutMinimum = 0.
 *           - Every successful rebalance emits an on-chain, human-readable
 *             `BenchmarkedStrategyExecuted` rationale — our permanent proof of
 *             AI performance ("on-chain benchmarking").
 *
 *         BANNED by spec (and therefore absent): cooldowns, max-swap limits,
 *         and a global pausable switch. The only safety rail is the USDY peg
 *         circuit breaker.
 */
contract ChameleonVault is Ownable {
    using SafeERC20 for IERC20;

    /*//////////////////////////////////////////////////////////////
                                CONSTANTS
    //////////////////////////////////////////////////////////////*/

    /// @dev Oracle prices use 8 decimals. $0.98 peg floor for USDY.
    uint256 public constant USDY_PEG_FLOOR = 98_000_000; // 0.98 * 1e8

    /*//////////////////////////////////////////////////////////////
                              IMMUTABLE WIRING
    //////////////////////////////////////////////////////////////*/

    /// @notice mETH — Mantle liquid staking token.
    address public immutable METH;
    /// @notice USDY — Ondo yield-bearing stablecoin.
    address public immutable USDY;

    /*//////////////////////////////////////////////////////////////
                              MUTABLE WIRING
    //////////////////////////////////////////////////////////////*/

    /// @notice ERC-8004 Agent Identity registry used to gate `rebalance`.
    IERC8004 public agentRegistry;
    /// @notice Price oracle (Pyth/Chainlink adapter) for the peg circuit breaker.
    IPriceOracle public oracle;
    /// @notice Mocked DEX router that executes the asset swap.
    IDEXRouter public router;

    /*//////////////////////////////////////////////////////////////
                                ACCOUNTING
    //////////////////////////////////////////////////////////////*/

    /// @notice Vault-held balance per token (token => amount). Kept in sync with
    ///         actual ERC20 balances; exposed for the frontend / agent to read.
    mapping(address token => uint256 amount) public vaultBalance;

    /*//////////////////////////////////////////////////////////////
                                  EVENTS
    //////////////////////////////////////////////////////////////*/

    event Deposited(address indexed user, address indexed token, uint256 amount);

    event Rebalanced(
        address indexed agent,
        address indexed tokenFrom,
        address indexed tokenTo,
        uint256 amountIn,
        uint256 amountOut
    );

    /// @notice The permanent on-chain benchmark record of an AI decision.
    /// @dev Emitted LAST in `rebalance` so indexers see it after state changes.
    event BenchmarkedStrategyExecuted(string rationale);

    event WiringUpdated(address agentRegistry, address oracle, address router);

    /*//////////////////////////////////////////////////////////////
                                  ERRORS
    //////////////////////////////////////////////////////////////*/

    error NotRegisteredAgent(address caller);
    error UnsupportedToken(address token);
    error USDYDepegged(uint256 price);
    error ZeroAmount();
    error InsufficientVaultBalance(address token, uint256 requested, uint256 available);

    /*//////////////////////////////////////////////////////////////
                                MODIFIERS
    //////////////////////////////////////////////////////////////*/

    /// @notice ERC-8004 access control: caller must hold >= 1 Agent Identity NFT.
    modifier onlyAgent() {
        if (agentRegistry.balanceOf(msg.sender) == 0) {
            revert NotRegisteredAgent(msg.sender);
        }
        _;
    }

    /// @notice Circuit breaker: block rebalances if USDY loses its peg (< $0.98).
    modifier whenUSDYPegHealthy() {
        uint256 price = oracle.getPrice(USDY);
        if (price < USDY_PEG_FLOOR) {
            revert USDYDepegged(price);
        }
        _;
    }

    /*//////////////////////////////////////////////////////////////
                               CONSTRUCTOR
    //////////////////////////////////////////////////////////////*/

    constructor(
        address _meth,
        address _usdy,
        address _agentRegistry,
        address _oracle,
        address _router
    ) Ownable(msg.sender) {
        METH = _meth;
        USDY = _usdy;
        agentRegistry = IERC8004(_agentRegistry);
        oracle = IPriceOracle(_oracle);
        router = IDEXRouter(_router);
    }

    /*//////////////////////////////////////////////////////////////
                                DEPOSITS
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice Single-sided deposit of a supported asset.
     * @dev    THE UX SECRET: we DO NOT swap on deposit. The user's gas footprint
     *         is just an ERC20 transfer + a balance update. All rebalancing —
     *         and its gas cost / timing — is delegated entirely to the AI Agent.
     * @param  token  Either mETH or USDY.
     * @param  amount Amount of `token` to deposit (token's native decimals).
     */
    function deposit(address token, uint256 amount) external {
        if (token != METH && token != USDY) revert UnsupportedToken(token);
        if (amount == 0) revert ZeroAmount();

        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        vaultBalance[token] += amount;

        emit Deposited(msg.sender, token, amount);
    }

    /*//////////////////////////////////////////////////////////////
                               REBALANCE
    //////////////////////////////////////////////////////////////*/

    /**
     * @notice AI-only rebalance: swap `amountIn` of `tokenFrom` into `tokenTo`.
     * @dev    Gated by ERC-8004 identity (`onlyAgent`) and the USDY peg circuit
     *         breaker (`whenUSDYPegHealthy`). Executes a direct market swap via
     *         the mocked DEX router with amountOutMinimum = 0 (no slippage guard,
     *         by design for the MVP). Emits `BenchmarkedStrategyExecuted` LAST.
     * @param  tokenFrom  Asset being sold (mETH or USDY).
     * @param  tokenTo    Asset being bought (the other supported asset).
     * @param  amountIn   Amount of `tokenFrom` to swap.
     * @param  rationale  Human-readable AI reasoning, written permanently on-chain.
     */
    function rebalance(
        address tokenFrom,
        address tokenTo,
        uint256 amountIn,
        string calldata rationale
    ) external onlyAgent whenUSDYPegHealthy {
        if (tokenFrom != METH && tokenFrom != USDY) revert UnsupportedToken(tokenFrom);
        if (tokenTo != METH && tokenTo != USDY) revert UnsupportedToken(tokenTo);
        if (amountIn == 0) revert ZeroAmount();

        uint256 available = vaultBalance[tokenFrom];
        if (amountIn > available) {
            revert InsufficientVaultBalance(tokenFrom, amountIn, available);
        }

        // Settle our internal accounting for the sold leg up-front.
        vaultBalance[tokenFrom] = available - amountIn;

        // Approve + execute the swap. Router returns the bought amount and sends
        // the output tokens back to this vault.
        IERC20(tokenFrom).forceApprove(address(router), amountIn);
        uint256 amountOut = router.swap(tokenFrom, tokenTo, amountIn, 0, address(this));

        // Credit the bought leg.
        vaultBalance[tokenTo] += amountOut;

        emit Rebalanced(msg.sender, tokenFrom, tokenTo, amountIn, amountOut);

        // PERMANENT ON-CHAIN BENCHMARK — emitted at the very end, by spec.
        emit BenchmarkedStrategyExecuted(rationale);
    }

    /*//////////////////////////////////////////////////////////////
                                 VIEWS
    //////////////////////////////////////////////////////////////*/

    /// @notice Convenience getter for the frontend / agent.
    /// @return methQty   Vault-held mETH.
    /// @return usdyQty   Vault-held USDY.
    /// @return methPrice mETH USD price (1e8).
    /// @return usdyPrice USDY USD price (1e8).
    function getVaultState()
        external
        view
        returns (uint256 methQty, uint256 usdyQty, uint256 methPrice, uint256 usdyPrice)
    {
        methQty = vaultBalance[METH];
        usdyQty = vaultBalance[USDY];
        methPrice = oracle.getPrice(METH);
        usdyPrice = oracle.getPrice(USDY);
    }

    /// @notice True if USDY currently holds its peg (>= $0.98).
    function isPegHealthy() external view returns (bool) {
        return oracle.getPrice(USDY) >= USDY_PEG_FLOOR;
    }

    /*//////////////////////////////////////////////////////////////
                                 ADMIN
    //////////////////////////////////////////////////////////////*/

    /// @notice Re-point the registry/oracle/router (e.g. swapping mocks for real
    ///         feeds on testnet). Owner-only; not part of the agent flow.
    function setWiring(address _agentRegistry, address _oracle, address _router) external onlyOwner {
        agentRegistry = IERC8004(_agentRegistry);
        oracle = IPriceOracle(_oracle);
        router = IDEXRouter(_router);
        emit WiringUpdated(_agentRegistry, _oracle, _router);
    }
}
