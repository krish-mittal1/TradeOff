// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

contract TradeSettlement is Ownable {
    struct Settlement {
        bytes32 tradeId;
        address trader;
        string pair;
        string side;
        uint256 price;
        uint256 quantity;
        uint256 timestamp;
        bool exists;
    }

    mapping(bytes32 => Settlement) public settlements;
    bytes32[] public settlementIds;

    event TradeSettled(
        bytes32 indexed tradeId,
        address indexed trader,
        string pair,
        string side,
        uint256 price,
        uint256 quantity,
        uint256 timestamp
    );

    constructor() Ownable(msg.sender) {}

    function settleTrade(
        bytes32 _tradeId,
        address _trader,
        string calldata _pair,
        string calldata _side,
        uint256 _price,
        uint256 _quantity
    ) external onlyOwner {
        require(!settlements[_tradeId].exists, "Trade already settled");

        settlements[_tradeId] = Settlement({
            tradeId: _tradeId,
            trader: _trader,
            pair: _pair,
            side: _side,
            price: _price,
            quantity: _quantity,
            timestamp: block.timestamp,
            exists: true
        });

        settlementIds.push(_tradeId);

        emit TradeSettled(_tradeId, _trader, _pair, _side, _price, _quantity, block.timestamp);
    }

    function getSettlement(bytes32 _tradeId) external view returns (
        address trader,
        string memory pair,
        string memory side,
        uint256 price,
        uint256 quantity,
        uint256 timestamp
    ) {
        require(settlements[_tradeId].exists, "Settlement not found");
        Settlement memory s = settlements[_tradeId];
        return (s.trader, s.pair, s.side, s.price, s.quantity, s.timestamp);
    }

    function verifyTrade(bytes32 _tradeId) external view returns (bool) {
        return settlements[_tradeId].exists;
    }

    function totalSettlements() external view returns (uint256) {
        return settlementIds.length;
    }
}
