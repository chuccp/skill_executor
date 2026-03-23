/**
 * 平台检测工具
 */

import * as os from 'os';
import * as path from 'path';

export const platform = {
  isWindows: process.platform === 'win32',
  isMac: process.platform === 'darwin',
  isLinux: process.platform === 'linux',
  name: process.platform,
  homeDir: os.homedir(),
  pathSeparator: path.sep
};