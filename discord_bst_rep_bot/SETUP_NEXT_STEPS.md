# ExchangeBot next steps

## 1. Copy env template

```bash
cp .env.example .env
```

## 2. Fill in values

Required:
- DISCORD_BOT_TOKEN
- DISCORD_CLIENT_ID
- DISCORD_GUILD_ID

Optional admin config:
- ADMIN_ROLE_IDS=comma,separated,role,ids
- ADMIN_USER_IDS=comma,separated,user,ids

## 3. Register commands to your test server

```bash
npm run register
```

## 4. Start the bot

```bash
npm start
```

## 5. Test flow

1. `/deal-create`
2. buyer runs `/deal-confirm`
3. seller runs `/deal-confirm`
4. admin runs `/admin-deal-approve`
5. check `/rep @user`
6. check `/deal-history @user`
