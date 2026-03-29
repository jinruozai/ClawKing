// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "forge-std/Script.sol";
import "../src/ClawArena.sol";
import "../src/LobsterHub.sol";
import "../src/DefaultData.sol";
import {ClawUtility} from "../src/ClawUtility.sol";

/**
 * UpgradeArena — 只重新部署 ClawArena + ClawUtility
 * 保留 LobsterHub / ScriptHub 不变（NFT 数据不丢失）
 * 玩家数据（rating/coins/streak）会重置
 */
contract UpgradeArena is Script {
    // 保留的 NFT 合约地址（不重新部署）
    address constant LOBSTER_HUB = 0x72eEA00e0b9652Db2D8d2Eb4b72eadEBA76440Bd;
    address constant SCRIPT_HUB  = 0x429862F1fBd621D15C48f1E16E6301f322e7CCAe;

    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        vm.startBroadcast(deployerKey);

        LobsterHub lobsterHub = LobsterHub(LOBSTER_HUB);

        // 1. Deploy new ClawArena
        ClawArena arena = new ClawArena();
        arena.initialize(LOBSTER_HUB, SCRIPT_HUB);
        console.log("ClawArena:", address(arena));

        // 2. Deploy new ClawUtility
        ClawUtility shop = new ClawUtility(address(arena));
        console.log("ClawUtility:", address(shop));

        // 3. Update references
        lobsterHub.setClawArena(address(arena));
        arena.setClawUtility(address(shop));

        // 4. Re-register AI players (NFTs still exist, just need player entries)
        bytes12[] memory aiNames = DefaultData.getDefaultHeroNames();
        for (uint256 i = 0; i < aiNames.length; i++) {
            arena.addDefaultPlayer(aiNames[i], i, i);
        }
        console.log("AI players registered:", aiNames.length);

        vm.stopBroadcast();
    }
}
