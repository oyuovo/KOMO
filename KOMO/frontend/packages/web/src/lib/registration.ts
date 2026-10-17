/** 与后端 RegisterRequest 保持一致；服务端仍是最终校验边界。 */
export function registrationError(password: string, confirmation: string): string | null {
  if (password.length < 8 || password.length > 100) return '密码长度需为 8–100 位';
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return '密码需同时包含字母和数字';
  if (password !== confirmation) return '两次输入的密码不一致';
  return null;
}
