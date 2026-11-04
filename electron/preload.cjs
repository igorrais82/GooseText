const { contextBridge, ipcRenderer, shell } = require('electron');

/**
 * Мост между окном и системой: признак desktop-режима, версия, платформа,
 * полный экран, кнопки окна, системная диктовка и внешние ссылки.
 */
contextBridge.exposeInMainWorld('goosetext', {
  isDesktop: true,
  platform: process.platform,
  version: process.versions.electron,
  openExternal: (url) => {
    if (typeof url === 'string' && url.startsWith('http')) return shell.openExternal(url);
    return Promise.resolve();
  },
  toggleFullscreen: () => ipcRenderer.invoke('goosetext:toggle-fullscreen'),
  getFullscreen: () => ipcRenderer.invoke('goosetext:get-fullscreen'),
  onFullscreenChange: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const handler = (_event, value) => callback(Boolean(value));
    ipcRenderer.on('goosetext:fullscreen-changed', handler);
    return () => ipcRenderer.removeListener('goosetext:fullscreen-changed', handler);
  },
  minimizeWindow: () => ipcRenderer.send('goosetext:minimize'),
  toggleMaximizeWindow: () => ipcRenderer.invoke('goosetext:toggle-maximize'),
  isWindowMaximized: () => ipcRenderer.invoke('goosetext:is-maximized'),
  closeWindow: () => ipcRenderer.send('goosetext:close'),
  onMaximizedChange: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const handler = (_event, value) => callback(Boolean(value));
    ipcRenderer.on('goosetext:maximized-changed', handler);
    return () => ipcRenderer.removeListener('goosetext:maximized-changed', handler);
  },
  getModelBase: () => ipcRenderer.invoke('goosetext:model-base'),
  setBackgroundColor: (color) => ipcRenderer.send('goosetext:set-background', color),
});
