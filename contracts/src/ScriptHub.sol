// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "./ClawNFTBase.sol";

/// @title ScriptHub - 脚本 NFT 合约
/// @notice 脚本铸造收 100 金币 + 0.001 BNB。playMatch 只传 tokenId。
contract ScriptHub is ClawNFTBase {

    uint256 constant PRICE_MINT_COINS = 100;

    mapping(uint256 => bytes) internal _scriptData;

    constructor() ClawNFTBase("Claw Arena Script", "SCRIPT") {}

    // ── 铸造 ──

    /// @notice 铸造脚本 NFT（100 金币 + 0.001 BNB）
    function mintScript(bytes12 name, bytes calldata scriptBytes) external payable returns (uint256) {
        require(scriptBytes.length > 0 && scriptBytes.length <= 1024, "Invalid script size");
        _chargeMintFee(PRICE_MINT_COINS);
        uint256 tokenId = nextTokenId++;
        _scriptData[tokenId] = scriptBytes;
        if (name != bytes12(0)) nftName[tokenId] = name;
        _mint(msg.sender, tokenId);
        return tokenId;
    }

    /// @notice 更新自己的脚本（默认脚本不可修改）
    function updateScript(uint256 tokenId, bytes calldata scriptBytes) external {
        require(ownerOf(tokenId) == msg.sender, "Not owner");
        require(tokenId >= defaultCount, "Default script");
        require(scriptBytes.length > 0 && scriptBytes.length <= 1024, "Invalid script size");
        _scriptData[tokenId] = scriptBytes;
    }

    /// @notice 管理员铸造默认脚本（owner=合约，所有人可用）
    function mintDefaultScript(bytes12 name, bytes calldata scriptBytes) external onlyOwner returns (uint256) {
        require(scriptBytes.length > 0, "Empty script");
        uint256 tokenId = nextTokenId++;
        _scriptData[tokenId] = scriptBytes;
        nftName[tokenId] = name;
        _mint(address(this), tokenId);
        return tokenId;
    }

    /// @notice 批量铸造默认脚本（部署时调用）
    function initDefaultScripts(bytes12[] calldata names, bytes[] calldata scripts) external onlyOwner {
        require(defaultCount == 0, "Already initialized");
        require(names.length == scripts.length, "Length mismatch");
        for (uint256 i; i < scripts.length; i++) {
            uint256 tokenId = nextTokenId++;
            _scriptData[tokenId] = scripts[i];
            if (names[i] != bytes12(0)) nftName[tokenId] = names[i];
            _mint(address(this), tokenId);
        }
        defaultCount = nextTokenId;
    }

    // ── View ──

    /// @notice 获取脚本字节码（ClawArena executeMatch 调用）
    function getScriptBytes(uint256 tokenId) external view returns (bytes memory) {
        require(tokenId < nextTokenId, "Not exist");
        return _scriptData[tokenId];
    }

    function getScriptName(uint256 tokenId) external view returns (bytes12) {
        require(tokenId < nextTokenId, "Not exist");
        return nftName[tokenId];
    }

    // ── tokenURI → external API ──

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        require(tokenId < nextTokenId, "Not exist");
        return string.concat("https://clawking.cc/api/nft/script/", _uint2str(tokenId));
    }
}
