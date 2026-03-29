// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "forge-std/Script.sol";
import "../src/ClawArena.sol";
import "@openzeppelin/contracts/proxy/transparent/ProxyAdmin.sol";

/**
 * UpgradeImpl — Deploy new ClawArena implementation and upgrade proxy.
 */
contract UpgradeImpl is Script {
    address constant ARENA_PROXY = 0xcaEa857C7E9aa1BAebFDbD9502f2BFA1e0451F10;

    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address proxyAdmin = vm.envAddress("PROXY_ADDRESS");
        address arenaProxy = ARENA_PROXY;

        vm.startBroadcast(deployerKey);

        // 1. Deploy new implementation
        ClawArena newImpl = new ClawArena();
        console.log("New implementation:", address(newImpl));

        // 2. Upgrade proxy to new implementation
        ProxyAdmin(proxyAdmin).upgradeAndCall(ITransparentUpgradeableProxy(arenaProxy), address(newImpl), "");
        console.log("Proxy upgraded");

        vm.stopBroadcast();
    }
}
