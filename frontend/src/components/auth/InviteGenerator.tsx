"use client";

import { useRef, useState, type FormEvent } from 'react';
import { accountService, type GeneratedInvites } from '@/services/account';

export function InviteGenerator() {
  const [count, setCount] = useState('1');
  const [days, setDays] = useState('14');
  const [batches, setBatches] = useState<GeneratedInvites[]>([]);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function generate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await accountService.createInvites(Number(count), Number(days));
      setBatches((previous) => [result, ...previous]);
      setNotice(`已生成 ${result.codes.length} 个邀请码`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '生成失败，请稍后重试');
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  async function copy(codes: string[]) {
    try {
      await navigator.clipboard.writeText(codes.join('\n'));
      setNotice('邀请码已复制');
    } catch {
      setNotice('自动复制失败，请选中下方邀请码手动复制');
    }
  }

  return (
    <section id="invite-codes" className="invite-generator" aria-labelledby="invite-heading">
      <h2 id="invite-heading">生成邀请码</h2>
      <p>每个邀请码仅可注册一个普通账号。请私下分享给受邀者。</p>
      <form onSubmit={generate} className="invite-generator__form">
        <label>生成数量
          <input type="number" min={1} max={50} step={1} required value={count}
            onChange={(event) => setCount(event.target.value)} disabled={busy} />
          <small>1–50 个</small>
        </label>
        <label>有效天数
          <input type="number" min={1} max={365} step={1} required value={days}
            onChange={(event) => setDays(event.target.value)} disabled={busy} />
          <small>1–365 天</small>
        </label>
        <button type="submit" disabled={busy}>{busy ? '正在生成…' : '生成邀请码'}</button>
      </form>
      {error && <p role="alert">{error}</p>}
      <p role="status" aria-live="polite">{notice}</p>
      {batches.length > 0 && <p>请及时复制保存。离开或刷新页面后，无法再次查看这些邀请码。</p>}
      {batches.map((batch) => (
        <div className="invite-generator__batch" key={batch.codes[0]}>
          <div className="invite-generator__batch-heading">
            <span>{batch.codes.length} 个 · 到期时间：{new Date(batch.expires_at).toLocaleString('zh-CN')}</span>
            <button type="button" onClick={() => void copy(batch.codes)}>复制本批邀请码</button>
          </div>
          <label className="invite-generator__codes">邀请码（每行一个）
            <textarea readOnly value={batch.codes.join('\n')} rows={Math.min(8, batch.codes.length + 1)}
              spellCheck={false} />
          </label>
        </div>
      ))}
    </section>
  );
}
