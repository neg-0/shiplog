import { render, screen, fireEvent } from '@testing-library/react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, ConfirmDialog, AlertDialog } from '../Dialog';

// Mock lucide-react
jest.mock('lucide-react', () => ({
  X: () => <div data-testid="icon-x" />,
}));

describe('Dialog', () => {
  it('renders children when open', () => {
    render(
      <Dialog open={true} onOpenChange={() => {}}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Dialog Title</DialogTitle>
            <DialogDescription>Dialog Description</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button>Footer Button</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );

    expect(screen.getByText('Dialog Title')).toBeInTheDocument();
    expect(screen.getByText('Dialog Description')).toBeInTheDocument();
    expect(screen.getByText('Footer Button')).toBeInTheDocument();
    expect(screen.getByTestId('icon-x')).toBeInTheDocument();
  });

  it('does not render when closed', () => {
    render(
      <Dialog open={false} onOpenChange={() => {}}>
        <DialogContent>
          <DialogTitle>Dialog Title</DialogTitle>
        </DialogContent>
      </Dialog>
    );

    expect(screen.queryByText('Dialog Title')).not.toBeInTheDocument();
  });

  it('calls onOpenChange when close button is clicked', () => {
    const handleOpenChange = jest.fn();
    render(
      <Dialog open={true} onOpenChange={handleOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Dialog Title</DialogTitle>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    );

    const closeButton = screen.getByTestId('icon-x').closest('button');
    fireEvent.click(closeButton!);

    expect(handleOpenChange).toHaveBeenCalledWith(false);
  });

  it('calls onOpenChange when overlay is clicked', () => {
    const handleOpenChange = jest.fn();
    const { container } = render(
      <Dialog open={true} onOpenChange={handleOpenChange}>
        <DialogContent>
          <DialogTitle>Dialog Title</DialogTitle>
        </DialogContent>
      </Dialog>
    );

    // Overlay is the div with bg-black/50
    const overlay = container.querySelector('.bg-black\\/50');
    fireEvent.click(overlay!);

    expect(handleOpenChange).toHaveBeenCalledWith(false);
  });
});

describe('ConfirmDialog', () => {
  const defaultProps = {
    isOpen: true,
    onClose: jest.fn(),
    onConfirm: jest.fn(),
    title: 'Confirm Title',
    message: 'Confirm Message',
  };

  it('renders correctly', () => {
    render(<ConfirmDialog {...defaultProps} />);

    expect(screen.getByText('Confirm Title')).toBeInTheDocument();
    expect(screen.getByText('Confirm Message')).toBeInTheDocument();
    expect(screen.getByText('Confirm')).toBeInTheDocument();
    expect(screen.getByText('Cancel')).toBeInTheDocument();
  });

  it('calls onClose when Cancel is clicked', () => {
    render(<ConfirmDialog {...defaultProps} />);

    fireEvent.click(screen.getByText('Cancel'));
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it('calls onConfirm when Confirm is clicked', () => {
    render(<ConfirmDialog {...defaultProps} />);

    fireEvent.click(screen.getByText('Confirm'));
    expect(defaultProps.onConfirm).toHaveBeenCalled();
  });

  it('shows loading state', () => {
    render(<ConfirmDialog {...defaultProps} loading={true} />);

    const confirmButton = screen.getByText('Confirm').closest('button');
    expect(confirmButton).toBeDisabled();
    // Assuming spinner is an svg, maybe check for that or check disabled state
  });
});

describe('AlertDialog', () => {
  const defaultProps = {
    isOpen: true,
    onClose: jest.fn(),
    title: 'Alert Title',
    message: 'Alert Message',
  };

  it('renders correctly', () => {
    render(<AlertDialog {...defaultProps} />);

    expect(screen.getByText('Alert Title')).toBeInTheDocument();
    expect(screen.getByText('Alert Message')).toBeInTheDocument();
    expect(screen.getByText('OK')).toBeInTheDocument();
  });

  it('calls onClose when OK is clicked', () => {
    render(<AlertDialog {...defaultProps} />);

    fireEvent.click(screen.getByText('OK'));
    expect(defaultProps.onClose).toHaveBeenCalled();
  });
});
