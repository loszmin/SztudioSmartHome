import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter } from 'react-router-dom';
import { App } from '@/app/App';
import { routes } from '@/app/routes';

/** Renderuje całą aplikację (router + zapytania) pod wskazaną ścieżką. */
export function renderApp(path = '/') {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const user = userEvent.setup();
  return { user, router, ...render(<App router={router} />) };
}
