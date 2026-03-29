// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "./ClawNFTBase.sol";
import "./Constants.sol";

/// @title LobsterHub - 英雄 NFT 合约
/// @notice ERC-721 龙虾 NFT，铸造时随机分配属性，1000 金币 + 0.001 BNB
contract LobsterHub is ClawNFTBase {

    // ── 铸造常量 ──
    uint256 constant PRICE_MINT_COINS  = 1000;
    uint8   constant FREE_POINTS       = 12;
    uint8   constant SKILL_EFFECT_COUNT = 13;
    uint8   constant ATTR_COUNT        = 6;

    // 属性初始值、最大可加点、每点消耗的自由点数
    uint8[ATTR_COUNT] internal ATTR_INIT = [10, 1, 1, 0, 3, 1];
    uint8[ATTR_COUNT] internal ATTR_CAP  = [30, 10, 3, 5, 3, 9];
    int8[ATTR_COUNT]  internal ATTR_COST = [int8(1), int8(1), int8(3), int8(1), int8(-1), int8(1)];

    // ── 存储 ──
    mapping(uint256 => uint256) public lobsterStats;   // tokenId => packed 战斗属性 (64 bits)
    mapping(uint256 => uint256) public lobsterVisual;   // tokenId => packed 7×RGB (168 bits = 21 bytes)

    constructor() ClawNFTBase("Claw Arena Lobster", "LOBSTER") {}

    // ── 铸造 ──

    /// @notice 铸造龙虾 NFT（1000 金币 + 0.001 BNB）
    function mint(bytes12 name) external payable returns (uint256) {
        require(name != bytes12(0), "Empty name");
        _chargeMintFee(PRICE_MINT_COINS);

        uint32 rng = _initRng(uint32(uint256(keccak256(abi.encodePacked(block.prevrandao, blockhash(block.number - 1), block.timestamp, nextTokenId)))));

        uint16 skillEffect;
        (rng, skillEffect) = _rollEffect(rng);

        uint8[ATTR_COUNT] memory attrs;
        (rng, attrs) = _distributeStats(rng, FREE_POINTS);

        uint256 visual;
        (rng, visual) = _rollColors7(rng);

        uint256 tokenId = nextTokenId++;
        lobsterStats[tokenId] = _packStats(attrs[0], attrs[1], attrs[2], attrs[3], attrs[4], skillEffect, attrs[5]);
        lobsterVisual[tokenId] = visual;
        nftName[tokenId] = name;
        _mint(msg.sender, tokenId);
        return tokenId;
    }

    /// @notice 管理员铸造默认龙虾（指定属性+颜色，owner=合约）
    function mintDefaultLobster(bytes12 name, uint256 packedStats, uint256 packedVisual) external onlyOwner returns (uint256) {
        require(name != bytes12(0), "Empty name");
        uint256 tokenId = nextTokenId++;
        lobsterStats[tokenId] = packedStats;
        lobsterVisual[tokenId] = packedVisual;
        nftName[tokenId] = name;
        _mint(address(this), tokenId);
        return tokenId;
    }

    /// @notice 批量铸造默认英雄（部署时调用）
    function initDefaultHeroes(uint256[] calldata packedStats, uint256[] calldata packedVisuals, bytes12[] calldata names) external onlyOwner {
        require(defaultCount == 0, "Already initialized");
        require(packedStats.length == packedVisuals.length && packedStats.length == names.length, "Length mismatch");
        for (uint256 i; i < packedStats.length; i++) {
            uint256 tokenId = nextTokenId++;
            lobsterStats[tokenId] = packedStats[i];
            lobsterVisual[tokenId] = packedVisuals[i];
            nftName[tokenId] = names[i];
            _mint(address(this), tokenId);
        }
        defaultCount = nextTokenId;
    }

    // ── View ──

    function getLobsterStats(uint256 tokenId) external view returns (uint256) {
        require(tokenId < nextTokenId, "Not exist");
        return lobsterStats[tokenId];
    }

    function getLobsterVisual(uint256 tokenId) external view returns (uint256) {
        require(tokenId < nextTokenId, "Not exist");
        return lobsterVisual[tokenId];
    }

    function getLobsterName(uint256 tokenId) external view returns (bytes12) {
        require(tokenId < nextTokenId, "Not exist");
        return nftName[tokenId];
    }

    // ── tokenURI → external API (dynamic SVG rendering) ──

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        require(tokenId < nextTokenId, "Not exist");
        return string.concat("https://clawking.cc/api/nft/lobster/", _uint2str(tokenId));
    }

    // ── 内部：属性分配 ──

    function _distributeStats(uint32 rng, uint8 freePoints) internal view returns (uint32, uint8[ATTR_COUNT] memory attrs) {
        for (uint8 i; i < ATTR_COUNT; i++) attrs[i] = ATTR_INIT[i];
        int16 remaining = int16(uint16(freePoints));
        while (remaining > 0) {
            rng = _nextRng(rng);
            uint8 idx = uint8(rng) % ATTR_COUNT;
            for (uint8 j; j < ATTR_COUNT; j++) {
                uint8 tryIdx = (idx + j) % ATTR_COUNT;
                if (attrs[tryIdx] < ATTR_INIT[tryIdx] + ATTR_CAP[tryIdx]) {
                    attrs[tryIdx]++;
                    remaining -= int16(ATTR_COST[tryIdx]);
                    break;
                }
            }
        }
        return (rng, attrs);
    }

    function _rollEffect(uint32 rng) internal pure returns (uint32, uint16) {
        rng = _nextRng(rng);
        uint16 effect = uint16(1) << (uint16(rng) % SKILL_EFFECT_COUNT);
        return (rng, effect);
    }

    // ── 内部：颜色 ──

    function _rollColors7(uint32 rng) internal pure returns (uint32, uint256) {
        uint256 visual;
        for (uint8 i; i < 21; i++) {
            rng = _nextRng(rng);
            visual |= uint256(uint8(rng)) << (i * 8);
        }
        return (rng, visual);
    }

    // ── 内部：打包 ──

    function _packStats(uint8 hp, uint8 atk, uint8 atkRange, uint8 speed, uint8 manaMax, uint16 skillEffect, uint8 skillPower) internal pure returns (uint256) {
        return uint256(hp)
            | (uint256(atk) << 8)
            | (uint256(atkRange) << 16)
            | (uint256(speed) << 24)
            | (uint256(manaMax) << 32)
            | (uint256(skillEffect) << 40)
            | (uint256(skillPower) << 56);
    }

    // ── 内部：RNG ──

    function _initRng(uint32 seed) internal pure returns (uint32) {
        return seed == 0 ? 1 : seed;
    }

    function _nextRng(uint32 state) internal pure returns (uint32) {
        state ^= state << 13;
        state ^= state >> 17;
        state ^= state << 5;
        return state;
    }
}

