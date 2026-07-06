require("@nomicfoundation/hardhat-toolbox");

const SEPOLIA_RPC = process.env.SEPOLIA_RPC_URL || "";
const DEPLOYER_KEY = process.env.DEPLOYER_PRIVATE_KEY || "0x0000000000000000000000000000000000000000000000000000000000000001";

module.exports = {
  solidity: "0.8.20",
  networks: {
    hardhat: {},
    localhost: {
      url: "http://127.0.0.1:8545",
    },
    sepolia: {
      url: SEPOLIA_RPC,
      accounts: [DEPLOYER_KEY],
    },
  },
};
