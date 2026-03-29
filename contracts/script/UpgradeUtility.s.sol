// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "forge-std/Script.sol";
import "../src/ClawUtility.sol";
import "../src/ClawArena.sol";

contract UpgradeUtility is Script {
    address constant ARENA_PROXY = 0x86b95eA2eC909D42c3627B3424a2DbBd6E085095;

    function run() external {
        vm.startBroadcast(vm.envUint("DEPLOYER_PRIVATE_KEY"));

        ClawUtility newUtility = new ClawUtility(ARENA_PROXY);
        console.log("New ClawUtility:", address(newUtility));

        ClawArena arena = ClawArena(payable(ARENA_PROXY));
        arena.setClawUtility(address(newUtility));
        console.log("Arena updated to new ClawUtility");

        vm.stopBroadcast();
    }
}
