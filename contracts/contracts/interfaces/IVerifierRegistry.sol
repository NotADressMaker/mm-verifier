// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IVerifierRegistry {
    enum Status {
        UNREGISTERED,
        ACTIVE,
        EXITING,
        SLASHED
    }

    function minReceiptInterval() external view returns (uint64);
    function statusOf(address verifier) external view returns (Status);
    function stakeOf(address verifier) external view returns (uint256);

    function canSubmitReceipt(address verifier) external view returns (bool);
    function recordActivity(address verifier) external;
    function recordReceiptResult(address verifier, bool accurate) external;
    function recordDisputeResult(address verifier, bool verifierWon) external;
    function slashVerifier(address verifier, uint16 bps, address recipient, bytes32 reason)
        external
        returns (uint256 slashedAmount);
}
