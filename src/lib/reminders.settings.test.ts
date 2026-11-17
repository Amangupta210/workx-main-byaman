import { describe, it, expect, beforeEach, vi } from 'vitest';
import 'fake-indexeddb/auto';

import {
  getDefaultReminderMins,
  setDefaultReminderMins,
  subscribeDefaultReminderMins,
  getPermissionStatus,
  rerequestPermission,
  subscribePermission,
} from './reminders';

function mockNotification(permission: NotificationPermission, requestResult?: NotificationPermission) {
  const N = function () {} as unknown as typeof Notification & { permission: NotificationPermission };
  Object.defineProperty(N, 'permission', { value: permission, configurable: true });
  (N as any).requestPermission = vi.fn(async () => requestResult ?? permission);
  (globalThis as any).Notification = N;
  return N;
}

describe('reminder settings + permission flow', () => {
  beforeEach(() => {
    localStorage.clear();
    delete (globalThis as any).Notification;
  });

  it('defaults to 10 minutes before due', () => {
    expect(getDefaultReminderMins()).toBe(10);
  });

  it('persists and clamps the default lead time', () => {
    setDefaultReminderMins(45);
    expect(getDefaultReminderMins()).toBe(45);
    setDefaultReminderMins(-5);
    expect(getDefaultReminderMins()).toBe(0);
    setDefaultReminderMins(99999);
    expect(getDefaultReminderMins()).toBe(1440);
  });

  it('notifies subscribers when the default changes', () => {
    const seen: number[] = [];
    const off = subscribeDefaultReminderMins((m) => seen.push(m));
    setDefaultReminderMins(30);
    off();
    setDefaultReminderMins(5);
    expect(seen).toEqual([10, 30]);
  });

  it('reports unsupported when Notification is missing', () => {
    expect(getPermissionStatus()).toBe('unsupported');
  });

  it('reports granted/denied/default status', () => {
    mockNotification('granted');
    expect(getPermissionStatus()).toBe('granted');
    mockNotification('denied');
    expect(getPermissionStatus()).toBe('denied');
    mockNotification('default');
    expect(getPermissionStatus()).toBe('default');
  });

  it('emits current status immediately to permission subscribers', () => {
    mockNotification('granted');
    const seen: string[] = [];
    const off = subscribePermission((s) => seen.push(s));
    off();
    expect(seen).toEqual(['granted']);
  });

  it('re-request grants permission from the unknown state', async () => {
    const N = mockNotification('default', 'granted');
    const r = await rerequestPermission();
    expect((N as any).requestPermission).toHaveBeenCalled();
    expect(r.status).toBe('granted');
    expect(r.needsManual).toBe(false);
  });

  it('re-request from denied flags that manual unblocking is needed', async () => {
    mockNotification('denied');
    const r = await rerequestPermission();
    expect(r.status).toBe('denied');
    expect(r.needsManual).toBe(true);
  });

  it('re-request is a no-op when already granted', async () => {
    const N = mockNotification('granted');
    const r = await rerequestPermission();
    expect(r.status).toBe('granted');
    expect(r.needsManual).toBe(false);
    expect((N as any).requestPermission).not.toHaveBeenCalled();
  });
});
