import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DashboardFeedbackWidget } from '../DashboardFeedbackWidget';
import { usePathname } from 'next/navigation';

// Mock lucide-react
jest.mock('lucide-react', () => ({
  MessageSquare: () => <div data-testid="icon-message-square" />,
  X: () => <div data-testid="icon-x" />,
  Send: () => <div data-testid="icon-send" />,
  Bug: () => <div data-testid="icon-bug" />,
  Lightbulb: () => <div data-testid="icon-lightbulb" />,
  MessageCircle: () => <div data-testid="icon-message-circle" />,
}));

// Mock next/navigation
jest.mock('next/navigation', () => ({
  usePathname: jest.fn(),
}));

// Mock fetch
const mockFetch = jest.fn(() =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve({}),
  })
) as jest.Mock;
global.fetch = mockFetch;

describe('DashboardFeedbackWidget', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv, NEXT_PUBLIC_API_URL: 'http://api.example.com' };
    mockFetch.mockClear();
    (usePathname as jest.Mock).mockReturnValue('/dashboard/current-page');
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('renders closed initially', () => {
    render(<DashboardFeedbackWidget />);
    expect(screen.getByText('Feedback')).toBeInTheDocument();
    expect(screen.queryByText('Send Feedback')).not.toBeInTheDocument();
  });

  it('opens on click', () => {
    render(<DashboardFeedbackWidget />);
    fireEvent.click(screen.getByText('Feedback'));
    expect(screen.getByRole('button', { name: 'Send Feedback' })).toBeInTheDocument();
  });

  it('submits feedback successfully', async () => {
    render(<DashboardFeedbackWidget />);
    fireEvent.click(screen.getByText('Feedback'));

    const textarea = screen.getByPlaceholderText('Tell us what you think...');
    const emailInput = screen.getByPlaceholderText('Email (optional)');
    const submitButton = screen.getByRole('button', { name: 'Send Feedback' });

    fireEvent.change(textarea, { target: { value: 'Great dashboard!' } });
    fireEvent.change(emailInput, { target: { value: 'user@example.com' } });

    // Select 'Idea' (Lightbulb)
    const ideaButton = screen.getByTestId('icon-lightbulb').closest('button');
    fireEvent.click(ideaButton!);

    fireEvent.click(submitButton);

    expect(screen.getByText('Sending...')).toBeInTheDocument();

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        'http://api.example.com/feedback',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            type: 'feature',
            message: 'Great dashboard!',
            email: 'user@example.com',
            page: '/dashboard/current-page',
          }),
        })
      );
    });

    await waitFor(() => {
      expect(screen.getByText('Thanks for your feedback!')).toBeInTheDocument();
    });
  });

  it('handles submission error', async () => {
    mockFetch.mockImplementationOnce(() =>
      Promise.resolve({
        ok: false,
        json: () => Promise.resolve({ error: 'Failed' }),
      })
    );

    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    render(<DashboardFeedbackWidget />);
    fireEvent.click(screen.getByText('Feedback'));

    const textarea = screen.getByPlaceholderText('Tell us what you think...');
    fireEvent.change(textarea, { target: { value: 'Error test' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send Feedback' }));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Send Feedback' })).toBeInTheDocument();
      expect(screen.queryByText('Thanks for your feedback!')).not.toBeInTheDocument();
    });

    consoleSpy.mockRestore();
  });

  it('validates empty feedback', () => {
    render(<DashboardFeedbackWidget />);
    fireEvent.click(screen.getByText('Feedback'));

    const submitButton = screen.getByRole('button', { name: 'Send Feedback' });
    fireEvent.click(submitButton);

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('switches feedback type', () => {
    render(<DashboardFeedbackWidget />);
    fireEvent.click(screen.getByText('Feedback'));

    // Default is 'other'
    const otherButton = screen.getByTestId('icon-message-circle').closest('button');
    expect(otherButton).toHaveClass('border-gray-500'); // Check for active styles based on implementation

    const bugButton = screen.getByTestId('icon-bug').closest('button');
    fireEvent.click(bugButton!);

    expect(bugButton).toHaveClass('border-red-500');
    expect(otherButton).not.toHaveClass('border-gray-500'); // Should lose active class
  });
});
