import path from 'path';

const dataDir = process.env.DATA_DIR || './data';

export function getUploadPath(type: string, filename: string): string {
  const timestamp = Date.now();
  return path.join(dataDir, 'uploads', type, `${timestamp}-${filename}`);
}

export function getRelativeUploadPath(type: string, filename: string): string {
  const timestamp = Date.now();
  return path.join('uploads', type, `${timestamp}-${filename}`);
}

export function getAssetPath(type: 'logo' | 'background' | 'free-image', filename: string): string {
  return getUploadPath(`assets/${type}`, filename);
}

export function getFontPath(filename: string): string {
  return getUploadPath('fonts', filename);
}

export function getDataDir(): string {
  return dataDir;
}
