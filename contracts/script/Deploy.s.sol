// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "forge-std/Script.sol";
import "../src/ScriptHub.sol";
import "../src/LobsterHub.sol";
import "../src/ClawArena.sol";
import "../src/DefaultData.sol";
import {ClawUtility} from "../src/ClawUtility.sol";
import "@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol";

contract DeployAll is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);
        vm.startBroadcast(deployerKey);

        // 1. Deploy ScriptHub & LobsterHub (no proxy needed)
        ScriptHub scriptHub = new ScriptHub();
        console.log("ScriptHub:", address(scriptHub));

        LobsterHub lobsterHub = new LobsterHub();
        console.log("LobsterHub:", address(lobsterHub));

        // 2. Deploy ClawArena implementation + proxy
        ClawArena arenaImpl = new ClawArena();
        bytes memory initData = abi.encodeCall(ClawArena.initialize, (address(lobsterHub), address(scriptHub)));
        TransparentUpgradeableProxy proxy = new TransparentUpgradeableProxy(address(arenaImpl), deployer, initData);
        ClawArena arena = ClawArena(address(proxy));
        console.log("ArenaProxy:", address(proxy));

        // 3. Deploy ClawUtility (points to proxy)
        ClawUtility shop = new ClawUtility(address(proxy));
        console.log("ClawUtility:", address(shop));

        // 4. Set references
        lobsterHub.setClawArena(address(proxy));
        scriptHub.setClawArena(address(proxy));
        arena.setClawUtility(address(shop));

        // 5. Init default heroes + scripts + AI players
        lobsterHub.initDefaultHeroes(DefaultData.getDefaultHeroStats(), DefaultData.getDefaultHeroVisuals(), DefaultData.getDefaultHeroNames());
        scriptHub.initDefaultScripts(DefaultData.getDefaultScriptNames(), DefaultData.getDefaultScripts());
        bytes12[] memory aiNames = DefaultData.getDefaultHeroNames();
        for (uint256 i = 0; i < aiNames.length; i++) {
            arena.addDefaultPlayer(aiNames[i], i, i);
        }
        console.log("Deployed: heroes=12 scripts=12 ai=12");

        vm.stopBroadcast();
    }
}
