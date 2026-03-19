import { contextBridge, ipcRenderer } from 'electron';

// 暴露安全的 API 给渲染进程
contextBridge.exposeInMainWorld('electronAPI', {
  // 平台信息
  platform: process.platform,
  
  // 应用版本
  getVersion: () => ipcRenderer.invoke('get-version'),
  
  // 文件对话框
  showOpenDialog: (options: any) => ipcRenderer.invoke('show-open-dialog', options),
  showSaveDialog: (options: any) => ipcRenderer.invoke('show-save-dialog', options),
  
  // 系统事件
  onUpdateAvailable: (callback: (info: any) => void) => {
    ipcRenderer.on('update-available', (_, info) => callback(info));
  },
  
  // 清理监听器
  removeAllListeners: (channel: string) => {
    ipcRenderer.removeAllListeners(channel);
  }
});

// 类型声明
declare global {
  interface Window {
    electronAPI: {
      platform: NodeJS.Platform;
      getVersion: () => Promise<string>;
      showOpenDialog: (options: any) => Promise<any>;
      showSaveDialog: (options: any) => Promise<any>;
      onUpdateAvailable: (callback: (info: any) => void) => void;
      removeAllListeners: (channel: string) => void;
    };
  }
}
