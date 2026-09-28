"use client";

import { toast } from '@lobehub/ui';
import { Camera, LoaderCircle, UserRound } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChangeEvent, useEffect, useRef, useState } from 'react';
import {
  prepareAvatar,
  profileService,
  USER_AVATAR_UPDATED_EVENT,
} from '@/services/profile';

export function UserAvatarUpload({ label = '我的空间' }: { label?: string }) {
  const pathname = usePathname();
  const inputRef = useRef<HTMLInputElement>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    let active = true;
    void profileService.getProfile()
      .then((profile) => {
        if (active) setAvatarUrl(profile.avatar_url);
      })
      .catch(() => {
        if (active) setAvatarUrl(null);
      });
    return () => {
      active = false;
    };
  }, []);

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    try {
      setUploading(true);
      const dataUrl = await prepareAvatar(file);
      const profile = await profileService.uploadAvatar(dataUrl);
      setAvatarUrl(profile.avatar_url);
      window.dispatchEvent(
        new CustomEvent(USER_AVATAR_UPDATED_EVENT, { detail: profile.avatar_url }),
      );
      toast.success({ title: '头像已更新', description: '新头像已保存到服务器。' });
    } catch (error) {
      toast.error({
        title: '头像上传失败',
        description: error instanceof Error ? error.message : '请稍后重试',
      });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="site-header__profile-control">
      <button
        aria-label="上传新头像"
        className="site-header__avatar-button"
        disabled={uploading}
        onClick={() => inputRef.current?.click()}
        title="更换头像"
        type="button"
      >
        {avatarUrl ? (
          <Image
            alt="我的头像"
            className="site-header__avatar-image"
            height={34}
            src={avatarUrl}
            unoptimized
            width={34}
          />
        ) : (
          <UserRound aria-hidden="true" size={18} />
        )}
        <span aria-hidden="true" className="site-header__avatar-badge">
          {uploading ? <LoaderCircle size={10} /> : <Camera size={10} />}
        </span>
      </button>
      <input
        ref={inputRef}
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="site-header__avatar-input"
        onChange={handleFileChange}
        type="file"
      />
      <Link
        aria-current={pathname.startsWith('/personal') ? 'page' : undefined}
        className={
          pathname.startsWith('/personal')
            ? 'site-header__profile-link active'
            : 'site-header__profile-link'
        }
        href="/personal"
      >
        {label}
      </Link>
    </div>
  );
}
