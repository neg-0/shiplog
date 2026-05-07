import RegisterPage from './page';
import { redirect } from 'next/navigation';

jest.mock('next/navigation', () => ({
  redirect: jest.fn(),
}));

describe('RegisterPage', () => {
  it('redirects legacy register traffic to login', () => {
    RegisterPage();

    expect(redirect).toHaveBeenCalledWith('/login');
  });
});
