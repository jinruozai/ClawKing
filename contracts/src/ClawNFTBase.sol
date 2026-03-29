// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

interface IClawArenaMint {
    function spendCoins(address addr, uint256 amount) external;
}

/// @title ClawNFTBase - LobsterHub / ScriptHub 共用基类
/// @notice 提供 tokensOfOwner 索引、计数器、名字存储、铸造收费
abstract contract ClawNFTBase is ERC721, Ownable {

    // ── 计数器 ──
    uint256 public nextTokenId;
    uint256 public defaultCount;

    // ── 名字 ──
    mapping(uint256 => bytes12) public nftName;

    // ── Owner 索引（O(1) 查询某地址拥有的全部 tokenId）──
    mapping(address => uint256[]) private _ownedTokens;
    mapping(uint256 => uint256) private _ownedIndex; // tokenId => 在 _ownedTokens[owner] 中的下标

    // ── 铸造费 ──
    address public clawArena;
    uint256 constant PRICE_MINT_BNB = 0.001 ether; // 0.001 BNB on opBNB

    /// @notice 收取铸造费（BNB + 金币），子类 mint 时调用
    function _chargeMintFee(uint256 coinCost) internal {
        require(msg.value == PRICE_MINT_BNB, "Pay 0.001 BNB");
        IClawArenaMint(clawArena).spendCoins(msg.sender, coinCost);
        (bool ok,) = owner().call{value: msg.value}("");
        require(ok, "Transfer failed");
    }

    constructor(string memory name_, string memory symbol_)
        ERC721(name_, symbol_)
        Ownable(msg.sender)
    {}

    function setClawArena(address _arena) external onlyOwner {
        clawArena = _arena;
    }

    // ── Owner 索引维护 ──

    function _update(address to, uint256 tokenId, address auth) internal virtual override returns (address from) {
        from = super._update(to, tokenId, auth);
        // 从旧 owner 移除
        if (from != address(0)) {
            uint256 lastIdx = _ownedTokens[from].length - 1;
            uint256 idx = _ownedIndex[tokenId];
            if (idx != lastIdx) {
                uint256 lastId = _ownedTokens[from][lastIdx];
                _ownedTokens[from][idx] = lastId;
                _ownedIndex[lastId] = idx;
            }
            _ownedTokens[from].pop();
        }
        // 添加到新 owner
        if (to != address(0)) {
            _ownedIndex[tokenId] = _ownedTokens[to].length;
            _ownedTokens[to].push(tokenId);
        }
        return from;
    }

    /// @notice 分页查询某地址拥有的全部 tokenId
    function tokensOfOwnerPaged(address owner, uint256 offset, uint256 limit) external view returns (uint256[] memory) {
        uint256[] storage tokens = _ownedTokens[owner];
        uint256 len = tokens.length;
        if (offset >= len) return new uint256[](0);
        uint256 end = offset + limit;
        if (end > len) end = len;
        uint256[] memory result = new uint256[](end - offset);
        for (uint256 i = offset; i < end; i++) {
            result[i - offset] = tokens[i];
        }
        return result;
    }

    /// @notice 某地址拥有的 NFT 数量（与 balanceOf 一致，用于前端分页计算）
    function ownedCount(address owner) external view returns (uint256) {
        return _ownedTokens[owner].length;
    }

    // ── View ──

    function totalSupply() external view returns (uint256) {
        return nextTokenId;
    }

    /// @notice 允许合约持有 ERC-721（接收默认 NFT）
    function onERC721Received(address, address, uint256, bytes calldata) external pure returns (bytes4) {
        return this.onERC721Received.selector;
    }

    // ── 工具函数 ──

    function _bytes12ToString(bytes12 b) internal pure returns (string memory) {
        uint8 len = 0;
        for (uint8 i = 0; i < 12; i++) { if (b[i] == 0) break; len++; }
        bytes memory result = new bytes(len);
        for (uint8 i = 0; i < len; i++) result[i] = b[i];
        return string(result);
    }

    function _uint2str(uint256 v) internal pure returns (string memory) {
        if (v == 0) return "0";
        uint256 temp = v; uint256 digits;
        while (temp != 0) { digits++; temp /= 10; }
        bytes memory buffer = new bytes(digits);
        while (v != 0) { digits--; buffer[digits] = bytes1(uint8(48 + v % 10)); v /= 10; }
        return string(buffer);
    }

    function _bytes2hex(bytes memory data) internal pure returns (string memory) {
        bytes memory HEX = "0123456789abcdef";
        bytes memory result = new bytes(data.length * 2);
        for (uint256 i = 0; i < data.length; i++) {
            result[i * 2] = HEX[uint8(data[i]) >> 4];
            result[i * 2 + 1] = HEX[uint8(data[i]) & 0x0f];
        }
        return string(result);
    }

    function _base64Encode(bytes memory data) internal pure returns (string memory) {
        bytes memory TABLE = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
        uint256 len = data.length;
        if (len == 0) return "";
        uint256 encodedLen = 4 * ((len + 2) / 3);
        bytes memory result = new bytes(encodedLen);
        uint256 j = 0;
        for (uint256 i = 0; i < len; i += 3) {
            uint256 a = uint8(data[i]);
            uint256 b_ = i + 1 < len ? uint8(data[i + 1]) : 0;
            uint256 c = i + 2 < len ? uint8(data[i + 2]) : 0;
            uint256 triple = (a << 16) | (b_ << 8) | c;
            result[j++] = TABLE[(triple >> 18) & 0x3F];
            result[j++] = TABLE[(triple >> 12) & 0x3F];
            result[j++] = i + 1 < len ? TABLE[(triple >> 6) & 0x3F] : bytes1("=");
            result[j++] = i + 2 < len ? TABLE[triple & 0x3F] : bytes1("=");
        }
        return string(result);
    }
}
