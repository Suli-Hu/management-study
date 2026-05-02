/**
 * Email 发送 — Resend API 封装，stub fallback 供 dev / 未配置时 logging。
 *
 * Resend：https://resend.com/docs/api-reference/emails/send-email
 * 免费 100/day，测试模式用 onboarding@resend.dev → 只能发给账号注册邮箱
 * （足够个人使用；上 custom domain + DNS 后可发任意收件人）
 */

import type { Env } from './db';

export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export async function sendEmail(env: Env, opts: SendEmailOptions): Promise<void> {
  const apiKey = env.RESEND_API_KEY;
  const from = env.RESEND_FROM ?? 'onboarding@resend.dev';

  if (!apiKey) {
    // 开发 / 未配置 —— 打 log，不发真邮件。靠 server log 能拿到链接手动验证
    console.warn('[email] RESEND_API_KEY 未设，stub 模式 — 邮件内容打 server log');
    console.log(`[email] to=${opts.to}`);
    console.log(`[email] subject=${opts.subject}`);
    console.log(`[email] text:\n${opts.text}`);
    return;
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      text: opts.text,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend API failed (${res.status}): ${body}`);
  }
}

/** v0.7.5 改邮箱验证码邮件模板（发到用户提交的"新邮箱"，确认所有权） */
export function renderEmailChangeCodeEmail(params: {
  newEmail: string;
  code: string;
}): { html: string; text: string } {
  const { newEmail, code } = params;
  const codeDisplay = `${code.slice(0, 3)} ${code.slice(3)}`;

  const text = `有人申请把账号邮箱改为 ${newEmail}。

如果是你本人，回设置页输入这个 6 位验证码确认：

    ${codeDisplay}

验证码 30 分钟内有效。如果不是你发起的，忽略即可——你的账号邮箱不会改变。

— 全学科学习笔记
`;

  const html = `<!doctype html>
<html>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'PingFang SC', sans-serif; background: #f5f5f7; margin: 0; padding: 32px 16px;">
  <div style="max-width: 480px; margin: 0 auto; background: #fff; border-radius: 12px; padding: 32px 28px; box-shadow: 0 1px 4px rgba(0,0,0,0.06);">
    <h1 style="font-size: 20px; margin: 0 0 16px; color: #1d1d1f;">确认邮箱变更</h1>

    <p style="font-size: 13px; color: #86868b; line-height: 1.7; margin: 0 0 8px;">
      回设置页输入这个 6 位验证码：
    </p>
    <div style="margin: 0 0 28px; padding: 20px 24px; background: #f5f5f7; border-radius: 10px; text-align: center; font-family: 'SF Mono', Menlo, monospace; font-size: 28px; font-weight: 700; color: #1d1d1f; letter-spacing: 0.15em;">
      ${codeDisplay}
    </div>

    <p style="font-size: 12px; color: #86868b; line-height: 1.6; margin: 0;">
      验证码 30 分钟内有效。如果不是你发起的，忽略即可。
    </p>
  </div>
  <p style="text-align: center; font-size: 11px; color: #86868b; margin-top: 16px;">
    发给 ${newEmail} · 全学科学习笔记
  </p>
</body>
</html>`;

  return { html, text };
}

/** v0.7.4 忘记密码 reset link 邮件模板（含 30 分钟有效链接） */
export function renderPasswordResetEmail(params: {
  email: string;
  url: string;
}): { html: string; text: string } {
  const { email, url } = params;

  const text = `你申请了重置密码。

点击下面这个链接设置新密码（30 分钟内有效，仅可使用一次）：

    ${url}

如果不是你发起的请求，忽略即可——你的密码不会改变。

— 全学科学习笔记
`;

  const html = `<!doctype html>
<html>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'PingFang SC', sans-serif; background: #f5f5f7; margin: 0; padding: 32px 16px;">
  <div style="max-width: 480px; margin: 0 auto; background: #fff; border-radius: 12px; padding: 32px 28px; box-shadow: 0 1px 4px rgba(0,0,0,0.06);">
    <h1 style="font-size: 20px; margin: 0 0 16px; color: #1d1d1f;">重置密码</h1>

    <p style="font-size: 13px; color: #86868b; line-height: 1.7; margin: 0 0 20px;">
      点击下面的按钮设置新密码（30 分钟内有效，仅可使用一次）：
    </p>

    <p style="margin: 0 0 24px;">
      <a href="${url}" style="display: inline-block; padding: 10px 20px; background: #007AFF; color: #fff; text-decoration: none; border-radius: 8px; font-size: 14px; font-weight: 600;">设置新密码</a>
    </p>

    <p style="font-size: 11px; color: #48484a; word-break: break-all; margin: 0 0 24px; padding: 10px; background: #fafafa; border-radius: 6px; border: 1px solid #eee;">
      ${url}
    </p>

    <p style="font-size: 12px; color: #86868b; line-height: 1.6; margin: 0;">
      如果不是你发起的请求，忽略即可——你的密码不会改变。
    </p>
  </div>
  <p style="text-align: center; font-size: 11px; color: #86868b; margin-top: 16px;">
    发给 ${email} · 全学科学习笔记
  </p>
</body>
</html>`;

  return { html, text };
}

/** v0.7.2 注册验证码邮件模板（仅 6 位 code，无 magic-link） */
export function renderSignupCodeEmail(params: {
  email: string;
  code: string;
}): { html: string; text: string } {
  const { email, code } = params;
  const codeDisplay = `${code.slice(0, 3)} ${code.slice(3)}`;

  const text = `欢迎使用全学科学习笔记。

完成注册请输入下面这个 6 位验证码：

    ${codeDisplay}

验证码 30 分钟内有效。如果不是你发起的注册请求，忽略即可。

— 全学科学习笔记
`;

  const html = `<!doctype html>
<html>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'PingFang SC', sans-serif; background: #f5f5f7; margin: 0; padding: 32px 16px;">
  <div style="max-width: 480px; margin: 0 auto; background: #fff; border-radius: 12px; padding: 32px 28px; box-shadow: 0 1px 4px rgba(0,0,0,0.06);">
    <h1 style="font-size: 20px; margin: 0 0 16px; color: #1d1d1f;">完成注册</h1>

    <p style="font-size: 13px; color: #86868b; line-height: 1.7; margin: 0 0 8px;">
      在注册页面输入这个 6 位验证码：
    </p>
    <div style="margin: 0 0 28px; padding: 20px 24px; background: #f5f5f7; border-radius: 10px; text-align: center; font-family: 'SF Mono', Menlo, monospace; font-size: 28px; font-weight: 700; color: #1d1d1f; letter-spacing: 0.15em;">
      ${codeDisplay}
    </div>

    <p style="font-size: 12px; color: #86868b; line-height: 1.6; margin: 0;">
      验证码 30 分钟内有效。如果不是你发起的注册请求，忽略即可。
    </p>
  </div>
  <p style="text-align: center; font-size: 11px; color: #86868b; margin-top: 16px;">
    发给 ${email} · 全学科学习笔记
  </p>
</body>
</html>`;

  return { html, text };
}
