import { ethers } from "ethers"
import * as fs from "fs"
import * as path from "path"

async function main() {
  const provider = new ethers.JsonRpcProvider(process.env.BASE_RPC_URL)
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY!, provider)

  const contractPath = path.join(__dirname, "../artifacts/contracts/RaribleStreamNFT.sol/RaribleStreamNFT.json")
  const contractArtifact = JSON.parse(fs.readFileSync(contractPath, "utf8"))

  const factory = new ethers.ContractFactory(
    contractArtifact.abi,
    contractArtifact.bytecode,
    wallet
  )

  const contract = await factory.deploy(
    "Rarible Stream NFT",
    "RSNFT",
    10000, // maxSupply
    10, // perWalletLimit
    wallet.address // initialOwner
  )

  await contract.waitForDeployment()
  const address = await contract.getAddress()

  console.log("Contract deployed to:", address)
  console.log("Deployment transaction:", contract.deploymentTransaction()?.hash)
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })

