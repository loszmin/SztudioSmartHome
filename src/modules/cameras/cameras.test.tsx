import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createDemoDatabase } from '@/services/mock/demoData';
import { useSettingsStore } from '@/stores/settingsStore';
import { CameraGrid } from './CameraGrid';
import { CameraTile } from './CameraTile';
import { pageCount, pageOf, pageSlots } from './layouts';

const { cameras } = createDemoDatabase();
const online = cameras.find((camera) => camera.status === 'online')!;
const offline = cameras.find((camera) => camera.status === 'offline')!;

describe('układy monitoringu', () => {
  it('dzieli kamery na strony i uzupełnia puste sloty', () => {
    expect(pageCount(8, 4)).toBe(2);
    expect(pageCount(8, 9)).toBe(1);
    expect(pageCount(0, 4)).toBe(1);
    expect(pageOf(5, 4)).toBe(1);
    expect(pageSlots([1, 2, 3, 4, 5], 4, 1)).toEqual([5, null, null, null]);
  });

  it.each([1, 4, 6, 9] as const)('siatka %i pokazuje właściwą liczbę slotów', (layout) => {
    render(<CameraGrid layout={layout} slots={pageSlots(cameras, layout, 0)} />);
    const tiles = screen.getAllByRole('article');
    const empty = screen.queryAllByText('Wolny slot');
    expect(tiles.length + empty.length).toBe(layout);
    expect(tiles.length).toBe(Math.min(layout, cameras.length));
  });
});

describe('kafel kamery', () => {
  it('w trybie demo nie symuluje obrazu', () => {
    render(<CameraTile camera={online} controls />);
    const tile = screen.getByRole('article', { name: `Kamera ${online.name}` });
    expect(tile).toHaveAttribute('data-state', 'demo');
    expect(screen.getByText('Podgląd demonstracyjny')).toBeInTheDocument();
    expect(tile.querySelector('video')).toBeNull();
    expect(screen.getByRole('button', { name: /Zapisz migawkę/ })).toBeDisabled();
  });

  it('pokazuje stan offline kamery', () => {
    useSettingsStore.setState({ mode: 'live' });
    render(<CameraTile camera={offline} />);
    expect(screen.getByRole('article')).toHaveAttribute('data-state', 'offline');
    expect(screen.getByText('Kamera offline')).toBeInTheDocument();
  });

  it('w trybie live zgłasza błąd strumienia, gdy WebRTC jest niedostępne', async () => {
    useSettingsStore.setState({ mode: 'live' });
    render(<CameraTile camera={online} />);
    expect(await screen.findByText('Brak obrazu')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ponów' })).toBeInTheDocument();
  });
});
