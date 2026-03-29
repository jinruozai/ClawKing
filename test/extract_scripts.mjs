/**
 * 从合约提取 12 个默认脚本字节码，生成 JSON 供 battle_replay 使用
 * Usage: cd contracts && forge script test/ExtractScripts.s.sol -vv
 *        然后手动复制输出的 hex 到下方
 *
 * 或者直接用 forge 的 ffi 来跑：
 */
import { execSync } from 'child_process';

// 用 forge 跑一个简单 script 来输出脚本字节码
const sol = `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;
import "forge-std/Script.sol";
import "../src/DefaultData.sol";
contract ExtractScripts is Script {
    function run() external view {
        bytes[] memory scripts = DefaultData.getDefaultScripts();
        for (uint i = 0; i < scripts.length; i++) {
            console.log(vm.toString(scripts[i]));
        }
    }
}
`;

import { writeFileSync } from 'fs';
writeFileSync('contracts/script/ExtractScripts.s.sol', sol);

try {
  const output = execSync('cd contracts && forge script script/ExtractScripts.s.sol -vv 2>&1', { encoding: 'utf-8', timeout: 60000 });

  // 解析输出中的 0x... 行
  const lines = output.split('\n').filter(l => l.trim().startsWith('0x'));
  console.log(`Found ${lines.length} scripts`);

  const scripts = lines.map(l => l.trim());
  writeFileSync('test/default_scripts.json', JSON.stringify(scripts, null, 2));
  console.log('Saved to test/default_scripts.json');
} catch (e) {
  console.error('Failed:', e.message);
}
