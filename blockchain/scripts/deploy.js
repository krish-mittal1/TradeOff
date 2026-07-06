const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying with account:", deployer.address);
  console.log("Balance:", hre.ethers.formatEther(await hre.ethers.provider.getBalance(deployer.address)), "ETH");

  // Deploy TradeOff Token
  const Token = await hre.ethers.getContractFactory("TradeOffToken");
  const token = await Token.deploy();
  await token.waitForDeployment();
  const tokenAddress = await token.getAddress();
  console.log("TradeOffToken deployed to:", tokenAddress);

  // Deploy Trade Settlement
  const Settlement = await hre.ethers.getContractFactory("TradeSettlement");
  const settlement = await Settlement.deploy();
  await settlement.waitForDeployment();
  const settlementAddress = await settlement.getAddress();
  console.log("TradeSettlement deployed to:", settlementAddress);

  // Save deployment addresses
  const deployment = {
    network: hre.network.name,
    tokenAddress,
    settlementAddress,
    deployer: deployer.address,
    timestamp: new Date().toISOString(),
  };

  const outDir = path.join(__dirname, "..", "deployments");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);
  fs.writeFileSync(
    path.join(outDir, `${hre.network.name}.json`),
    JSON.stringify(deployment, null, 2)
  );
  console.log("Deployment saved to deployments/" + hre.network.name + ".json");

  // Copy ABIs for frontend/backend
  const artifactsDir = path.join(__dirname, "..", "artifacts", "contracts");
  const abiDir = path.join(__dirname, "..", "abi");
  if (!fs.existsSync(abiDir)) fs.mkdirSync(abiDir);

  const tokenArtifact = JSON.parse(
    fs.readFileSync(path.join(artifactsDir, "TradeOffToken.sol", "TradeOffToken.json"))
  );
  const settlementArtifact = JSON.parse(
    fs.readFileSync(path.join(artifactsDir, "TradeSettlement.sol", "TradeSettlement.json"))
  );

  fs.writeFileSync(path.join(abiDir, "TradeOffToken.json"), JSON.stringify(tokenArtifact.abi, null, 2));
  fs.writeFileSync(path.join(abiDir, "TradeSettlement.json"), JSON.stringify(settlementArtifact.abi, null, 2));
  console.log("ABIs exported to abi/");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
