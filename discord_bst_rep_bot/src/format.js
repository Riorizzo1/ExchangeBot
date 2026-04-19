export function userRef(id) {
  return `<@${id}>`;
}

export function formatDeal(deal) {
  if (!deal) return 'Deal not found.';
  return [
    `Deal #${deal.id}`,
    `Buyer: ${userRef(deal.buyer_user_id)}`,
    `Seller: ${userRef(deal.seller_user_id)}`,
    `Item: ${deal.item}`,
    `Price: ${deal.price_text || 'n/a'}`,
    `Status: ${deal.status}`,
    `Buyer confirmed: ${deal.buyer_confirmed_at ? 'yes' : 'no'}`,
    `Seller confirmed: ${deal.seller_confirmed_at ? 'yes' : 'no'}`,
  ].join('\n');
}

export function formatRepSummary(userId, summary, deals) {
  const lines = [
    `Reputation for ${userRef(userId)}`,
    `Bought: ${summary.bought}`,
    `Sold: ${summary.sold}`,
    `Total approved deals: ${summary.total}`,
    '',
    'Recent history:',
  ];
  if (!deals.length) {
    lines.push('No approved deal history yet.');
    return lines.join('\n');
  }
  for (const deal of deals) {
    const role = deal.buyer_user_id === userId ? 'Bought' : 'Sold';
    const otherParty = deal.buyer_user_id === userId ? userRef(deal.seller_user_id) : userRef(deal.buyer_user_id);
    lines.push(`• ${role}: ${deal.item} (${deal.price_text || 'n/a'}) with ${otherParty}`);
  }
  return lines.join('\n');
}
