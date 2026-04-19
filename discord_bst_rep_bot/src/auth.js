export function parseCsvEnv(name) {
  return String(process.env[name] || '')
    .split(',')
    .map(v => v.trim())
    .filter(Boolean);
}

export function memberHasAdminAccess(member) {
  const adminRoleIds = new Set(parseCsvEnv('ADMIN_ROLE_IDS'));
  const adminUserIds = new Set(parseCsvEnv('ADMIN_USER_IDS'));
  if (!member) return false;
  if (adminUserIds.has(member.user.id)) return true;
  for (const roleId of adminRoleIds) {
    if (member.roles?.cache?.has(roleId)) return true;
  }
  return false;
}
