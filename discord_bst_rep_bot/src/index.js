import 'dotenv/config';
import { Client, GatewayIntentBits } from 'discord.js';
import { createDeal, getDealById, confirmDeal, cancelDeal, approveDeal, rejectDeal, getApprovedDealsForUser, getRepSummary } from './db.js';
import { memberHasAdminAccess } from './auth.js';
import { formatDeal, formatRepSummary } from './format.js';

const token = process.env.DISCORD_BOT_TOKEN;
if (!token) {
  console.error('Missing DISCORD_BOT_TOKEN');
  process.exit(1);
}

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });

client.once('ready', () => {
  console.log(`ExchangeBot logged in as ${client.user.tag}`);
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  try {
    if (interaction.commandName === 'deal-create') {
      const buyer = interaction.options.getUser('buyer', true);
      const seller = interaction.options.getUser('seller', true);
      const item = interaction.options.getString('item', true);
      const price = interaction.options.getString('price') || '';
      const notes = interaction.options.getString('notes') || '';

      if (buyer.id === seller.id) {
        await interaction.reply({ content: 'Buyer and seller must be different members.', ephemeral: true });
        return;
      }

      const deal = createDeal({
        guildId: interaction.guildId,
        channelId: interaction.channelId,
        createdByUserId: interaction.user.id,
        buyerUserId: buyer.id,
        sellerUserId: seller.id,
        item,
        priceText: price,
        notes,
      });

      await interaction.reply({ content: `Deal created.\n\n${formatDeal(deal)}` });
      return;
    }

    if (interaction.commandName === 'deal-confirm') {
      const dealId = interaction.options.getInteger('deal_id', true);
      const deal = getDealById(dealId);
      if (!deal) {
        await interaction.reply({ content: 'Deal not found.', ephemeral: true });
        return;
      }
      if (![deal.buyer_user_id, deal.seller_user_id].includes(interaction.user.id)) {
        await interaction.reply({ content: 'Only the listed buyer or seller can confirm this deal.', ephemeral: true });
        return;
      }
      const updated = confirmDeal(dealId, interaction.user.id);
      await interaction.reply({ content: `Deal updated.\n\n${formatDeal(updated)}` });
      return;
    }

    if (interaction.commandName === 'deal-cancel') {
      const dealId = interaction.options.getInteger('deal_id', true);
      const deal = getDealById(dealId);
      if (!deal) {
        await interaction.reply({ content: 'Deal not found.', ephemeral: true });
        return;
      }
      if (![deal.created_by_user_id, deal.buyer_user_id, deal.seller_user_id].includes(interaction.user.id) && !memberHasAdminAccess(interaction.member)) {
        await interaction.reply({ content: 'You cannot cancel this deal.', ephemeral: true });
        return;
      }
      const updated = cancelDeal(dealId);
      await interaction.reply({ content: `Deal cancelled.\n\n${formatDeal(updated)}` });
      return;
    }

    if (interaction.commandName === 'deal-view') {
      const dealId = interaction.options.getInteger('deal_id', true);
      const deal = getDealById(dealId);
      await interaction.reply({ content: formatDeal(deal), ephemeral: false });
      return;
    }

    if (interaction.commandName === 'rep' || interaction.commandName === 'deal-history') {
      const member = interaction.options.getUser('member', true);
      const summary = getRepSummary(member.id);
      const deals = getApprovedDealsForUser(member.id, interaction.commandName === 'rep' ? 5 : 20);
      await interaction.reply({ content: formatRepSummary(member.id, summary, deals) });
      return;
    }

    if (interaction.commandName === 'admin-deal-approve' || interaction.commandName === 'admin-deal-reject') {
      if (!memberHasAdminAccess(interaction.member)) {
        await interaction.reply({ content: 'Admin access required.', ephemeral: true });
        return;
      }
      const dealId = interaction.options.getInteger('deal_id', true);
      const deal = getDealById(dealId);
      if (!deal) {
        await interaction.reply({ content: 'Deal not found.', ephemeral: true });
        return;
      }
      const updated = interaction.commandName === 'admin-deal-approve'
        ? approveDeal(dealId, interaction.user.id)
        : rejectDeal(dealId, interaction.user.id);
      await interaction.reply({ content: `${interaction.commandName === 'admin-deal-approve' ? 'Deal approved' : 'Deal rejected'}.\n\n${formatDeal(updated)}` });
    }
  } catch (error) {
    console.error(error);
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp({ content: 'Something went wrong.', ephemeral: true }).catch(() => {});
    } else {
      await interaction.reply({ content: 'Something went wrong.', ephemeral: true }).catch(() => {});
    }
  }
});

client.login(token);
