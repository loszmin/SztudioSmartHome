import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/services/api/httpClient';
import { SegmentedControl } from './SegmentedControl';
import { SignalBars, signalLevel } from './SignalBars';
import { ErrorState } from './StateViews';
import { ConnectionBadge, SeverityBadge } from './Status';

describe('komponenty wspólne', () => {
  it('ConnectionBadge i SeverityBadge pokazują czytelne etykiety', () => {
    render(
      <>
        <ConnectionBadge status="online" />
        <ConnectionBadge status="offline" />
        <SeverityBadge severity="critical" />
      </>,
    );
    expect(screen.getByText('Online')).toBeInTheDocument();
    expect(screen.getByText('Offline')).toBeInTheDocument();
    expect(screen.getByText('Krytyczny')).toBeInTheDocument();
  });

  it('SignalBars mapuje jakość na poziomy i opis', () => {
    expect([null, 10, 50, 70, 95].map(signalLevel)).toEqual([0, 1, 2, 3, 4]);
    render(<SignalBars quality={null} />);
    expect(screen.getByRole('img', { name: /brak sygnału/i })).toBeInTheDocument();
  });

  it('SegmentedControl zgłasza wybór i oznacza aktywną opcję', async () => {
    const onChange = vi.fn();
    render(
      <SegmentedControl
        label="Układ"
        value="a"
        onChange={onChange}
        options={[{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }]}
      />,
    );
    expect(screen.getByRole('button', { name: 'A' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(screen.getByRole('button', { name: 'B' }));
    expect(onChange).toHaveBeenCalledWith('b');
  });

  it('ErrorState pokazuje komunikat błędu i pozwala ponowić', async () => {
    const onRetry = vi.fn();
    render(
      <MemoryRouter>
        <ErrorState error={new ApiError('network', 'Brak połączenia z Sztudio Core.')} onRetry={onRetry} />
      </MemoryRouter>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Brak połączenia z Sztudio Core.');
    await userEvent.click(screen.getByRole('button', { name: 'Spróbuj ponownie' }));
    expect(onRetry).toHaveBeenCalledOnce();
    expect(screen.getByRole('link', { name: /Ustawienia połączenia/ })).toHaveAttribute('href', '/ustawienia');
  });
});
