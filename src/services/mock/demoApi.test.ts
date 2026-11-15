import { describe, expect, it } from 'vitest';
import { createDemoApi } from './demoApi';

describe('źródło danych demonstracyjnych', () => {
  it('potwierdza alarm i zachowuje zmianę', async () => {
    const api = createDemoApi({ delayMs: 0 });
    const active = (await api.getAlarms()).find((alarm) => alarm.status === 'active')!;

    const updated = await api.acknowledgeAlarm(active.id);
    expect(updated.status).toBe('acknowledged');
    expect(updated.acknowledgedAt).toBeDefined();
    expect((await api.getAlarms()).find((alarm) => alarm.id === active.id)?.status).toBe('acknowledged');
  });

  it('odrzuca potwierdzenie nieistniejącego alarmu', async () => {
    await expect(createDemoApi({ delayMs: 0 }).acknowledgeAlarm('brak')).rejects.toMatchObject({ status: 404 });
  });

  it('filtruje zdarzenia według kategorii, zakresu dat i limitu', async () => {
    const api = createDemoApi({ delayMs: 0 });
    const all = await api.getEvents();
    const doors = await api.getEvents({ category: 'door' });
    expect(doors.length).toBeGreaterThan(0);
    expect(doors.every((event) => event.category === 'door')).toBe(true);

    const from = new Date(Date.now() - 3_600_000).toISOString();
    const recent = await api.getEvents({ from });
    expect(recent.length).toBeLessThan(all.length);
    expect(recent.every((event) => event.occurredAt >= from)).toBe(true);
    expect(await api.getEvents({ limit: 3 })).toHaveLength(3);
  });

  it('zmienia tryb uzbrojenia', async () => {
    const api = createDemoApi({ delayMs: 0 });
    await api.setArmingMode('armed_away');
    expect((await api.getSystemStatus()).alarmSystem.mode).toBe('armed_away');
  });
});
