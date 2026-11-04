import { isAndroidApp } from './platform';

export type SaveResult = 'download' | 'shared';

/**
 * Сохраняет файл.
 *
 * В браузере и в Windows-приложении — обычное скачивание. В Android-приложении
 * WebView не умеет скачивать `blob:`-ссылки, поэтому файл пишется во временную
 * папку и открывается системное окно «Поделиться»: оттуда его можно сохранить
 * в «Загрузки», отправить в мессенджер или открыть в другом приложении.
 */
export async function saveFile(data: Blob | string, filename: string): Promise<SaveResult> {
  const blob = await toBlob(data);

  if (isAndroidApp) {
    const shared = await saveViaAndroid(blob, filename);
    if (shared) return 'shared';
  }

  downloadBlob(blob, filename);
  return 'download';
}

async function toBlob(data: Blob | string): Promise<Blob> {
  if (typeof data !== 'string') return data;
  const response = await fetch(data);
  return await response.blob();
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 5000);
}

async function saveViaAndroid(blob: Blob, filename: string): Promise<boolean> {
  try {
    const { Filesystem, Directory } = await import('@capacitor/filesystem');
    const { Share } = await import('@capacitor/share');
    const written = await Filesystem.writeFile({
      path: filename,
      data: await blobToBase64(blob),
      directory: Directory.Cache,
      recursive: true,
    });
    const canShare = await Share.canShare();
    if (!canShare.value) return false;
    await Share.share({
      title: filename,
      text: filename,
      url: written.uri,
      dialogTitle: 'Сохранить файл',
    });
    return true;
  } catch (error) {
    console.warn('Android: не удалось поделиться файлом, пробую скачивание', error);
    return false;
  }
}

async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const chunk = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}
