"use client";

import { toast } from '@lobehub/ui';
import { Button, Input, Modal, Segmented } from 'antd';
import { Check, LogIn, LogOut, RefreshCw, ShieldCheck, UserPlus } from 'lucide-react';
import Image from 'next/image';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import {
  accountService,
  AccountUser,
  AUTH_CHANGED_EVENT,
  CaptchaChallenge,
} from '@/services/account';
import { USER_AVATAR_UPDATED_EVENT } from '@/services/profile';
import { UserAvatarUpload } from '@/components/profile/UserAvatarUpload';

type AuthMode = 'login' | 'register';

export function AuthControl() {
  const [user, setUser] = useState<AccountUser | null>(null);
  const [checking, setChecking] = useState(true);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<AuthMode>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [captchaCode, setCaptchaCode] = useState('');
  const [captcha, setCaptcha] = useState<CaptchaChallenge | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [captchaLoading, setCaptchaLoading] = useState(false);

  useEffect(() => {
    let active = true;
    void accountService.me()
      .then((account) => {
        if (active) setUser(account);
      })
      .catch(() => {
        localStorage.removeItem('token');
        if (active) setUser(null);
      })
      .finally(() => {
        if (active) setChecking(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const refreshCaptcha = useCallback(async () => {
    try {
      setCaptchaLoading(true);
      setCaptchaCode('');
      setCaptcha(await accountService.captcha());
    } catch (error) {
      toast.error({
        title: '验证码加载失败',
        description: error instanceof Error ? error.message : '请稍后重试',
      });
    } finally {
      setCaptchaLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) void refreshCaptcha();
  }, [open, mode, refreshCaptcha]);

  const passwordChecks = useMemo(
    () => ({
      length: password.length >= 8,
      letter: /[A-Za-z]/.test(password),
      number: /\d/.test(password),
      symbol: /[^A-Za-z0-9]/.test(password),
    }),
    [password],
  );
  const passwordValid = Object.values(passwordChecks).every(Boolean);

  const resetForm = () => {
    setPassword('');
    setConfirmPassword('');
    setCaptchaCode('');
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!captcha) return;
    if (mode === 'register' && !passwordValid) {
      toast.error('密码需要同时包含字母、数字和特殊字符');
      return;
    }
    if (mode === 'register' && password !== confirmPassword) {
      toast.error('两次输入的密码不一致');
      return;
    }
    try {
      setSubmitting(true);
      const credentials = {
        username: username.trim(),
        password,
        captcha_id: captcha.captcha_id,
        captcha_code: captchaCode.trim(),
      };
      const result = mode === 'login'
        ? await accountService.login(credentials)
        : await accountService.register(credentials);
      localStorage.removeItem('token');
      setUser(result.user);
      setOpen(false);
      resetForm();
      window.dispatchEvent(new CustomEvent(AUTH_CHANGED_EVENT, { detail: result.user }));
      toast.success(mode === 'login' ? '登录成功' : '账号创建成功');
    } catch (error) {
      toast.error({
        title: mode === 'login' ? '登录失败' : '注册失败',
        description: error instanceof Error ? error.message : '请检查输入内容',
      });
      await refreshCaptcha();
    } finally {
      setSubmitting(false);
    }
  };

  const handleLogout = async () => {
    try {
      await accountService.logout();
    } catch {
      // The local token must still be cleared if the session already expired.
    }
    localStorage.removeItem('token');
    setUser(null);
    window.dispatchEvent(new CustomEvent(AUTH_CHANGED_EVENT, { detail: null }));
    window.dispatchEvent(new CustomEvent(USER_AVATAR_UPDATED_EVENT, { detail: null }));
    toast.success('已退出登录');
  };

  if (checking) return <span className="site-header__auth-skeleton" aria-label="检查登录状态" />;

  return (
    <>
      {user ? (
        <div className="site-header__account">
          <UserAvatarUpload label={user.username} />
          <button
            aria-label="退出登录"
            className="site-header__logout-button"
            onClick={handleLogout}
            title="退出登录"
            type="button"
          >
            <LogOut size={15} aria-hidden="true" />
          </button>
        </div>
      ) : (
        <button
          aria-label="登录或注册"
          className="site-header__login-button"
          onClick={() => setOpen(true)}
          type="button"
        >
          <LogIn size={16} aria-hidden="true" />
          <span>登录 / 注册</span>
        </button>
      )}

      <Modal
        centered
        destroyOnHidden
        footer={null}
        onCancel={() => {
          setOpen(false);
          resetForm();
        }}
        open={open}
        title={null}
        width={430}
      >
        <form className="auth-dialog" onSubmit={handleSubmit}>
          <div className="auth-dialog__heading">
            <span className="auth-dialog__icon"><ShieldCheck size={22} /></span>
            <div>
              <h2>{mode === 'login' ? '登录 AniNexus' : '创建你的空间'}</h2>
              <p>收藏、头像和 AI 推荐将保存到你的账号。</p>
            </div>
          </div>

          <Segmented<AuthMode>
            block
            onChange={(value) => {
              setMode(value);
              resetForm();
            }}
            options={[
              { label: '登录', value: 'login', icon: <LogIn size={14} /> },
              { label: '注册', value: 'register', icon: <UserPlus size={14} /> },
            ]}
            value={mode}
          />

          <label className="auth-field">
            <span>用户名</span>
            <Input
              autoFocus
              autoComplete="username"
              maxLength={24}
              minLength={3}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="3–24 位中文、字母、数字或下划线"
              required
              size="large"
              value={username}
            />
          </label>

          <label className="auth-field">
            <span>密码</span>
            <Input.Password
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              maxLength={128}
              minLength={8}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="输入密码"
              required
              size="large"
              value={password}
            />
          </label>

          {mode === 'register' && (
            <>
              <div className="auth-password-rules" aria-label="密码要求">
                {[
                  ['length', '至少 8 位'],
                  ['letter', '包含字母'],
                  ['number', '包含数字'],
                  ['symbol', '包含特殊字符'],
                ].map(([key, label]) => (
                  <span className={passwordChecks[key as keyof typeof passwordChecks] ? 'valid' : ''} key={key}>
                    <Check size={12} /> {label}
                  </span>
                ))}
              </div>
              <label className="auth-field">
                <span>确认密码</span>
                <Input.Password
                  autoComplete="new-password"
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  placeholder="再次输入密码"
                  required
                  size="large"
                  status={confirmPassword && confirmPassword !== password ? 'error' : undefined}
                  value={confirmPassword}
                />
              </label>
            </>
          )}

          <label className="auth-field">
            <span>随机验证码</span>
            <div className="auth-captcha-row">
              <Input
                autoComplete="off"
                maxLength={8}
                onChange={(event) => setCaptchaCode(event.target.value.toUpperCase())}
                placeholder="输入图中字符"
                required
                size="large"
                value={captchaCode}
              />
              <button
                aria-label="刷新验证码"
                className="auth-captcha-image"
                disabled={captchaLoading}
                onClick={refreshCaptcha}
                title="看不清，换一张"
                type="button"
              >
                {captcha ? (
                  <Image
                    alt="随机验证码"
                    height={52}
                    src={captcha.image_data_url}
                    unoptimized
                    width={160}
                  />
                ) : (
                  <RefreshCw size={18} />
                )}
              </button>
            </div>
          </label>

          <Button
            block
            disabled={!captcha}
            htmlType="submit"
            loading={submitting}
            size="large"
            type="primary"
          >
            {mode === 'login' ? '登录账号' : '创建账号'}
          </Button>
        </form>
      </Modal>
    </>
  );
}
