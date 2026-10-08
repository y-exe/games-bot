import {randomUUID} from 'node:crypto';
export class UserError extends Error {constructor(message:string){super(redact(message));this.name='UserError';}}
export class ServiceError extends Error {
  constructor(message:string,readonly status?:number,cause?:unknown){super(redact(message),{cause});this.name='ServiceError';}
}
export function redact(text:string) {
  let safe=text;
  for(const [key,value]of Object.entries(process.env))if(value&&/token|secret|password|api.?key|database_url/i.test(key)) {
    safe=safe.split(value).join('[REDACTED]').split(encodeURIComponent(value)).join('[REDACTED]');
  }
  return safe.replace(/-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?-----END [^-]*PRIVATE KEY-----/g,'[PRIVATE KEY省略]')
    .replace(/\b(?:postgres(?:ql)?|mysql|redis):\/\/[^\s`'"<>]+/gi,'[DB接続情報省略]')
    .replace(/(https?:\/\/)[^/\s:@]+:[^/@\s]+@/gi,'$1[REDACTED]@')
    .replace(/(\bauthorization\b["']?\s*[:=]\s*)["']?[^\r\n"',]+/gi,'$1[REDACTED]')
    .replace(/(\b(?:password|secret|token|api[_-]?key)\b["']?\s*[:=]\s*)(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')/gi,'$1[REDACTED]')
    .replace(/(\b(?:password|secret|token|api[_-]?key)\b["']?\s*[:=]\s*)["']?[^,\s"'`]+/gi,'$1[REDACTED]')
    .replace(/\b(Bearer|Bot)\s+[\w.-]+/gi,'$1 [REDACTED]')
    .replace(/(\/webhooks\/\d+\/)[^/?\s`'"<>]+/gi,'$1[REDACTED]')
    .replace(/([?&](?:key|token|api_key|access_token|password|secret)=)[^&\s`'"<>]+/gi,'$1[REDACTED]')
    .replace(/[\w-]{20,}\.[\w-]{6,}\.[\w-]{20,}/g,'[REDACTED]')
    .replaceAll(process.cwd(),'[workspace]').replace(/[A-Z]:[\\/]Users[\\/][^\\/\s]+/gi,'[user-home]');
}
export function errorReport(error:unknown,operation:string) {
  const id=randomUUID().slice(0,8),friendly=error instanceof UserError;
  const message=redact(error instanceof Error?error.message:'詳細不明の例外が発生しました。').replace(/。(?!\n|$)/g,'。\n').slice(0,700);
  const stack=redact(error instanceof Error?error.stack??message:message).replaceAll('```','\u02cb\u02cb\u02cb').split('\n').slice(0,8).join('\n').slice(0,1400);
  const cause=error instanceof Error&&error.cause instanceof Error?redact(`${error.cause.name}: ${error.cause.message}`).replaceAll('`','').slice(0,250):'';
  const context=redact(operation).replaceAll('`','').slice(0,100);
  if(!friendly)console.error(`[error:${id}] ${context}\n${stack}${cause?`\n原因: ${cause}`:''}`);
  return {id,friendly,message,body:friendly?message:`処理を完了できませんでした。時間をおいて再試行してください。\nエラーID: \`${id}\``};
}
