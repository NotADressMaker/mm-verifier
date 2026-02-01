// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IVerifierMining {
    function recordEvaluation(address verifier, bool accurate) external;
}
