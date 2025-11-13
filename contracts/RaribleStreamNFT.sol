// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract RaribleStreamNFT is ERC721URIStorage, Ownable, ReentrancyGuard {
    uint256 private _nextTokenId;
    uint256 public maxSupply;
    uint256 public perWalletLimit;
    mapping(address => uint256) public mintedPerWallet;
    mapping(uint256 => string) private _tokenURIs;

    event Minted(address indexed to, uint256 indexed tokenId, string tokenURI);

    constructor(
        string memory name,
        string memory symbol,
        uint256 _maxSupply,
        uint256 _perWalletLimit,
        address initialOwner
    ) ERC721(name, symbol) Ownable(initialOwner) {
        maxSupply = _maxSupply;
        perWalletLimit = _perWalletLimit;
        _nextTokenId = 1;
    }

    function mint(address to, string memory tokenURI) public nonReentrant {
        require(_nextTokenId <= maxSupply, "Max supply reached");
        require(mintedPerWallet[to] < perWalletLimit, "Per wallet limit reached");

        uint256 tokenId = _nextTokenId;
        _nextTokenId++;

        _safeMint(to, tokenId);
        _setTokenURI(tokenId, tokenURI);
        mintedPerWallet[to]++;

        emit Minted(to, tokenId, tokenURI);
    }

    function totalSupply() public view returns (uint256) {
        return _nextTokenId - 1;
    }

    function _setTokenURI(uint256 tokenId, string memory uri) internal override {
        _tokenURIs[tokenId] = uri;
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        return _tokenURIs[tokenId];
    }
}

