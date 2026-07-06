const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("TradeSettlement", function () {
  let settlement, token, owner, trader;

  beforeEach(async function () {
    [owner, trader] = await ethers.getSigners();

    const Token = await ethers.getContractFactory("TradeOffToken");
    token = await Token.deploy();

    const Settlement = await ethers.getContractFactory("TradeSettlement");
    settlement = await Settlement.deploy();
  });

  describe("TradeOffToken", function () {
    it("should have correct name and symbol", async function () {
      expect(await token.name()).to.equal("TradeOff");
      expect(await token.symbol()).to.equal("TFO");
    });

    it("should mint 1M tokens to deployer", async function () {
      const balance = await token.balanceOf(owner.address);
      expect(balance).to.equal(ethers.parseEther("1000000"));
    });

    it("should allow faucet claim", async function () {
      await token.connect(trader).faucet();
      const balance = await token.balanceOf(trader.address);
      expect(balance).to.equal(ethers.parseEther("1000"));
    });
  });

  describe("TradeSettlement", function () {
    it("should settle a trade", async function () {
      const tradeId = ethers.keccak256(ethers.toUtf8Bytes("trade-001"));
      await settlement.settleTrade(
        tradeId, trader.address, "BTCUSDT", "BUY", 6500000000000, 100000000
      );

      const result = await settlement.getSettlement(tradeId);
      expect(result.trader).to.equal(trader.address);
      expect(result.pair).to.equal("BTCUSDT");
      expect(result.side).to.equal("BUY");
    });

    it("should verify a settled trade", async function () {
      const tradeId = ethers.keccak256(ethers.toUtf8Bytes("trade-002"));
      expect(await settlement.verifyTrade(tradeId)).to.be.false;

      await settlement.settleTrade(
        tradeId, trader.address, "ETHUSDT", "SELL", 350000000000, 500000000
      );
      expect(await settlement.verifyTrade(tradeId)).to.be.true;
    });

    it("should reject duplicate settlement", async function () {
      const tradeId = ethers.keccak256(ethers.toUtf8Bytes("trade-003"));
      await settlement.settleTrade(
        tradeId, trader.address, "BTCUSDT", "BUY", 6500000000000, 100000000
      );
      await expect(
        settlement.settleTrade(tradeId, trader.address, "BTCUSDT", "BUY", 6500000000000, 100000000)
      ).to.be.revertedWith("Trade already settled");
    });

    it("should only allow owner to settle", async function () {
      const tradeId = ethers.keccak256(ethers.toUtf8Bytes("trade-004"));
      await expect(
        settlement.connect(trader).settleTrade(
          tradeId, trader.address, "BTCUSDT", "BUY", 6500000000000, 100000000
        )
      ).to.be.reverted;
    });

    it("should track total settlements", async function () {
      expect(await settlement.totalSettlements()).to.equal(0);

      const id1 = ethers.keccak256(ethers.toUtf8Bytes("t1"));
      await settlement.settleTrade(id1, trader.address, "BTCUSDT", "BUY", 100, 100);

      const id2 = ethers.keccak256(ethers.toUtf8Bytes("t2"));
      await settlement.settleTrade(id2, trader.address, "ETHUSDT", "SELL", 200, 200);

      expect(await settlement.totalSettlements()).to.equal(2);
    });
  });
});
