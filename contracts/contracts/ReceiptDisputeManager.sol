// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./interfaces/IVerifierRegistry.sol";

/**
 * @title ReceiptDisputeManager
 * @notice Minimal bonded dispute flow for verifier receipts.
 */
contract ReceiptDisputeManager is Ownable, ReentrancyGuard {
    enum DisputeStatus {
        NONE,
        OPEN,
        RESPONDED,
        RESOLVED
    }

    struct Receipt {
        address verifier;
        bytes32 receiptHash;
        bytes32 bundleHash;
        string bundleURI;
        uint64 submittedAt;
        uint64 disputeDeadline;
        bool finalized;
        bool disputed;
    }

    struct Dispute {
        address challenger;
        uint256 challengerBond;
        uint256 verifierBond;
        uint64 openedAt;
        uint64 responseDeadline;
        DisputeStatus status;
    }

    IVerifierRegistry public immutable registry;

    uint256 public challengeBond;
    uint256 public responseBond;
    uint64 public disputeWindow;
    uint64 public responseWindow;
    uint16 public slashBpsIncorrect;
    uint16 public slashBpsNoResponse;

    uint256 public nextReceiptId = 1;
    mapping(uint256 => Receipt) public receipts;
    mapping(uint256 => Dispute) public disputes;

    event ReceiptSubmitted(
        uint256 indexed receiptId,
        address indexed verifier,
        bytes32 receiptHash,
        bytes32 bundleHash,
        string bundleURI,
        uint64 disputeDeadline
    );
    event ReceiptFinalized(uint256 indexed receiptId, address indexed verifier, bool disputed);
    event DisputeOpened(uint256 indexed receiptId, address indexed challenger, uint256 bond, uint64 responseDeadline);
    event DisputeResponded(uint256 indexed receiptId, address indexed verifier, uint256 bond);
    event DisputeResolved(
        uint256 indexed receiptId,
        bool challengerWins,
        uint256 challengerPayout,
        uint256 verifierPayout,
        uint256 slashedAmount
    );

    constructor(
        IVerifierRegistry _registry,
        uint256 _challengeBond,
        uint256 _responseBond,
        uint64 _disputeWindow,
        uint64 _responseWindow,
        uint16 _slashBpsIncorrect,
        uint16 _slashBpsNoResponse
    ) Ownable(msg.sender) {
        registry = _registry;
        challengeBond = _challengeBond;
        responseBond = _responseBond;
        disputeWindow = _disputeWindow;
        responseWindow = _responseWindow;
        slashBpsIncorrect = _slashBpsIncorrect;
        slashBpsNoResponse = _slashBpsNoResponse;
    }

    function setEconomicConfig(
        uint256 _challengeBond,
        uint256 _responseBond,
        uint16 _slashBpsIncorrect,
        uint16 _slashBpsNoResponse
    ) external onlyOwner {
        challengeBond = _challengeBond;
        responseBond = _responseBond;
        slashBpsIncorrect = _slashBpsIncorrect;
        slashBpsNoResponse = _slashBpsNoResponse;
    }

    function setWindows(uint64 _disputeWindow, uint64 _responseWindow) external onlyOwner {
        disputeWindow = _disputeWindow;
        responseWindow = _responseWindow;
    }

    function submitReceipt(bytes32 receiptHash, bytes32 bundleHash, string calldata bundleURI)
        external
        returns (uint256 receiptId)
    {
        require(registry.canSubmitReceipt(msg.sender), "rate limited or inactive");
        require(receiptHash != bytes32(0), "receipt hash required");
        require(bundleHash != bytes32(0), "bundle hash required");

        receiptId = nextReceiptId++;
        receipts[receiptId] = Receipt({
            verifier: msg.sender,
            receiptHash: receiptHash,
            bundleHash: bundleHash,
            bundleURI: bundleURI,
            submittedAt: uint64(block.timestamp),
            disputeDeadline: uint64(block.timestamp) + disputeWindow,
            finalized: false,
            disputed: false
        });

        registry.recordActivity(msg.sender);

        emit ReceiptSubmitted(
            receiptId,
            msg.sender,
            receiptHash,
            bundleHash,
            bundleURI,
            uint64(block.timestamp) + disputeWindow
        );
    }

    function challengeReceipt(uint256 receiptId) external payable nonReentrant {
        Receipt storage receipt = receipts[receiptId];
        require(receipt.verifier != address(0), "unknown receipt");
        require(!receipt.disputed, "already disputed");
        require(block.timestamp <= receipt.disputeDeadline, "challenge window closed");
        require(msg.value >= challengeBond, "bond too low");
        require(msg.sender != receipt.verifier, "self challenge");

        receipt.disputed = true;
        disputes[receiptId] = Dispute({
            challenger: msg.sender,
            challengerBond: msg.value,
            verifierBond: 0,
            openedAt: uint64(block.timestamp),
            responseDeadline: uint64(block.timestamp) + responseWindow,
            status: DisputeStatus.OPEN
        });

        emit DisputeOpened(receiptId, msg.sender, msg.value, uint64(block.timestamp) + responseWindow);
    }

    function respondToDispute(uint256 receiptId) external payable nonReentrant {
        Receipt storage receipt = receipts[receiptId];
        Dispute storage dispute = disputes[receiptId];
        require(receipt.verifier == msg.sender, "not verifier");
        require(dispute.status == DisputeStatus.OPEN, "not open");
        require(block.timestamp <= dispute.responseDeadline, "response window closed");
        require(msg.value >= responseBond, "bond too low");

        dispute.verifierBond = msg.value;
        dispute.status = DisputeStatus.RESPONDED;

        emit DisputeResponded(receiptId, msg.sender, msg.value);
    }

    function finalizeReceipt(uint256 receiptId) external {
        Receipt storage receipt = receipts[receiptId];
        require(receipt.verifier != address(0), "unknown receipt");
        require(!receipt.finalized, "already finalized");
        require(!receipt.disputed, "disputed");
        require(block.timestamp > receipt.disputeDeadline, "window open");

        receipt.finalized = true;
        registry.recordReceiptResult(receipt.verifier, true);

        emit ReceiptFinalized(receiptId, receipt.verifier, false);
    }

    function resolveDispute(uint256 receiptId, bool challengerWins) external onlyOwner nonReentrant {
        Dispute storage dispute = disputes[receiptId];
        Receipt storage receipt = receipts[receiptId];
        require(dispute.status == DisputeStatus.OPEN || dispute.status == DisputeStatus.RESPONDED, "invalid status");
        require(!receipt.finalized, "finalized");

        _resolve(receiptId, challengerWins, slashBpsIncorrect);
    }

    function finalizeExpiredDispute(uint256 receiptId) external nonReentrant {
        Dispute storage dispute = disputes[receiptId];
        Receipt storage receipt = receipts[receiptId];
        require(dispute.status == DisputeStatus.OPEN, "not open");
        require(block.timestamp > dispute.responseDeadline, "response pending");
        require(!receipt.finalized, "finalized");

        _resolve(receiptId, true, slashBpsNoResponse);
    }

    function _resolve(uint256 receiptId, bool challengerWins, uint16 slashBps) internal {
        Dispute storage dispute = disputes[receiptId];
        Receipt storage receipt = receipts[receiptId];

        dispute.status = DisputeStatus.RESOLVED;
        receipt.finalized = true;

        uint256 slashedAmount = 0;
        uint256 challengerPayout = 0;
        uint256 verifierPayout = 0;

        if (challengerWins) {
            slashedAmount = registry.slashVerifier(
                receipt.verifier,
                slashBps,
                address(this),
                bytes32("RECEIPT_SLASH")
            );

            challengerPayout = dispute.challengerBond + dispute.verifierBond + slashedAmount;
            _safeTransfer(dispute.challenger, challengerPayout);

            registry.recordReceiptResult(receipt.verifier, false);
            registry.recordDisputeResult(receipt.verifier, false);
        } else {
            verifierPayout = dispute.challengerBond + dispute.verifierBond;
            _safeTransfer(receipt.verifier, verifierPayout);

            registry.recordReceiptResult(receipt.verifier, true);
            registry.recordDisputeResult(receipt.verifier, true);
        }

        emit DisputeResolved(receiptId, challengerWins, challengerPayout, verifierPayout, slashedAmount);
        emit ReceiptFinalized(receiptId, receipt.verifier, true);
    }

    function _safeTransfer(address to, uint256 amount) internal {
        if (amount == 0) {
            return;
        }
        (bool success, ) = to.call{ value: amount }("");
        require(success, "transfer failed");
    }
}
