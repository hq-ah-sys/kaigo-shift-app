/**
 * File System Storage & Backup Utility
 * Supports File System Access API with fallback to Modal & File Input
 */

/**
 * Trigger browser file download
 */
export function downloadFile(fileName: string, content: string): void {
  const blob = new Blob([content], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 300);
}

/**
 * Save data with native OS Save File Picker dialog.
 * If the browser environment (e.g., cross-origin iframe) restricts the File System Access API,
 * this function throws an error with code 'OS_PICKER_RESTRICTED' so the UI can present an in-app dialog.
 */
export async function saveStateWithNativeDialog(
  fileName: string,
  content: string
): Promise<{ success: boolean; fileName: string }> {
  if (typeof (window as any).showSaveFilePicker === 'function') {
    try {
      const opts: any = {
        suggestedName: fileName,
        types: [
          {
            description: '介護シフトデータファイル (.json)',
            accept: { 'application/json': ['.json'] },
          },
        ],
      };
      const fileHandle = await (window as any).showSaveFilePicker(opts);
      const writable = await fileHandle.createWritable();
      await writable.write(content);
      await writable.close();
      return {
        success: true,
        fileName: fileHandle.name || fileName,
      };
    } catch (err: any) {
      if (err.name === 'AbortError') {
        throw err; // User explicitly cancelled the OS dialog
      }
      console.warn('showSaveFilePicker failed (iframe security restriction or unsupported):', err);
      const error = new Error('OS_PICKER_RESTRICTED');
      (error as any).cause = err;
      throw error;
    }
  }

  throw new Error('OS_PICKER_NOT_SUPPORTED');
}

/**
 * Open file picker dialog every time, defaulting to .json files
 */
export async function pickFileToRead(): Promise<{ fileName: string; content: string } | null> {
  // Method 1: showOpenFilePicker if supported and allowed
  if (typeof (window as any).showOpenFilePicker === 'function') {
    try {
      const opts: any = {
        types: [
          {
            description: '介護シフトバックアップファイル (.json)',
            accept: { 'application/json': ['.json'] },
          },
        ],
        multiple: false,
      };
      const [handle] = await (window as any).showOpenFilePicker(opts);
      if (handle) {
        const file = await handle.getFile();
        const text = await file.text();
        return { fileName: file.name, content: text };
      }
      return null;
    } catch (err: any) {
      if (err.name === 'AbortError') {
        return null; // User cancelled
      }
      console.warn('showOpenFilePicker failed, falling back to input element:', err);
    }
  }

  // Method 2: Standard HTML input element (always prompts native OS file open dialog)
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.style.display = 'none';

    let resolved = false;

    input.onchange = async () => {
      resolved = true;
      const file = input.files?.[0];
      if (file) {
        try {
          const text = await file.text();
          resolve({ fileName: file.name, content: text });
        } catch {
          resolve(null);
        }
      } else {
        resolve(null);
      }
      if (input.parentNode) {
        document.body.removeChild(input);
      }
    };

    input.oncancel = () => {
      resolved = true;
      resolve(null);
      if (input.parentNode) {
        document.body.removeChild(input);
      }
    };

    window.addEventListener(
      'focus',
      () => {
        setTimeout(() => {
          if (!resolved) {
            resolved = true;
            resolve(null);
            if (input.parentNode) {
              document.body.removeChild(input);
            }
          }
        }, 1000);
      },
      { once: true }
    );

    document.body.appendChild(input);
    input.click();
  });
}
