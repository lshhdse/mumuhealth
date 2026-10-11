export const colorModes = [
  { id: 'system', name: '跟随系统', icon: 'palette' },
  { id: 'light', name: '浅色', icon: 'sun' },
  { id: 'dark', name: '深色', icon: 'moon' }
];
export const colorModeId = value => colorModes.some(mode => mode.id === value) ? value : 'system';
export function resolvedColorMode(value, systemDark) {
  return colorModeId(value) === 'system' ? (systemDark ? 'dark' : 'light') : value;
}
