export function formatMessageTime(date, timeZone = 'Asia/Manila') {
  return new Date(date).toLocaleTimeString('en-PH', { timeZone, hour: '2-digit', minute: '2-digit', hour12: true });
}

export function messageTimeAgo(date, now = Date.now(), timeZone = 'Asia/Manila') {
  const seconds = Math.max(0, Math.floor((now - new Date(date).getTime()) / 1000));
  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return new Date(date).toLocaleDateString('en-PH', { timeZone });
}
