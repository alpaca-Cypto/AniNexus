import { request } from './client';

export const USER_AVATAR_UPDATED_EVENT = 'aninexus:user-avatar-updated';

export interface LocalUserProfile {
  user_id: number;
  avatar_url: string | null;
}

export const profileService = {
  getProfile: () => request<LocalUserProfile>('/profile'),
  uploadAvatar: (dataUrl: string) =>
    request<LocalUserProfile>('/profile/avatar', {
      method: 'PUT',
      body: JSON.stringify({ data_url: dataUrl }),
    }),
};

export async function prepareAvatar(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('请选择图片文件');
  if (file.size > 10 * 1024 * 1024) throw new Error('原图不能超过 10 MB');

  const bitmap = await createImageBitmap(file);
  const size = Math.min(512, bitmap.width, bitmap.height);
  const sourceSize = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) {
    bitmap.close();
    throw new Error('当前浏览器无法处理图片');
  }
  context.drawImage(
    bitmap,
    (bitmap.width - sourceSize) / 2,
    (bitmap.height - sourceSize) / 2,
    sourceSize,
    sourceSize,
    0,
    0,
    size,
    size,
  );
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/webp', 0.88),
  );
  if (!blob) throw new Error('头像压缩失败');
  if (blob.size > 2 * 1024 * 1024) throw new Error('压缩后的头像不能超过 2 MB');

  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('头像读取失败'));
    reader.readAsDataURL(blob);
  });
}
