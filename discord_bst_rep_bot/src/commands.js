import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';

export const commands = [
  new SlashCommandBuilder()
    .setName('deal-create')
    .setDescription('Create a proposed BST transaction')
    .addUserOption(o => o.setName('buyer').setDescription('Buyer').setRequired(true))
    .addUserOption(o => o.setName('seller').setDescription('Seller').setRequired(true))
    .addStringOption(o => o.setName('item').setDescription('Item description').setRequired(true))
    .addStringOption(o => o.setName('price').setDescription('Price text').setRequired(false))
    .addStringOption(o => o.setName('notes').setDescription('Optional notes').setRequired(false)),

  new SlashCommandBuilder()
    .setName('deal-confirm')
    .setDescription('Confirm a deal as buyer or seller')
    .addIntegerOption(o => o.setName('deal_id').setDescription('Deal ID').setRequired(true)),

  new SlashCommandBuilder()
    .setName('deal-cancel')
    .setDescription('Cancel a pending deal')
    .addIntegerOption(o => o.setName('deal_id').setDescription('Deal ID').setRequired(true)),

  new SlashCommandBuilder()
    .setName('deal-view')
    .setDescription('View a deal')
    .addIntegerOption(o => o.setName('deal_id').setDescription('Deal ID').setRequired(true)),

  new SlashCommandBuilder()
    .setName('rep')
    .setDescription('View public rep summary for a member')
    .addUserOption(o => o.setName('member').setDescription('Member').setRequired(true)),

  new SlashCommandBuilder()
    .setName('deal-history')
    .setDescription('View public approved deal history for a member')
    .addUserOption(o => o.setName('member').setDescription('Member').setRequired(true)),

  new SlashCommandBuilder()
    .setName('admin-deal-approve')
    .setDescription('Approve a fully confirmed deal')
    .addIntegerOption(o => o.setName('deal_id').setDescription('Deal ID').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  new SlashCommandBuilder()
    .setName('admin-deal-reject')
    .setDescription('Reject a deal')
    .addIntegerOption(o => o.setName('deal_id').setDescription('Deal ID').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
].map(c => c.toJSON());
