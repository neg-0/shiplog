import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { FeedbackWidget } from '../FeedbackWidget';

// Mock lucide-react
jest.mock('lucide-react', () => ({
  MessageSquare: () => <div data-testid="icon-message-square" />,
  X: () => <div data-testid="icon-x" />,
  Send: () => <div data-testid="icon-send" />,
}));

// Mock fetch
const mockFetch = jest.fn(() =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve({}),
  })
) as jest.Mock;
global.fetch = mockFetch;

describe('FeedbackWidget', () => {
  const defaultProps = {
    repoId: '123',
    repoName: 'test-repo',
  };

  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv, NEXT_PUBLIC_API_URL: 'http://api.example.com' };
    mockFetch.mockClear();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('renders closed initially', () => {
    render(<FeedbackWidget {...defaultProps} />);
    expect(screen.getByText('Feedback')).toBeInTheDocument();
    expect(screen.queryByText('Feedback for test-repo')).not.toBeInTheDocument();
  });

  it('opens on click', () => {
    render(<FeedbackWidget {...defaultProps} />);
    fireEvent.click(screen.getByText('Feedback'));
    expect(screen.getByText('Feedback for test-repo')).toBeInTheDocument();
  });

  it('submits feedback successfully', async () => {
    render(<FeedbackWidget {...defaultProps} />);

    // Open widget
    fireEvent.click(screen.getByText('Feedback'));

    const textarea = screen.getByPlaceholderText('What can we improve?');
    const emailInput = screen.getByPlaceholderText('you@example.com');
    const submitButton = screen.getByText('Send Feedback');

    fireEvent.change(textarea, { target: { value: 'Great tool!' } });
    fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
    fireEvent.click(submitButton);

    expect(screen.getByText('Sending...')).toBeInTheDocument();

    await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
            'http://api.example.com/public/feedback',
            expect.objectContaining({
                method: 'POST',
                body: JSON.stringify({
                    repoId: '123',
                    feedback: 'Great tool!',
                    email: 'test@example.com',
                    source: 'widget',
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

    render(<FeedbackWidget {...defaultProps} />);
    fireEvent.click(screen.getByText('Feedback'));

    const textarea = screen.getByPlaceholderText('What can we improve?');
    fireEvent.change(textarea, { target: { value: 'Error test' } });
    fireEvent.click(screen.getByText('Send Feedback'));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled();
    });

    // Should still show form (error handling just logs to console currently)
    await waitFor(() => {
      expect(screen.getByText('Send Feedback')).toBeInTheDocument();
      expect(screen.queryByText('Thanks for your feedback!')).not.toBeInTheDocument();
    });

    consoleSpy.mockRestore();
  });

  it('validates empty feedback', () => {
    render(<FeedbackWidget {...defaultProps} />);
    fireEvent.click(screen.getByText('Feedback'));

    const submitButton = screen.getByText('Send Feedback');
    fireEvent.click(submitButton);

    expect(mockFetch).not.toHaveBeenCalled();
  });
});
