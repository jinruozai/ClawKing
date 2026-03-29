/**
 * Cloudflare Pages Function: /api/nft/script/:id
 * Returns ERC721 metadata JSON with script_logo.png as image.
 */
import { getAddresses, getScriptData } from '../_chain';

export const onRequest: PagesFunction = async (context) => {
  const tokenId = Number(context.params.id);
  if (isNaN(tokenId) || tokenId < 0) return new Response('Invalid token ID', { status: 400 });

  try {
    const addrs = await getAddresses();
    const data = await getScriptData(addrs.script, tokenId);

    const complexity = data.numSlots * 2 + data.numRules;
    let tier = 'Common';
    if (complexity >= 20) tier = 'Legendary';
    else if (complexity >= 14) tier = 'Epic';
    else if (complexity >= 8) tier = 'Rare';

    const metadata = {
      name: data.name,
      description: `ClawKing AI Strategy NFT — ${data.numSlots} slots, ${data.numRules} rules`,
      image: 'https://clawking.cc/script_logo.png',
      attributes: [
        { trait_type: 'Slots', value: data.numSlots },
        { trait_type: 'Rules', value: data.numRules },
        { trait_type: 'Size', value: `${data.size} bytes` },
        { trait_type: 'Tier', value: tier },
      ],
    };

    return new Response(JSON.stringify(metadata), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=3600' },
    });
  } catch (err: any) {
    return new Response(`Error: ${err.message}`, { status: 500 });
  }
};
