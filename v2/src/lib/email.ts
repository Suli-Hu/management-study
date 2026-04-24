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

/** Magic link 邮件模板 */
export function renderMagicLinkEmail(params: { email: string; url: string }): { html: string; text: string } {
  const { email, url } = params;
  const text = `你好，

点击下方链接登录全学科学习笔记：

${url}

链接 10 分钟有效，仅可使用一次。如果不是你发起的登录请求，忽略即可。

— 全学科学习笔记
`;

  const html = `<!doctype html>
<html>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'PingFang SC', sans-serif; background: #f5f5f7; margin: 0; padding: 32px 16px;">
  <div style="max-width: 480px; margin: 0 auto; background: #fff; border-radius: 12px; padding: 32px 28px; box-shadow: 0 1px 4px rgba(0,0,0,0.06);">
    <h1 style="font-size: 20px; margin: 0 0 16px; color: #1d1d1f;">登录全学科学习笔记</h1>
    <p style="font-size: 14px; color: #2c2c2e; line-height: 1.7; margin: 0 0 24px;">
      你好，点击下面按钮登录：
    </p>
    <p style="margin: 0 0 24px;">
      <a href="${url}" style="display: inline-block; padding: 10px 20px; background: #007AFF; color: #fff; text-decoration: none; border-radius: 8px; font-size: 14px; font-weight: 600;">登录</a>
    </p>
    <p style="font-size: 12px; color: #86868b; line-height: 1.6; margin: 0 0 8px;">
      如果按钮无法点击，复制下面链接到浏览器：
    </p>
    <p style="font-size: 11px; color: #48484a; word-break: break-all; margin: 0 0 24px; padding: 10px; background: #f5f5f7; border-radius: 6px;">
      ${url}
    </p>
    <p style="font-size: 12px; color: #86868b; line-height: 1.6; margin: 0;">
      链接 10 分钟内有效，仅可使用一次。如果不是你发起的登录请求，忽略即可。
    </p>
  </div>
  <p style="text-align: center; font-size: 11px; color: #86868b; margin-top: 16px;">
    发给 ${email} · 全学科学习笔记
  </p>
</body>
</html>`;

  return { html, text };
}
