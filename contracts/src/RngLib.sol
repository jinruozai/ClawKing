// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

/// @title RngLib - xorshift32 PRNG
library RngLib {
    function init(uint32 seed) internal pure returns (uint32) {
        return seed == 0 ? 1 : seed;
    }

    function next(uint32 state) internal pure returns (uint32) {
        state ^= state << 13;
        state ^= state >> 17;
        state ^= state << 5;
        return state;
    }
}
