import { useEffect, useState } from 'react';
import { ExternalLink, Loader2 } from 'lucide-react';
import axios from 'axios';
import { Card } from './ui/card';
import NumberFlow from "@number-flow/react";

interface RaribleProductCardProps {
  url: string;
}

interface RaribleItem {
  id: string;
  meta?: {
    name: string;
    content?: {
      url: string;
      mimeType: string;
    }[];
    description?: string;
  };
  bestSellOrder?: {
    makePriceUsd?: string;
    makePrice?: string;
    take?: {
        type?: {
            "@type": string;
        };
    };
  };
  collection?: string; // ID of the collection
}

interface RaribleCollection {
  name: string;
}

export function RaribleProductCard({ url }: RaribleProductCardProps) {
  const [item, setItem] = useState<RaribleItem | null>(null);
  const [collectionName, setCollectionName] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(false);

        // Parse URL
        // Example: https://rarible.com/ethereum/items/0x8a9...:7849
        const urlObj = new URL(url);
        const pathParts = urlObj.pathname.split('/');
        // pathParts usually ["", "ethereum", "items", "0x...:123"]
        
        const blockchainIndex = pathParts.indexOf('items') - 1;
        const itemIndex = pathParts.indexOf('items') + 1;

        if (blockchainIndex < 0 || itemIndex >= pathParts.length) {
          throw new Error('Invalid Rarible URL format');
        }

        const blockchain = pathParts[blockchainIndex].toUpperCase();
        const itemAddress = pathParts[itemIndex];
        const itemId = `${blockchain}:${itemAddress}`;

        const apiKey = process.env.NEXT_PUBLIC_RARIBLE_API_KEY;
        const headers = apiKey ? { 'X-API-KEY': apiKey } : {};

        if (!apiKey) {
            console.warn('Rarible API key is missing. Using fallback link.');
            setError(true);
            setLoading(false);
            return;
        }

        // Log current environment for debugging Vercel issue
        console.log('[RaribleProductCard] Fetching for:', itemId);

        // Fetch Item
        const itemResponse = await axios.get<RaribleItem>(
          `https://api.rarible.org/v0.1/items/${itemId}`,
          { headers }
        );
        const itemData = itemResponse.data;
        setItem(itemData);

        // Fetch Collection Name if available
        if (itemData.collection) {
            try {
                const collectionResponse = await axios.get<RaribleCollection>(
                    `https://api.rarible.org/v0.1/collections/${itemData.collection}`,
                    { headers }
                );
                setCollectionName(collectionResponse.data.name);
            } catch (err) {
                console.warn('Failed to fetch collection name', err);
            }
        }

      } catch (err) {
        console.error('Error fetching Rarible item:', err);
        // Log full error details for debugging
        if (axios.isAxiosError(err)) {
            console.error('Axios error details:', {
                message: err.message,
                code: err.code,
                response: err.response?.data,
                status: err.response?.status
            });
        }
        setError(true);
      } finally {
        setLoading(false);
      }
    };

    if (url.includes('rarible.com')) {
      fetchData();
    } else {
        setError(true);
        setLoading(false);
    }
  }, [url]);

  if (error) {
    // Fallback to simple link
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-3 p-4 border border-border rounded-lg hover:bg-accent transition-colors group"
      >
        <ExternalLink className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors flex-shrink-0" />
        <span className="text-sm text-foreground break-all group-hover:underline">
          {url}
        </span>
      </a>
    );
  }

  if (loading) {
    return (
      <div className="w-full h-24 border border-border rounded-lg flex items-center justify-center bg-muted/10">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const imageUrl = item?.meta?.content?.find(c => c.mimeType.startsWith('image'))?.url || item?.meta?.content?.[0]?.url;
  const itemName = item?.meta?.name || 'Unknown Item';
  
  let priceUsd: number | null = null;
  if (item?.bestSellOrder?.makePriceUsd) {
      const rawPrice = item.bestSellOrder.makePriceUsd;
      // Remove "US" prefix if present and parse
      const cleanPrice = rawPrice.replace(/^US/, '');
      priceUsd = parseFloat(cleanPrice);
  }

  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="block group">
      <Card className="overflow-hidden hover:shadow-md transition-all border border-border group-hover:border-primary/20">
        <div className="flex items-center gap-4 p-3">
            {/* Image / Thumbnail */}
            <div className="h-16 w-16 flex-shrink-0 rounded-md overflow-hidden bg-muted">
                {imageUrl ? (
                    <img src={imageUrl} alt={itemName} className="h-full w-full object-cover" />
                ) : (
                    <div className="h-full w-full flex items-center justify-center text-xs text-muted-foreground">No Img</div>
                )}
            </div>
            
            {/* Info */}
            <div className="flex-1 min-w-0">
                <div className="text-xs text-muted-foreground mb-0.5 truncate">
                    {collectionName || 'Collection'}
                </div>
                <h4 className="text-sm font-medium leading-tight truncate text-foreground group-hover:text-primary transition-colors mb-1">
                    {itemName}
                </h4>
                {priceUsd !== null && (
                  <div className="text-sm font-semibold text-[#FAFF00] flex items-center gap-1">
                    <NumberFlow 
                      value={priceUsd} 
                      format={{ style: 'currency', currency: 'USD', currencyDisplay: 'symbol' }}
                      locales="en-US"
                    />
                  </div>
                )}
            </div>
            
            <ExternalLink className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 mr-2" />
        </div>
      </Card>
    </a>
  );
}

