#!/bin/sh
set -e

# Start Hardhat node in background
npx hardhat node --hostname 0.0.0.0 &
NODE_PID=$!

# Wait for the node to be ready
echo "Waiting for Hardhat node..."
until node -e "
require('http').request({hostname:'localhost',port:8545,method:'POST',headers:{'Content-Type':'application/json'}},
  function(r){process.exit(r.statusCode===200?0:1)}
).on('error',function(){process.exit(1)})
 .end(JSON.stringify({jsonrpc:'2.0',method:'eth_blockNumber',params:[],id:1}))
" 2>/dev/null; do
  sleep 1
done
echo "Hardhat node is ready"

# Deploy contracts to the local node
npx hardhat run scripts/deploy.js --network localhost
echo "Contracts deployed to local Hardhat node"

# Keep the node running
wait $NODE_PID
