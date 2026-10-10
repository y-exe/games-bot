import { UserError } from '../errors.js';

export function requireButtonOwner(owner: string | undefined, actor: string) {
  if (!owner) throw new UserError('このボタンは古い形式です。コマンドを実行し直してください。');
  if (owner !== actor) throw new UserError('このボタンは最初にコマンドを実行した人専用です。自分でコマンドを実行してください。');
}
