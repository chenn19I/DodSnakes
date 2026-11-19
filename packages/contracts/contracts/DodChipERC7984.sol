// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.27;

import {FHE, euint64} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {ERC7984} from "@openzeppelin/confidential-contracts/token/ERC7984/ERC7984.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title DodChipERC7984
 * @notice Confidential ERC-7984 fungible game chip (cDOD) for DodSnake Confidential Arena.
 *         All balances and transfer amounts remain encrypted onchain as FHE euint64 ciphertexts.
 *         Includes a built-in Sepolia testnet faucet so players can mint encrypted chips to play.
 */
contract DodChipERC7984 is ZamaEthereumConfig, ERC7984, Ownable {
    uint64 public constant FAUCET_AMOUNT = 100_000_000; // 100.000000 cDOD (6 decimals)
    uint256 public constant FAUCET_COOLDOWN = 1 hours;
    uint64 public constant INITIAL_TREASURY = 1_000_000_000_000; // 1,000,000 cDOD

    mapping(address account => uint256 lastClaimTimestamp) public lastFaucetClaim;

    event FaucetClaimed(address indexed recipient, uint256 timestamp);

    error FaucetCooldownActive(uint256 nextClaimAt);
    error InvalidBatchInput();

    constructor()
        ERC7984("DodChip", "cDOD", "https://dodsnake.vercel.app/dodchip.json")
        Ownable(msg.sender)
    {
        _mint(msg.sender, FHE.asEuint64(INITIAL_TREASURY));
    }

    /**
     * @notice Claims 100 cDOD encrypted testnet chips once per cooldown window.
     */
    function claimFaucet() external returns (euint64 minted) {
        uint256 last = lastFaucetClaim[msg.sender];
        if (last != 0 && block.timestamp < last + FAUCET_COOLDOWN) {
            revert FaucetCooldownActive(last + FAUCET_COOLDOWN);
        }
        lastFaucetClaim[msg.sender] = block.timestamp;
        minted = _mint(msg.sender, FHE.asEuint64(FAUCET_AMOUNT));
        emit FaucetClaimed(msg.sender, block.timestamp);
    }

    /**
     * @notice Returns remaining seconds until `account` can claim from the faucet again.
     */
    function faucetCooldownRemaining(address account) external view returns (uint256) {
        uint256 last = lastFaucetClaim[account];
        if (last == 0 || block.timestamp >= last + FAUCET_COOLDOWN) {
            return 0;
        }
        return (last + FAUCET_COOLDOWN) - block.timestamp;
    }

    /**
     * @notice Owner helper to distribute testnet cDOD to up to 20 test wallets in one tx.
     */
    function mintTestnetBatch(address[] calldata recipients, uint64 amountEach) external onlyOwner {
        if (recipients.length == 0 || recipients.length > 20 || amountEach == 0) {
            revert InvalidBatchInput();
        }
        for (uint256 i = 0; i < recipients.length; i++) {
            _mint(recipients[i], FHE.asEuint64(amountEach));
        }
    }
}
