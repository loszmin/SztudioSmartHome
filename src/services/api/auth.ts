import type { LoginResponse } from '@/types/api';
import { API_PATHS } from './endpoints';
import { ApiError, createHttpClient } from './httpClient';

/** Loguje użytkownika w Sztudio Core i zwraca token dostępu. */
export async function login(baseUrl: string, username: string, password: string): Promise<LoginResponse> {
  const request = createHttpClient({ baseUrl });
  try {
    return await request<LoginResponse>(API_PATHS.authLogin, { method: 'POST', body: { username, password } });
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      throw new ApiError('http', 'Nieprawidłowy login lub hasło.', 401);
    }
    if (error instanceof ApiError && error.status === 429) {
      throw new ApiError('http', 'Zbyt wiele nieudanych prób logowania. Spróbuj ponownie za chwilę.', 429);
    }
    throw error;
  }
}
