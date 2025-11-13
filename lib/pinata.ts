import axios from "axios"

const PINATA_API_KEY = process.env.PINATA_API_KEY!
const PINATA_SECRET_API_KEY = process.env.PINATA_SECRET_API_KEY!

export async function pinJSONToIPFS(json: object) {
  try {
    const response = await axios.post(
      "https://api.pinata.cloud/pinning/pinJSONToIPFS",
      json,
      {
        headers: {
          "Content-Type": "application/json",
          pinata_api_key: PINATA_API_KEY,
          pinata_secret_api_key: PINATA_SECRET_API_KEY,
        },
      }
    )
    return `ipfs://${response.data.IpfsHash}`
  } catch (error) {
    console.error("Error pinning to IPFS:", error)
    throw error
  }
}

export async function pinFileToIPFS(file: File) {
  try {
    const formData = new FormData()
    formData.append("file", file)

    const response = await axios.post(
      "https://api.pinata.cloud/pinning/pinFileToIPFS",
      formData,
      {
        headers: {
          "Content-Type": "multipart/form-data",
          pinata_api_key: PINATA_API_KEY,
          pinata_secret_api_key: PINATA_SECRET_API_KEY,
        },
      }
    )
    return `ipfs://${response.data.IpfsHash}`
  } catch (error) {
    console.error("Error pinning file to IPFS:", error)
    throw error
  }
}

